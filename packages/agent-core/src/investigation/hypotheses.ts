import { randomUUID } from 'node:crypto';
import {
  type Hypothesis,
  LLMUnavailableError,
} from '@agentic-obs/common';
import type { LLMGateway } from '@agentic-obs/llm-gateway';
import type { ScoredCase } from '../case-library/types.js';
import type { StepFinding } from './types.js';

/**
 * Hypothesis generation from investigation findings.
 *
 * Fully LLM-driven: the LLM receives all findings as context and
 * generates root-cause hypotheses without any hardcoded templates.
 */

interface LlmHypothesisEntry {
  description: string;
  confidence: number;
  confidenceBasis: string;
  category?: string;
}

function formatHistoricalCasesSection(cases: ScoredCase[]): string {
  if (!cases.length) return '';

  const lines: string[] = [
    'HISTORICAL CASES (similar past incidents for reference):',
    'These are similar past incidents for reference. Use your own reasoning - do not simply copy conclusions from past cases.',
    '',
  ];

  cases.forEach((sc, i) => {
    const r = sc.record;
    lines.push(`Case ${i + 1}: [${r.title}]`);
    if (r.symptoms.length > 0) lines.push(`- Symptoms: ${r.symptoms.join(', ')}`);
    lines.push(`- Root cause: ${r.rootCause}`);
    if (r.resolution) lines.push(`- Resolution: ${r.resolution}`);
    if (i < cases.length - 1) lines.push('');
  });

  return lines.join('\n');
}

/**
 * Calls the LLM with findings, returns parsed Hypothesis[].
 * Throws on failure - caller should handle accordingly.
 */
export async function synthesizeHypotheses(
  llm: LLMGateway,
  investigationId: string,
  findings: StepFinding[],
  historicalCases: ScoredCase[] = [],
  model: string,
): Promise<Hypothesis[]> {
  const findingsText = findings
    .map(
      (f) =>
        `- [${f.stepType}] ${f.summary}${f.isAnomaly ? ' | anomaly' : ''}${f.value !== undefined ? ` | value=${f.value}` : ''}${f.deviationRatio !== undefined ? ` | deviation=${(f.deviationRatio * 100).toFixed(0)}%` : ''}`,
    )
    .join('\n');

  const casesSection = formatHistoricalCasesSection(historicalCases);

  const systemMessage = `You are an expert SRE analyzing observability data to identify root causes of incidents.
Given a set of investigation findings from monitoring systems, generate root-cause hypotheses.
Consider correlations between findings, common failure patterns, and the relative severity of anomalies.
Focus on actionable hypotheses that an on-call engineer could verify or rule out.`;

  const userMessage = `OBSERVABILITY FINDINGS:
${findingsText}

${casesSection ? `${casesSection}\n\n` : ''}Generate a JSON array of root cause hypotheses. For each hypothesis provide:
- "description": clear, specific hypothesis about the root cause
- "confidence": number from 0.0 to 1.0 reflecting the likelihood given the evidence
- "confidenceBasis": 1-2 sentences explaining your confidence assessment
- "category": one of "deployment", "resource", "dependency", "traffic", "config", "unknown"

Return ONLY a valid JSON array. No markdown, no explanation outside the JSON.`;

  const response = await llm.complete(
    [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    { model, temperature: 0.2, maxTokens: 1024, responseFormat: 'json' },
  );

  const parsed = JSON.parse(
    response.content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim(),
  ) as LlmHypothesisEntry[];

  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON array');
  }

  return parsed.map((entry) => ({
    id: randomUUID(),
    investigationId,
    description: String(entry.description ?? ''),
    confidence: Math.max(0, Math.min(1, Number(entry.confidence ?? 0.5))),
    confidenceBasis: String(entry.confidenceBasis ?? ''),
    evidenceIds: [],
    counterEvidenceIds: [],
    status: 'proposed' as const,
  }));
}

/**
 * Generates hypotheses from investigation findings.
 *
 * Requires an LLMGateway - without it, returns an empty array so callers
 * that use this for early-stop checks degrade safely without crashing.
 *
 * When no anomalies are found, skips the LLM call and returns empty array.
 *
 * On LLM failure or unparseable response, throws LLMUnavailableError.
 *
 * @param historicalCases - pre-fetched similar cases to inject as LLM context (optional)
 */
export async function generateHypotheses(
  investigationId: string,
  findings: StepFinding[],
  llm?: LLMGateway,
  historicalCases: ScoredCase[] = [],
  model?: string,
): Promise<Hypothesis[]> {
  if (!llm || !model) {
    return [];
  }

  const anomalous = findings.filter((f) => f.isAnomaly);
  if (anomalous.length === 0) {
    return [];
  }

  try {
    const hypotheses = await synthesizeHypotheses(
      llm,
      investigationId,
      findings,
      historicalCases,
      model,
    );
    hypotheses.sort((a, b) => b.confidence - a.confidence);
    return hypotheses;
  } catch (err) {
    throw new LLMUnavailableError(
      err instanceof Error ? err.message : 'LLM hypothesis synthesis failed',
    );
  }
}
