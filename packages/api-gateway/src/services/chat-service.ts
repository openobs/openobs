import { randomUUID } from 'crypto';
import { createLogger } from '@agentic-obs/common';
import type { DashboardSseEvent } from '@agentic-obs/common';
import { getSetupConfig } from '../routes/setup.js';
import { createLlmGateway } from '../routes/llm-factory.js';
import { DashboardOrchestratorAgent as OrchestratorAgent, shouldCompact, compactMessages, estimateTokens } from '@agentic-obs/agent-core';
import type { IDashboardAlertRuleStore as IAlertRuleStore, IDashboardInvestigationStore as IInvestigationStore } from '@agentic-obs/agent-core';
import { PrometheusMetricsAdapter } from '@agentic-obs/adapters';
import { resolvePrometheusDatasource } from './dashboard-service.js';
import type { IGatewayDashboardStore, IConversationStore } from '../repositories/types.js';
import type { IInvestigationReportRepository, IAlertRuleRepository, IGatewayInvestigationStore, IChatSessionRepository, IChatMessageRepository } from '@agentic-obs/data-layer';

const log = createLogger('chat-service');

/** Adapts data-layer IAlertRuleRepository to agent-core IAlertRuleStore. */
function toAlertRuleStore(repo: IAlertRuleRepository): IAlertRuleStore {
  return {
    create: (data) => repo.create(data as Parameters<IAlertRuleRepository['create']>[0]),
    update: repo.update ? (id, patch) => repo.update(id, patch as Parameters<IAlertRuleRepository['update']>[1]) : undefined,
    findAll: repo.findAll
      ? async () => {
          const result = await repo.findAll();
          return 'list' in result ? result.list : result;
        }
      : undefined,
    findById: repo.findById ? (id) => repo.findById(id) : undefined,
    delete: repo.delete ? (id) => repo.delete(id) : undefined,
  };
}

export interface ChatServiceDeps {
  dashboardStore: IGatewayDashboardStore;
  conversationStore: IConversationStore;
  investigationReportStore: IInvestigationReportRepository;
  alertRuleStore: IAlertRuleRepository;
  investigationStore?: IGatewayInvestigationStore;
  chatSessionStore?: IChatSessionRepository;
  chatMessageStore?: IChatMessageRepository;
}

export interface ChatSessionResult {
  sessionId: string;
  replyContent: string;
  assistantMessageId: string;
  navigate?: string;
}

export class ChatService {
  constructor(private deps: ChatServiceDeps) {}

