import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

/* ───── Icon components ───── */

/* Prism logo — a triangular prism / light refraction motif */
function PrismLogo({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-6 h-6'} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 20h20L12 2z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M12 2L18 20" stroke="url(#prism-grad)" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
      <path d="M8 13l10 7" stroke="url(#prism-grad2)" strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
      <defs>
        <linearGradient id="prism-grad" x1="12" y1="2" x2="18" y2="20">
          <stop stopColor="#818cf8" /><stop offset="1" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id="prism-grad2" x1="8" y1="13" x2="18" y2="20">
          <stop stopColor="#60a5fa" /><stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* Home — pulse/activity overview */
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h4l3-9 4 18 3-9h6" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Investigation — compass/explore icon */
function InvestigationIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function AlertsIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/* ───── Sidebar toggle icon (shown on hover) ───── */

function SidebarToggleIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3v18" strokeLinecap="round" />
      {expanded
        ? <path d="M15 10l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M14 10l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

/* ───── Sidebar nav item ───── */

interface SidebarItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  expanded: boolean;
}

function SidebarItem({ to, label, icon, end, expanded }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={expanded ? undefined : label}
      className={({ isActive }) =>
        `flex items-center gap-3 h-10 rounded-lg transition-colors ${
          expanded ? 'px-3 w-full' : 'justify-center w-10'
        } ${
          isActive
            ? 'text-primary bg-primary/10'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60'
        }`
      }
    >
      {icon}
      {expanded && <span className="text-sm font-medium truncate">{label}</span>}
    </NavLink>
  );
}

/* ───── Main navigation sidebar ───── */

export default function Navigation() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav
      className={`flex flex-col h-full bg-surface-lowest py-3 shrink-0 transition-all duration-200 ${
        expanded ? 'w-48 px-2' : 'w-14 items-center'
      }`}
    >
      {/* App logo + toggle */}
      <div className={`flex items-center mb-5 ${expanded ? 'justify-between px-1' : 'flex-col gap-1'}`}>
        {/* Logo — collapsed: hover to show toggle; expanded: always show logo */}
        {expanded ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
              <PrismLogo />
            </div>
            <span className="text-sm font-bold text-on-surface truncate">Prism</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Open sidebar"
            className="group"
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0 group-hover:bg-surface-high transition-colors">
              <span className="transition-opacity duration-150 group-hover:opacity-0">
                <PrismLogo />
              </span>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 text-on-surface">
                <SidebarToggleIcon expanded={false} />
              </span>
            </div>
          </button>
        )}

        {/* Close button — only visible when expanded */}
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            title="Close sidebar"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60 transition-colors"
          >
            <SidebarToggleIcon expanded={true} className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* Primary nav items */}
      <div className={`flex flex-col gap-1 flex-1 ${expanded ? '' : 'items-center'}`}>
        <SidebarItem to="/" label="Home" icon={<HomeIcon />} end expanded={expanded} />
        <SidebarItem to="/dashboards" label="Dashboards" icon={<DashboardIcon />} expanded={expanded} />
        <SidebarItem to="/investigations" label="Investigations" icon={<InvestigationIcon />} expanded={expanded} />
        <SidebarItem to="/alerts" label="Alerts" icon={<AlertsIcon />} expanded={expanded} />
      </div>

      {/* Bottom nav items */}
      <div className={`flex flex-col gap-1 mt-auto ${expanded ? '' : 'items-center'}`}>
        <SidebarItem to="/settings" label="Settings" icon={<SettingsIcon />} expanded={expanded} />

        {/* User avatar */}
        {user && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            title={`${user.name} — Sign out`}
            className={`mt-2 flex items-center gap-2 rounded-full transition-colors hover:bg-primary/30 overflow-hidden ${
              expanded ? 'px-2 py-1.5 rounded-lg w-full' : 'justify-center w-8 h-8'
            } bg-primary/20 text-primary`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            {expanded && <span className="text-xs font-medium truncate">{user.name}</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
