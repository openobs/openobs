import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Navigation from './Navigation.js';
import GlobalSearch from './GlobalSearch.js';
import ChatPanel from './ChatPanel.js';
import { ChatProvider, useGlobalChat } from '../contexts/ChatContext.js';

function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { events, isGenerating, sendMessage, stopGeneration, pendingNavigation, clearPendingNavigation } = useGlobalChat();

  // Hide the global ChatPanel on Home and on the top-level list pages
  // (Dashboards / Investigations / Alerts). Detail pages keep the panel
  // because that's where a context-specific chat is actually useful.
  const CHAT_HIDDEN_PATHS = new Set(['/', '/dashboards', '/investigations', '/alerts']);
  const showChat = !CHAT_HIDDEN_PATHS.has(location.pathname);

  // Handle agent-initiated navigation
  useEffect(() => {
    if (pendingNavigation) {
      navigate(pendingNavigation);
      clearPendingNavigation();
    }
  }, [pendingNavigation, navigate, clearPendingNavigation]);

  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-surface-lowest">
        <Outlet />
      </main>
      {showChat && (
        <ChatPanel
          events={events}
          isGenerating={isGenerating}
          onSendMessage={(msg) => {
            void sendMessage(msg);
          }}
          onStop={stopGeneration}
        />
      )}
      <GlobalSearch />
    </div>
  );
}

export default function Layout() {
  return (
    <ChatProvider>
      <LayoutInner />
    </ChatProvider>
  );
}