  async handleMessage(
    message: string,
    sessionId: string | undefined,
    sendEvent: (event: DashboardSseEvent) => void,
    pageContext?: { kind: string; id?: string; timeRange?: string },
  ): Promise<ChatSessionResult> {
    const config = getSetupConfig();
    if (!config.llm) {
      throw new Error('LLM not configured - please complete the Setup Wizard first.');
    }

    const resolvedSessionId = sessionId ?? randomUUID();

    // Ensure a chat_sessions record exists for this session
    if (this.deps.chatSessionStore) {
      const existing = await this.deps.chatSessionStore.findById(resolvedSessionId);
      if (!existing) {
        await this.deps.chatSessionStore.create({ id: resolvedSessionId });
      }
    }

    // Persist the user message to chat_messages
    const userMsgId = randomUUID();
    if (this.deps.chatMessageStore) {
      await this.deps.chatMessageStore.addMessage(resolvedSessionId, {
        id: userMsgId,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });
    }

    const gateway = createLlmGateway(config.llm);
    const model = config.llm.model;
    const prom = resolvePrometheusDatasource(config.datasources);

    const metricsAdapter = prom
      ? new PrometheusMetricsAdapter(prom.url, prom.headers)
      : undefined;

    // Parse relative time range (e.g., "1h", "6h", "24h", "7d") to absolute start/end
    let timeRange: { start: string; end: string } | undefined;
    if (pageContext?.timeRange) {
      const now = new Date();
      const match = pageContext.timeRange.match(/^(\d+)([mhd])$/);
      if (match) {
        const amount = Number(match[1]);
        const unit = match[2];
        const ms = unit === 'm' ? amount * 60_000 : unit === 'h' ? amount * 3_600_000 : amount * 86_400_000;
        timeRange = { start: new Date(now.getTime() - ms).toISOString(), end: now.toISOString() };
      }
    }

    // Chat history is stored in chat_messages (independent of dashboards).
    // The orchestrator reads from conversationStore keyed by sessionId when
    // no dashboardId is scoped, so we pass chatMessageStore-backed adapter below.

    // --- Context compaction ---
    // Load existing summary from session, then check if we need to compact further
    let conversationSummary: string | undefined;
    if (this.deps.chatSessionStore) {
      const session = await this.deps.chatSessionStore.findById(resolvedSessionId);
      conversationSummary = session?.contextSummary || undefined;
    }

    // Check if chat history is large enough to warrant compaction
    if (this.deps.chatMessageStore) {
      const allMessages = await this.deps.chatMessageStore.getMessages(resolvedSessionId);
      const asCompletionMessages = allMessages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      // Estimate system prompt tokens (~4000 is a safe estimate for the static prompt)
      const systemPromptTokenEstimate = 4000;
      if (shouldCompact(systemPromptTokenEstimate, asCompletionMessages)) {
        log.info({ sessionId: resolvedSessionId, messageCount: allMessages.length }, 'compacting conversation context');
        const compacted = await compactMessages(gateway, model, asCompletionMessages);
        conversationSummary = compacted.summary || conversationSummary;

        // Persist summary for reuse in future turns
        if (conversationSummary && this.deps.chatSessionStore) {
          await this.deps.chatSessionStore.updateContextSummary(resolvedSessionId, conversationSummary);
        }
      }
    }

    // Route conversation history reads: if the key is a dashboardId, use
    // dashboard_messages (legacy). Otherwise use chat_messages (session mode).
    // Writes are no-ops here — chat-service persists messages directly.
    const chatMsgStore = this.deps.chatMessageStore;
    const dashboardStore = this.deps.dashboardStore;
    const baseConvStore = this.deps.conversationStore;
    const conversationStoreAdapter = chatMsgStore
      ? {
          getMessages: async (key: string) => {
            // Check if this is a dashboard ID (exists in dashboards table)
            const dash = await dashboardStore.findById(key);
            if (dash) {
              return baseConvStore.getMessages(key);
            }
            // Otherwise treat as sessionId — read from chat_messages
            return chatMsgStore.getMessages(key) as ReturnType<typeof baseConvStore.getMessages>;
          },
          addMessage: async () => { /* writes handled directly by chat-service */ },
          clearMessages: async () => { /* handled externally */ },
        }
      : baseConvStore;

    const orchestrator = new OrchestratorAgent({
      gateway,
      model,
      store: this.deps.dashboardStore,
      conversationStore: conversationStoreAdapter as typeof baseConvStore,
      investigationReportStore: this.deps.investigationReportStore,
      investigationStore: this.deps.investigationStore as IInvestigationStore | undefined,
      alertRuleStore: toAlertRuleStore(this.deps.alertRuleStore),
      metricsAdapter,
      allDatasources: config.datasources,
      sendEvent,
      timeRange,
      conversationSummary,
    }, resolvedSessionId);

    // If the user is viewing a specific dashboard, scope the agent to it
    const dashboardId = pageContext?.kind === 'dashboard' ? pageContext.id : undefined;

    log.info({ sessionId: resolvedSessionId, dashboardId, message: message.slice(0, 80) }, 'starting session orchestrator');
    const replyContent = await orchestrator.handleMessage(message, dashboardId);
    const assistantActions = orchestrator.consumeConversationActions();
    const navigate = orchestrator.consumeNavigate();
    log.info({ sessionId: resolvedSessionId, reply: replyContent.slice(0, 100) }, 'session orchestrator done');

    // Persist assistant response to chat_messages
    const assistantMessageId = randomUUID();
    if (this.deps.chatMessageStore) {
      await this.deps.chatMessageStore.addMessage(resolvedSessionId, {
        id: assistantMessageId,
        role: 'assistant',
        content: replyContent,
        actions: assistantActions.length > 0 ? assistantActions : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Update session title from first assistant message if title is empty
    if (this.deps.chatSessionStore) {
      const session = await this.deps.chatSessionStore.findById(resolvedSessionId);
      if (session && !session.title) {
        // Use first ~60 chars of user message as title
        const autoTitle = message.length > 60 ? message.slice(0, 57) + '...' : message;
        await this.deps.chatSessionStore.updateTitle(resolvedSessionId, autoTitle);
      }
    }

    return { sessionId: resolvedSessionId, replyContent, assistantMessageId, navigate };
  }
}
