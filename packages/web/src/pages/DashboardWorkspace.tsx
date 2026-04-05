import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiClient } from '../api/client.js';
import { queryScheduler } from '../api/query-scheduler.js';
import DashboardGrid from '../components/DashboardGrid.js';
import PanelEditor from '../components/PanelEditor.js';
import ChatPanel from '../components/ChatPanel.js';
import VariableBar from '../components/VariableBar.js';
import InvestigationReportView from '../components/InvestigationReportView.js';
import { useDashboardChat } from '../hooks/useDashboardChat.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import type { PanelConfig } from '../components/DashboardPanelCard.js';
import type { DashboardVariable } from '../hooks/useDashboardChat.js';

// Types

interface Dashboard {
  id: string;
  title: string;
  description?: string;
  prompt: string;
  status: 'generating' | 'ready' | 'error';
  type?: string;
  panels: PanelConfig[];
  variables?: DashboardVariable[];
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

// Save to Folder Dropdown

function SaveDropdown({
  dashboardId,
  currentFolder,
  onSaved,
}: {
  dashboardId: string;
  currentFolder?: string;
  onSaved: (folder: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [folders, setFolders] = React.useState<string[]>([]);
  const [newFolder, setNewFolder] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedLabel, setSavedLabel] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Load folders from all dashboards when dropdown opens
  React.useEffect(() => {
    if (!open) return;
    void apiClient.get<Dashboard[]>('/dashboards').then((res) => {
      if (!res.error) {
        const set = new Set((Array.isArray(res.data) ? res.data : []).map((d: Dashboard) => d.folder).filter(Boolean) as string[]);
        setFolders([...set].sort());
      }
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const saveToFolder = async (folder: string) => {
    if (!folder.trim()) return;
    setSaving(true);
    const res = await apiClient.put<Dashboard>(`/dashboards/${dashboardId}`, {
      folder: folder.trim(),
    });
    setSaving(false);
    if (!res.error) {
      onSaved(folder.trim());
      setSavedLabel(true);
      setTimeout(() => setSavedLabel(false), 1500);
    }
    setOpen(false);
    setNewFolder('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void saveToFolder(newFolder);
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 rounded-lg transition-colors shrink-0 ${
          savedLabel
            ? 'bg-primary/20 text-primary'
            : 'hover:bg-surface-high text-on-surface-variant hover:text-on-surface'
        }`}
        title="Save to folder"
        disabled={saving}
      >
        {savedLabel ? (
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v2h12V6H4z" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 bg-surface-container border border-outline-variant rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Save to folder
            </div>
          </div>

          {folders.length > 0 && (
            <div className="px-1">
              {folders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => void saveToFolder(folder)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left ${
                    currentFolder === folder
                      ? 'text-primary bg-primary/10'
                      : 'text-on-surface hover:bg-surface-high'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1H2V6z" />
                    <path d="M2 9h16v5a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" />
                  </svg>
                  <span className="flex-1 truncate">{folder}</span>
                  {currentFolder === folder && (
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {folders.length > 0 && <div className="border-t border-outline-variant" />}

          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="New folder name"
              className="w-full bg-surface-high border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-on-surface-variant mt-1 px-0.5">Press Enter to save</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Status badge

// Main

export default function DashboardWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
  const initialPromptSent = useRef(false);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');
  const [editingPanel, setEditingPanel] = useState<PanelConfig | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // pollRef removed — no more polling; SSE pushes all updates
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // Load dashboard
  const dashboardLoadedRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (!id) return;
    const res = await apiClient.get<Dashboard>(`/dashboards/${id}`);
    const errStatus = Number((res.error as Record<string, unknown> | undefined)?.status);
    const isTransient =
      !!res.error && (res.error.code === 'RATE_LIMITED' || (!Number.isNaN(errStatus) && errStatus >= 500));

    if (isTransient) {
      if (dashboardLoadedRef.current) {
        retryCountRef.current = 0;
        return;
      }

      if (retryCountRef.current < 8) {
        const delayMs = Math.min(1000 * 2 ** retryCountRef.current, 30000);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          void loadDashboard();
        }, delayMs);
        return;
      }
    }

    retryCountRef.current = 0;
    if (res.error) {
      if (!dashboardLoadedRef.current) {
        setLoadError(res.error.message ?? 'Failed to load dashboard');
      }
    } else {
      dashboardLoadedRef.current = true;
      setDashboard(res.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    retryCountRef.current = 0;
    void loadDashboard();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [loadDashboard]);

  // Chat / SSE
  const {
    events,
    isGenerating,
    sendMessage,
    stopGeneration,
    panels,
    variables,
    setPanels,
    setVariables,
    investigationReport,
  } = useDashboardChat(id ?? '', dashboard?.panels ?? [], dashboard?.variables ?? []);
  const [showReport, setShowReport] = useState(false);

  // Auto-show investigation report when it arrives
  useEffect(() => {
    if (investigationReport) setShowReport(true);
  }, [investigationReport]);

  // Auto-send initial prompt from Home page
  useEffect(() => {
    if (initialPrompt && dashboard && !initialPromptSent.current && !isGenerating) {
      initialPromptSent.current = true;
      if (location.state) {
        window.history.replaceState({}, '');
      }
      void sendMessage(initialPrompt);
    }
  }, [initialPrompt, dashboard, isGenerating, sendMessage]);

  // Reload dashboard once when generation completes (SSE done → isGenerating becomes false)
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && id) {
      // Generation just finished — fetch final dashboard state once
      void apiClient.get<Dashboard>(`/dashboards/${id}`).then((res) => {
        if (!res.error && res.data) setDashboard(res.data);
      });
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, id]);

  // Variable changes
  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.name === name ? { ...v, current: value } : v))
    );
  }, [setVariables]);

  // Title editing

  const startEditTitle = () => {
    setTitleDraft(dashboard?.title ?? '');
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!id || !titleDraft.trim()) return;
    const res = await apiClient.put<Dashboard>(`/dashboards/${id}`, {
      title: titleDraft.trim(),
    });
    if (!res.error) setDashboard(res.data);
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void saveTitle();
    if (e.key === 'Escape') setEditingTitle(false);
  };

  // Panel CRUD

  const handleSavePanel = async (updated: PanelConfig) => {
    if (!id || !dashboard) return;
    const newPanels = panels.map((p) => (p.id === updated.id ? updated : p));
    const res = await apiClient.put<Dashboard>(`/dashboards/${id}/panels`, newPanels);
    if (!res.error) {
      setDashboard(res.data);
      setPanels(res.data.panels);
    }
    setEditingPanel(null);
  };

  const handleDeletePanel = async (panelId: string) => {
    if (!id) return;
    const res = await apiClient.delete<Dashboard>(`/dashboards/${id}/panels/${panelId}`);
    if (!res.error) {
      setDashboard(res.data);
      setPanels(res.data.panels);
    }
  };

  const handleAddPanel = async () => {
    if (!id) return;
    const newPanel: Omit<PanelConfig, 'id'> = {
      title: 'New Panel',
      description: '',
      queries: [],
      query: '',
      visualization: 'time_series',
      refreshIntervalSec: 30,
    };
    const res = await apiClient.post<Dashboard>(`/dashboards/${id}/panels`, newPanel);
    if (!res.error) {
      setDashboard(res.data);
      setPanels(res.data.panels);
      const lastPanel = res.data.panels[res.data.panels.length - 1];
      if (lastPanel) setEditingPanel(lastPanel);
    }
  };

  // Layout change

  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLayoutChange = useCallback(
    (newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
      if (!id || !panels) return;
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = setTimeout(() => {
        const updatedPanels = panels.map((panel) => {
          const item = newLayout.find((l) => l.i === panel.id);
          if (!item) return panel;
          return {
            ...panel,
            gridCol: item.x,
            gridRow: item.y,
            gridWidth: item.w,
            gridHeight: item.h,
          };
        });

        void apiClient.put<Dashboard>(`/dashboards/${id}/panels`, updatedPanels).then((res) => {
          if (!res.error) {
            setDashboard(res.data);
            setPanels(res.data.panels);
          }
        });
      }, 500);
    },
    [id, panels, setPanels]
  );

  // Scroll to panel
  const scrollToPanel = useCallback((panelId: string) => {
    const el = document.getElementById(`panel-${panelId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Loading / error states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-surface">
        <span className="inline-block w-6 h-6 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-surface text-center px-6">
        <p className="text-error text-sm mb-4">{loadError ?? 'Dashboard not found.'}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-primary hover:text-primary-container transition-colors"
        >
          Back to Dashboards
        </button>
      </div>
    );
  }

  // Render

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-surface/80 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate(dashboard?.type === 'investigation' ? '/investigations' : '/dashboards')}
          className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
          aria-label="Back to dashboards"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 14.707a1 1 0 01-1.414 0L6.586 10l4.707-4.707a1 1 0 111.414 1.414L9.414 10l3.293 3.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          {isGenerating && dashboard.title === 'Untitled Dashboard' ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-sm text-on-surface-variant truncate italic">
                {dashboard.prompt?.length > 50 ? `${dashboard.prompt.slice(0, 50)}...` : dashboard.prompt}
              </span>
            </div>
          ) : showReport ? (
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M4.7 10a5.3 5.3 0 1010.6 0 5.3 5.3 0 00-10.6 0z" />
              </svg>
              <span className="text-sm font-semibold text-on-surface truncate">
                {dashboard.title.startsWith('Investigation') ? dashboard.title : 'Investigation'}
              </span>
            </div>
          ) : editingTitle ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                void saveTitle();
              }}
              onKeyDown={handleTitleKeyDown}
              className="text-sm font-semibold text-on-surface bg-transparent border-b border-primary focus:outline-none w-full"
            />
          ) : (
            <button
              type="button"
              onClick={startEditTitle}
              className="text-sm font-semibold text-on-surface hover:text-primary-container truncate text-left max-w-xs transition-colors"
              title="Click to rename"
            >
              {dashboard.title}
            </button>
          )}

          {!showReport && !isGenerating && dashboard.folder && (
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
              {dashboard.folder}
            </span>
          )}
        </div>

        {/* Center: time range + refresh */}
        {!showReport && !isGenerating && (
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value);
                queryScheduler.clearCache();
                window.dispatchEvent(new CustomEvent('dashboard:refresh-panels'));
              }}
              className="bg-surface-high text-on-surface text-xs rounded-lg px-3 py-1.5 border-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
            >
              <option value="5m">Last 5m</option>
              <option value="15m">Last 15m</option>
              <option value="30m">Last 30m</option>
              <option value="1h">Last 1h</option>
              <option value="3h">Last 3h</option>
              <option value="6h">Last 6h</option>
              <option value="12h">Last 12h</option>
              <option value="24h">Last 24h</option>
            </select>
            <button
              type="button"
              onClick={() => {
                queryScheduler.clearCache();
                window.dispatchEvent(new CustomEvent('dashboard:refresh-panels'));
              }}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors"
              title="Refresh"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m14.836 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0A8.003 8.003 0 015.163 13M15 15h5" />
              </svg>
            </button>
          </div>
        )}

        {!showReport && (
          <>
            {/* Edit toggle */}
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`p-1.5 rounded-lg transition-colors ${editMode ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high'}`}
              title={editMode ? 'Exit edit mode' : 'Edit dashboard'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {/* Export */}
            <button
              type="button"
              onClick={() => {
                if (!id || !dashboard) return;
                const json = JSON.stringify(dashboard, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${dashboard.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors"
              title="Export JSON"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>

            {id && (
              <SaveDropdown
                dashboardId={id}
                currentFolder={dashboard.folder}
                onSaved={(folder) => setDashboard((prev) => (prev ? { ...prev, folder } : prev))}
              />
            )}

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="group relative p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-high transition-colors shrink-0"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <VariableBar
            dashboardId={id ?? ''}
            variables={variables}
            onChange={handleVariableChange}
          />

          {showReport && investigationReport ? (
            <InvestigationReportView
              report={investigationReport}
              onClose={() => setShowReport(false)}
            />
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain p-6 bg-surface-container">
              <DashboardGrid
                panels={panels}
                editMode={editMode}
                isGenerating={isGenerating}
                onEditPanel={(panelId) => {
                  const p = panels.find((x) => x.id === panelId);
                  if (p) setEditingPanel(p);
                }}
                onDeletePanel={(panelId) => {
                  void handleDeletePanel(panelId);
                }}
                onLayoutChange={handleLayoutChange}
              />
            </div>
          )}

          <div className="shrink-0 px-6 py-2 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isGenerating ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="text-xs text-on-surface-variant">
              {isGenerating ? 'Generating...' : `${panels.length} panel${panels.length !== 1 ? 's' : ''} ready`}
            </span>
          </div>
        </div>

        <ChatPanel
          events={events}
          isGenerating={isGenerating}
          onSendMessage={(msg) => {
            void sendMessage(msg);
          }}
          onStop={stopGeneration}
        />
      </div>

      {editingPanel && (
        <PanelEditor
          panel={editingPanel}
          onSave={(updated) => {
            void handleSavePanel(updated);
          }}
          onCancel={() => setEditingPanel(null)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete dashboard?"
        message="This dashboard and all its panels will be permanently deleted."
        onConfirm={async () => {
          if (id) {
            const res = await apiClient.delete(`/dashboards/${id}`);
            if (!res.error) navigate(dashboard?.type === 'investigation' ? '/investigations' : '/dashboards');
          }
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
