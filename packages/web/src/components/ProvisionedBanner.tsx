import React, { useState } from 'react';
import { apiClient } from '../api/client.js';

/**
 * Wave 2.5 — banner shown at the top of a dashboard/alert detail page when
 * the resource is git-managed (source = provisioned_file | provisioned_git).
 *
 * Two actions:
 *   - Fork to my workspace → POST /api/resources/{kind}/{id}/fork → navigate
 *   - View source ↗        → opens the underlying repo file in a new tab
 *
 * If the user has neither permission to fork nor enough provenance metadata
 * to build a source URL, the banner still renders as a read-only warning so
 * the user understands why editing is blocked elsewhere in the UI.
 */

export type ResourceSource =
  | 'manual'
  | 'api'
  | 'ai_generated'
  | 'provisioned_file'
  | 'provisioned_git';

export interface ResourceProvenance {
  repo?: string;
  path?: string;
  commit?: string;
  generatedBy?: string;
  prompt?: string;
}

interface Props {
  resourceKind: 'dashboard' | 'alert_rule';
  resourceId: string;
  source: ResourceSource | undefined;
  provenance?: ResourceProvenance | null;
  /** Called with the newly-forked resource id on a successful fork. */
  onForked: (newResourceId: string) => void;
}

function isProvisioned(source: ResourceSource | undefined): boolean {
  return source === 'provisioned_file' || source === 'provisioned_git';
}

function buildSourceUrl(provenance?: ResourceProvenance | null): string | null {
  if (!provenance?.repo || !provenance.path) return null;
  const commit = provenance.commit ?? 'main';
  return `https://github.com/${provenance.repo}/blob/${commit}/${provenance.path}`;
}

export default function ProvisionedBanner({
  resourceKind,
  resourceId,
  source,
  provenance,
  onForked,
}: Props): React.ReactElement | null {
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isProvisioned(source)) return null;

  const sourceUrl = buildSourceUrl(provenance);
  const provenanceSummary = (() => {
    if (!provenance) return 'managed externally';
    if (provenance.repo && provenance.path) {
      const commitShort = provenance.commit ? ` (${provenance.commit.slice(0, 7)})` : '';
      return `${provenance.repo}/${provenance.path}${commitShort}`;
    }
    if (provenance.path) return provenance.path;
    return 'managed externally';
  })();

  async function handleFork(): Promise<void> {
    setForking(true);
    setError(null);
    try {
      const res = await apiClient.post<{ id: string }>(
        `/resources/${resourceKind}/${resourceId}/fork`,
        {},
      );
      if (res.error) {
        setError(res.error.message ?? 'Fork failed');
        return;
      }
      onForked(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
    } finally {
      setForking(false);
    }
  }

  const kindLabel = resourceKind === 'dashboard' ? 'dashboard' : 'alert rule';

  return (
    <div
      className="bg-amber-50 border-l-4 border-amber-500 px-4 py-3 flex items-start gap-3"
      data-testid="provisioned-banner"
    >
      <div className="flex-shrink-0 mt-0.5 text-amber-600" aria-hidden>
        ⚠
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-amber-900">
          This {kindLabel} is managed by git
        </div>
        <div className="text-xs text-amber-800 mt-0.5 truncate">
          Source: {provenanceSummary}
        </div>
        {error && (
          <div className="text-xs text-red-700 mt-1" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleFork}
          disabled={forking}
          className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {forking ? 'Forking…' : 'Fork to my workspace'}
        </button>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium rounded border border-amber-700 text-amber-900 hover:bg-amber-100"
          >
            View source ↗
          </a>
        )}
      </div>
    </div>
  );
}
