import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

/* ───── Icon components ───── */

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function InvestigationIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

function CanvasIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
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

function SupportIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/* ───── Toggle icon ───── */

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={expanded ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
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
      <div className={`flex items-center mb-4 ${expanded ? 'justify-between px-1' : 'justify-center'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 text-primary font-bold text-sm select-none shrink-0">
            OC
          </div>
          {expanded && <span className="text-sm font-bold text-on-surface truncate">Prism</span>}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60 transition-colors ${expanded ? '' : 'mt-2'}`}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>

      {/* Primary nav items */}
      <div className={`flex flex-col gap-1 flex-1 ${expanded ? '' : 'items-center'}`}>
        <SidebarItem to="/" label="Home" icon={<CanvasIcon />} end expanded={expanded} />
        <SidebarItem to="/dashboards" label="Dashboards" icon={<DashboardIcon />} expanded={expanded} />
        <SidebarItem to="/investigations" label="Investigations" icon={<InvestigationIcon />} expanded={expanded} />
        <SidebarItem to="/alerts" label="Alerts" icon={<AlertsIcon />} expanded={expanded} />
      </div>

      {/* Bottom nav items */}
      <div className={`flex flex-col gap-1 mt-auto ${expanded ? '' : 'items-center'}`}>
        <SidebarItem to="/connections" label="Connections" icon={<SupportIcon />} expanded={expanded} />
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
