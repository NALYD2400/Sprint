import React, { lazy, Suspense } from 'react';

const MainApp = lazy(() => import('./App.jsx'));
const TrayApp = lazy(() => import('../screens/tray/TrayPanel.jsx'));
const isTray = new URLSearchParams(window.location.search).get('tray') === '1';

export default function Root() {
  return <Suspense fallback={null}>{isTray ? <TrayApp /> : <MainApp />}</Suspense>;
}
