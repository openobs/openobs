import type { ContactPointIntegrationType } from '@agentic-obs/common';
import type { Sender } from './types.js';
import { slackSender } from './slack.js';
import { webhookSender } from './webhook.js';
import { discordSender } from './discord.js';
import { teamsSender } from './teams.js';
import { pagerDutySender } from './pagerduty.js';

export type { Sender, SenderResult, AlertFiredEventPayload } from './types.js';
export { slackSender, webhookSender, discordSender, teamsSender, pagerDutySender };
export {
  postWebhook,
  buildAlertWebhookBody,
  buildTestWebhookBody,
  extractWebhookUrl,
} from './webhook-fetch.js';

/**
 * Lookup table for notification senders. Returns null for integration
 * types that haven't been implemented yet (email, opsgenie, telegram) —
 * callers log "sender not implemented" and skip.
 */
export function senderFor(type: ContactPointIntegrationType): Sender | null {
  switch (type) {
    case 'slack':
      return slackSender;
    case 'webhook':
      return webhookSender;
    case 'discord':
      return discordSender;
    case 'teams':
      return teamsSender;
    case 'pagerduty':
      return pagerDutySender;
    case 'email':
    case 'opsgenie':
    case 'telegram':
      return null;
    default:
      return null;
  }
}
