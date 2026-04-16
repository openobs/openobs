import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiClient } from '../api/client.js';
import { fadeIn } from '../animations.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import { relativeTime } from '../utils/time.js';
import { useGlobalChat } from '../contexts/ChatContext.js';
import { groupEvents } from '../components/chat/event-processing.js';
import type { Block } from '../components/chat/event-processing.js';
import { UserMessage, AssistantMessage, ErrorMessage } from '../components/chat/MessageComponents.js';
import AgentActivityBlock from '../components/chat/AgentActivityBlock.js';
import { OpenObsLogo } from '../components/OpenObsLogo.js';

// Types

interface Dashboard {
  id: string;
  title: string;
  panels: unknown[];
  status: 'generating' | 'ready' | 'error';
  createdAt: string;
  updatedAt?: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

// Quick action cards

const QUICK_ACTIONS = [
  {
    category: 'Performance',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    colorClass: 'text-primary',
    prompt: 'Analyze CPU spike in checkout-service',
    label: '"Analyze CPU spike in checkout-service"',
  },
  {
    category: 'Dashboards',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-4" />
      </svg>
    ),
    colorClass: 'text-tertiary',
    prompt: 'Create a dashboard for http latency',
    label: '"Create a dashboard for http latency"',
  },
  {
    category: 'Incident',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    colorClass: 'text-error',
    prompt: 'Explain the recent 5xx error surge',
    label: '"Explain the recent 5xx error surge"',
  },
];

// Main

