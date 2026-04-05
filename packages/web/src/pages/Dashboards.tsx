import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import type { PanelConfig } from '../components/DashboardPanelCard.js';

// Types

interface Dashboard {
  id: string;
  title: string;
  description?: string;
  status: 'generating' | 'ready' | 'error';
  type?: string;
  panels: PanelConfig[];
  createdAt: string;
  updatedAt: string;
  folder?: string;
}

interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
}

type SortKey = 'date' | 'name';

// Helpers

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ status }: { status: Dashboard['status'] }) {
  if (status === 'ready') {
    return (
      <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
        Ready
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-[10px] bg-error/10 text-error px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
        Error
      </span>
    );
  }
  return (
    <span className="text-[10px] bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
      Generating
    </span>
  );
}

// Page config per list type
const PAGE_CONFIG = {
  dashboard: {
    title: 'Dashboards',
    subtitle: 'Monitor and visualize your infrastructure metrics.',
    newLabel: '+ New Dashboard',
    emptyTitle: 'No dashboards yet',
    emptyDesc: 'Create a dashboard to start monitoring your infrastructure.',
    icon: 'grid_view',
    navTarget: '/dashboards',
  },
  investigation: {
    title: 'Investigations',
    subtitle: 'Diagnose and troubleshoot production issues.',
    newLabel: '+ New Investigation',
    emptyTitle: 'No investigations yet',
    emptyDesc: 'Start an investigation to diagnose a production issue.',
    icon: 'search',
    navTarget: '/investigations',
  },
};

// Main

