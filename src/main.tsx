import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { App as CapacitorApp } from '@capacitor/app';

// Handle Android hardware back button: harmless in browser (no-op if plugin unavailable).
try {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });
} catch {
  // Ignore in non-Capacitor environments (e.g., desktop browser during dev).
}

createRoot(document.getElementById('root')!).render(<App />);