export default function Home() {
  const navigate = useNavigate();
  const globalChat = useGlobalChat();
  const { events, isGenerating, sendMessage, stopGeneration } = globalChat;

  const [input, setInput] = useState('');
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [deletingDashId, setDeletingDashId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasMessages = events.length > 0;

  const blocks = useMemo(() => groupEvents(events), [events]);
  const lastAgentBlockId = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i]!.type === 'agent') return (blocks[i] as Extract<Block, { type: 'agent' }>).id;
    }
    return null;
  }, [blocks]);

  // Home = new conversation entry point. Start a fresh session on mount
  // so user always gets a clean slate when clicking "Home".
  // Past conversations are accessible via the "Recent Conversations" section below.
  useEffect(() => {
    globalChat.startNewSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteDashboard = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/dashboards/${id}`);
    if (!res.error) {
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    }
  }, []);

  useEffect(() => {
    void apiClient.get<Dashboard[]>(`/dashboards?limit=6`).then((res) => {
      if (!res.error && Array.isArray(res.data)) setDashboards(res.data.slice(0, 6));
    });
  }, []);

  useEffect(() => {
    void apiClient.get<{ sessions: ChatSession[] }>('/chat/sessions?limit=10').then((res) => {
      if (!res.error && res.data?.sessions) setSessions(res.data.sessions);
    });
  }, []);


  // Auto-scroll on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    void sendMessage(trimmed);
    setInput('');
  }, [input, isGenerating, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (actionPrompt: string) => {
    void sendMessage(actionPrompt);
  };

  // Reusable input component (used in both modes)
  const inputArea = (
    <div className="relative group">
      {/* Ambient glow ring on focus */}
      <div className="absolute -inset-1 bg-gradient-to-r from-tertiary/20 via-primary/15 to-tertiary/20 rounded-[1.75rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your systems..."
          rows={1}
          disabled={isGenerating}
          className="w-full bg-surface-bright/95 backdrop-blur-xl ring-1 ring-white/10 focus:ring-tertiary/50 rounded-3xl py-5 pl-6 pr-16 text-[15px] text-on-surface placeholder-on-surface-variant/70 outline-none resize-none transition-all disabled:opacity-50 shadow-2xl shadow-black/40"
          style={{ minHeight: '64px', maxHeight: '220px' }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
          }}
        />
        {isGenerating && (
          <button
            type="button"
            onClick={stopGeneration}
            className="absolute right-14 bottom-4 w-9 h-9 rounded-xl bg-surface-highest hover:bg-error/20 text-on-surface-variant hover:text-error flex items-center justify-center transition-colors"
            title="Stop"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <rect x="5" y="5" width="10" height="10" rx="1" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isGenerating}
          className="absolute right-3 bottom-3.5 w-10 h-10 bg-gradient-to-br from-tertiary to-tertiary/80 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-tertiary/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:shadow-none"
          title="Send"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H3a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 011.414-1.414l4 4z" clipRule="evenodd" transform="rotate(-90 10 10)" />
          </svg>
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MODE 1: Initial state (no messages) — centered hero + input
  // ═══════════════════════════════════════════════════════════════
  if (!hasMessages) {
    return (
      <div className="relative h-full bg-surface-lowest overflow-y-auto">
        {/* Ambient background gradients */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-gradient-to-br from-tertiary/10 via-primary/5 to-transparent rounded-full blur-3xl opacity-60" />
          <div className="absolute top-1/3 -right-1/4 w-[600px] h-[600px] bg-gradient-to-bl from-primary/8 to-transparent rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-tertiary/8 to-transparent rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-16">
          <div className="w-full max-w-3xl">
            {/* Hero */}
            <motion.div
              className="text-center mb-12"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="relative inline-flex items-center justify-center mb-8">
                <div className="absolute inset-0 bg-tertiary/30 blur-2xl rounded-full scale-150" />
                <OpenObsLogo className="relative w-14 h-14 text-tertiary" size={56} />
              </div>
              <h1 className="font-[Manrope] text-5xl md:text-6xl font-extrabold tracking-tight mb-4 leading-[1.1]">
                <span className="bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-transparent">
                  What are we
                </span>
                <br />
                <span className="bg-gradient-to-r from-tertiary via-primary to-tertiary bg-clip-text text-transparent italic">
                  investigating
                </span>
                <span className="bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-transparent">
                  {' '}today?
                </span>
              </h1>
              <p className="text-on-surface-variant text-base md:text-lg max-w-xl mx-auto">
                Build dashboards, investigate issues, and create alerts — all through natural conversation.
              </p>
            </motion.div>

            {/* Input — centered under hero */}
            <motion.div
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.1 }}
            >
              {inputArea}
            </motion.div>

            {/* Quick action suggestions */}
            <motion.div
              className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
            >
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.category}
                  type="button"
                  onClick={() => handleQuickAction(action.prompt)}
                  className="group/action relative p-4 bg-surface-low/60 backdrop-blur-sm hover:bg-surface-high/80 border border-white/5 hover:border-white/10 rounded-2xl text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20"
                >
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-high/80 ${action.colorClass} mb-2.5 group-hover/action:scale-110 transition-transform`}>
                    {action.icon}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">
                    {action.category}
                  </div>
                  <div className="text-sm text-on-surface leading-snug line-clamp-2">
                    {action.prompt}
                  </div>
                </button>
              ))}
            </motion.div>
          </div>

          {/* Recent sections */}
          {(dashboards.length > 0 || sessions.length > 0) && (
            <div className="w-full max-w-5xl mt-24 space-y-12">
              {/* Recent conversations */}
              {sessions.length > 0 && (
                <motion.section
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                      <span className="w-1 h-4 bg-primary rounded-full" />
                      Recent Conversations
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sessions.slice(0, 6).map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => { void globalChat.loadSession(session.id); }}
                        className="group/session text-left bg-surface-low/40 backdrop-blur-sm hover:bg-surface-high/70 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all duration-300 hover:-translate-y-0.5"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <span className="text-[10px] text-on-surface-variant/60 ml-auto">{relativeTime(session.createdAt)}</span>
                        </div>
                        <div className="text-sm font-medium text-on-surface line-clamp-2 leading-snug">
                          {session.title || 'Untitled conversation'}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* Recent dashboards */}
              {dashboards.length > 0 && (
                <motion.section
                  variants={fadeIn}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.35 }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                      <span className="w-1 h-4 bg-tertiary rounded-full" />
                      Recent Dashboards
                    </h2>
                    <Link
                      to="/dashboards"
                      className="text-xs text-tertiary hover:text-tertiary/80 transition-colors"
                    >
                      View all →
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dashboards.slice(0, 6).map((dash) => (
                      <div key={dash.id} className="group/home-card relative">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboards/${dash.id}`)}
                          className="w-full text-left bg-surface-low/40 backdrop-blur-sm hover:bg-surface-high/70 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all duration-300 hover:-translate-y-0.5"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-tertiary/10 flex items-center justify-center">
                              <svg className="w-3.5 h-3.5 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-4" />
                              </svg>
                            </div>
                            <span className={`w-1.5 h-1.5 rounded-full ml-auto ${dash.status === 'generating' ? 'bg-amber-400 animate-pulse' : dash.status === 'error' ? 'bg-error' : 'bg-emerald-500'}`} />
                            <span className="text-[10px] text-on-surface-variant/60">{relativeTime(dash.updatedAt ?? dash.createdAt)}</span>
                          </div>
                          <div className="text-sm font-medium text-on-surface line-clamp-1 mb-1">{dash.title}</div>
                          <div className="text-xs text-on-surface-variant/60">{dash.panels.length} panel{dash.panels.length === 1 ? '' : 's'}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDashId(dash.id)}
                          className="absolute top-3 right-3 p-1.5 rounded-lg bg-surface-highest/80 text-on-surface-variant hover:text-error opacity-0 group-hover/home-card:opacity-100 transition-all"
                          title="Delete"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.5 2a1 1 0 00-1 1V4H5a1 1 0 000 2h.293l.853 9.386A2 2 0 008.138 17h3.724a2 2 0 001.992-1.614L14.707 6H15a1 1 0 100-2h-2.5V3a1 1 0 00-1-1h-3zM9.5 4h1V3h-1v1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.section>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={deletingDashId !== null}
          title="Delete dashboard?"
          message="This dashboard and all its panels will be permanently deleted."
          onConfirm={() => { if (deletingDashId) void handleDeleteDashboard(deletingDashId); setDeletingDashId(null); }}
          onCancel={() => setDeletingDashId(null)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE 2: Conversation state — messages fill screen, input at bottom
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="h-full bg-surface-lowest flex flex-col">
      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 w-full pt-8 pb-4">
          {blocks.map((block) => {
            if (block.type === 'message') {
              const evt = block.event;
              if (evt.kind === 'error') {
                return <ErrorMessage key={evt.id} content={evt.content ?? 'An error occurred'} />;
              }
              if (evt.message?.role === 'user') {
                return <UserMessage key={evt.id} content={evt.message.content} />;
              }
              if (evt.message?.role === 'assistant') {
                return <AssistantMessage key={evt.id} content={evt.message.content} />;
              }
              return null;
            }

            if (block.type === 'agent') {
              return (
                <AgentActivityBlock
                  key={block.id}
                  events={block.events}
                  isLive={isGenerating && block.id === lastAgentBlockId}
                />
              );
            }

            return null;
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input fixed at bottom */}
      <div className="shrink-0 border-t border-white/5 bg-surface-lowest">
        <div className="max-w-3xl mx-auto px-6 py-4 w-full">
          {inputArea}
          <p className="mt-2 text-[10px] text-center text-on-surface-variant/40">
            OpenObs can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