export default function Dashboards({ listType }: { listType?: string } = {}) {
  const navigate = useNavigate();
  const config = PAGE_CONFIG[listType === 'investigation' ? 'investigation' : 'dashboard'];
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['__none__']));
  const [deletingDashId, setDeletingDashId] = useState<string | null>(null);
  const [movingDashId, setMovingDashId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const loadList = useCallback(async () => {
    const [dashRes, folderRes] = await Promise.all([
      apiClient.get<Dashboard[]>(`/dashboards${listType ? `?type=${listType}` : ''}`),
      apiClient.get<Folder[]>('/folders'),
    ]);
    if (!dashRes.error) setDashboards(dashRes.data);
    if (!folderRes.error) setFolders(folderRes.data);
    setLoadingList(false);
  }, [listType]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/dashboards/${id}`);
    if (!res.error) setDashboards((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleMoveToFolder = useCallback(async (id: string, folder: string) => {
    const res = await apiClient.put(`/dashboards/${id}`, { folder: folder || undefined });
    if (!res.error) {
      setDashboards((prev) => prev.map((d) => d.id === id ? { ...d, folder: folder || undefined } : d));
      setExpandedFolders((prev) => { const n = new Set(prev); n.add(folder || '__none__'); return n; });
    }
    setMovingDashId(null);
  }, []);


  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  // Sort & filter
  const sortFn = useCallback((a: Dashboard, b: Dashboard) => {
    if (sortKey === 'name') return a.title.localeCompare(b.title);
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
  }, [sortKey]);

  const filtered = useMemo(() => {
    let list = dashboards;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.description ?? '').toLowerCase().includes(q) ||
          (d.folder ?? '').toLowerCase().includes(q),
      );
    }
    return list.sort(sortFn);
  }, [dashboards, search, sortFn]);

  // Build folder lookup
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folderName = (id: string) => folderMap.get(id)?.name ?? id;

  // Group dashboards by folder (including empty folders from API)
  const folderGroups = useMemo(() => {
    const groups = new Map<string, Dashboard[]>();
    for (const d of filtered) {
      const fid = d.folder || '__none__';
      if (!groups.has(fid)) groups.set(fid, []);
      groups.get(fid)!.push(d);
    }
    // Add empty folders from API
    for (const f of folders) {
      if (!groups.has(f.id)) groups.set(f.id, []);
    }
    const entries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '__none__') return -1;
      if (b === '__none__') return 1;
      return folderName(a).localeCompare(folderName(b));
    });
    return entries;
  }, [filtered, folders, folderName]);

  const itemLink = (id: string) => `/dashboards/${id}`;

  return (
    <div className="flex-1 overflow-y-auto bg-surface-container">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface font-[Manrope]">{config.title}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{config.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowNewFolder(true); setTimeout(() => newFolderRef.current?.focus(), 50); }}
              className="bg-surface-high text-on-surface-variant hover:text-on-surface px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
            >
              + Folder
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="bg-primary text-on-primary-fixed px-4 py-2 rounded-lg font-semibold text-sm transition-transform active:scale-95"
            >
              {config.newLabel}
            </button>
          </div>
        </div>

        {/* Search + sort bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="w-full bg-surface-high rounded-lg pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary border-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortKey(sortKey === 'date' ? 'name' : 'date')}
            className="bg-surface-high px-4 py-2.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {sortKey === 'date' ? 'Latest' : 'Name'}
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 mb-4 bg-surface-high rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <input
              ref={newFolderRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  const name = newFolderName.trim();
                  void apiClient.post<Folder>('/folders', { name }).then((res) => {
                    if (!res.error) {
                      setFolders((prev) => [...prev, res.data]);
                      setExpandedFolders((prev) => { const n = new Set(prev); n.add(res.data.id); return n; });
                    }
                  });
                  setShowNewFolder(false);
                  setNewFolderName('');
                }
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
              }}
              placeholder="Folder name, then Enter"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none"
            />
            <button
              type="button"
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
              className="text-on-surface-variant hover:text-on-surface text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Loading */}
        {loadingList && (
          <div className="flex justify-center py-16">
            <span className="inline-block w-6 h-6 border-2 border-outline border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loadingList && dashboards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-surface-high flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <p className="text-sm text-on-surface-variant mb-1">{config.emptyTitle}</p>
            <p className="text-xs text-on-surface-variant/60 mb-4">{config.emptyDesc}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="bg-primary text-on-primary-fixed px-4 py-2 rounded-lg font-semibold text-sm"
            >
              {config.newLabel}
            </button>
          </div>
        )}

        {/* Folder-grouped list */}
        {!loadingList && filtered.length > 0 && (
          <div className="space-y-2">
            {folderGroups.map(([folder, items]) => (
              <div key={folder} className="bg-surface-high rounded-xl overflow-hidden">
                {/* Folder header */}
                <button
                  type="button"
                  onClick={() => toggleFolder(folder)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-bright/50 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 text-on-surface-variant transition-transform ${expandedFolders.has(folder) ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  {folder === '__none__' ? (
                    <span className="text-sm font-semibold text-on-surface">General</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-sm font-semibold text-on-surface">{folderName(folder)}</span>
                    </>
                  )}
                  <span className="text-xs text-on-surface-variant ml-auto">{items.length}</span>
                </button>

                {/* Items */}
                {expandedFolders.has(folder) && (
                  <div>
                    {items.map((dash) => (
                      <div
                        key={dash.id}
                        onClick={() => navigate(itemLink(dash.id))}
                        className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group border-t border-outline-variant/10"
                      >
                        {/* Type icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          dash.type === 'investigation' ? 'bg-tertiary/10' : 'bg-primary/10'
                        }`}>
                          {dash.type === 'investigation' ? (
                            <svg className="w-4 h-4 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
                            </svg>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-on-surface truncate">{dash.title}</h4>
                            <StatusBadge status={dash.status} />
                          </div>
                          <span className="text-xs text-on-surface-variant">
                            {dash.panels.length} panel{dash.panels.length !== 1 ? 's' : ''} · {relativeTime(dash.updatedAt ?? dash.createdAt)}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 relative">
                          {/* Move to folder */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMovingDashId(movingDashId === dash.id ? null : dash.id); }}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Move to folder"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </button>
                          {/* Folder dropdown */}
                          {movingDashId === dash.id && (
                            <div className="absolute right-0 top-full mt-1 bg-surface-highest rounded-lg shadow-xl z-20 py-1 min-w-[160px]">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleMoveToFolder(dash.id, ''); }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-bright transition-colors ${!dash.folder ? 'text-primary' : 'text-on-surface'}`}
                              >
                                General
                              </button>
                              {folders.map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void handleMoveToFolder(dash.id, f.id); }}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-bright transition-colors ${dash.folder === f.id ? 'text-primary' : 'text-on-surface'}`}
                                >
                                  {f.name}
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Delete */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeletingDashId(dash.id); }}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={deletingDashId !== null}
          title={`Delete ${listType === 'investigation' ? 'investigation' : 'dashboard'}?`}
          message="This will be permanently deleted along with all its panels."
          onConfirm={() => {
            if (deletingDashId) void handleDelete(deletingDashId);
            setDeletingDashId(null);
          }}
          onCancel={() => setDeletingDashId(null)}
        />
      </div>
    </div>
  );
}
