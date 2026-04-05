import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation.js';

export default function Layout() {
  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-surface-container">
        <Outlet />
      </main>
    </div>
  );
}
