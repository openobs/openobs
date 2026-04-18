// Types

export type LlmProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'azure-openai'
  | 'aws-bedrock'
  | 'ollama'
  | 'corporate-gateway';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  region: string;
  authType: string;
}

export interface DatasourceEntry {
  type: string;
  name: string;
  url: string;
  apiKey: string;
}

export interface NotificationConfig {
  slackWebhook: string;
  pagerDutyKey: string;
  emailHost: string;
  emailPort: string;
  emailUser: string;
  emailPass: string;
  emailFrom: string;
}

// Provider metadata

export const LLM_PROVIDERS: Array<{
  value: LlmProvider;
  label: string;
  fallbackModels: string[];
  needsKey: boolean;
  needsUrl?: boolean;
  needsRegion?: boolean;
  supportsModelFetch?: boolean;
}> = [
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    fallbackModels: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    needsKey: true,
    supportsModelFetch: true,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    fallbackModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    needsKey: true,
    supportsModelFetch: true,
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    fallbackModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    needsKey: true,
    supportsModelFetch: true,
  },
  {
    value: 'azure-openai',
    label: 'Azure OpenAI',
    fallbackModels: ['gpt-4o', 'gpt-4-turbo'],
    needsKey: true,
    needsUrl: true,
  },
  {
    value: 'aws-bedrock',
    label: 'AWS Bedrock',
    fallbackModels: ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'amazon.nova-pro-v1:0'],
    needsKey: false,
    needsRegion: true,
  },
  {
    value: 'ollama',
    label: 'Local (Ollama / Llama)',
    fallbackModels: ['llama3.2', 'mistral', 'gemma2'],
    needsKey: false,
    needsUrl: true,
    supportsModelFetch: true,
  },
  {
    value: 'corporate-gateway',
    label: 'Corporate Gateway (Okta/SSO)',
    fallbackModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
    needsKey: true,
    needsUrl: true,
  },
];

export const DATASOURCE_TYPES = [
  { value: 'loki', label: 'Loki', category: 'Logs' },
  { value: 'elasticsearch', label: 'Elasticsearch', category: 'Logs' },
  { value: 'clickhouse', label: 'ClickHouse', category: 'Logs' },
  { value: 'tempo', label: 'Tempo', category: 'Traces' },
  { value: 'jaeger', label: 'Jaeger', category: 'Traces' },
  { value: 'otel', label: 'OTel Collector', category: 'Traces' },
  { value: 'prometheus', label: 'Prometheus', category: 'Metrics' },
  { value: 'victoria-metrics', label: 'VictoriaMetrics', category: 'Metrics' },
];

export const STEPS = ['Welcome', 'Administrator', 'LLM Provider', 'Data Sources', 'Notifications', 'Ready'];
