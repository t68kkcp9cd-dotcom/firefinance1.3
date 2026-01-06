import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './components/ThemeProvider';
import { store } from './store';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import './styles/globals.css';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                },
              }}
            />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);

// Register service worker for PWA functionality
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    // Notify user about app update
    if (window.confirm('New version available! Reload to update?')) {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  },
  onSuccess: (registration) => {
    console.log('Service worker registered successfully:', registration);
  },
});

// Handle app installation
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Store the event for later use
  (window as any).deferredPrompt = e;
  // Show install button or notification
  store.dispatch({ type: 'app/setInstallPrompt', payload: e });
});

// Handle app installed
window.addEventListener('appinstalled', () => {
  console.log('Fire Finance has been installed');
  store.dispatch({ type: 'app/setInstalled', payload: true });
});

// Handle online/offline status
window.addEventListener('online', () => {
  store.dispatch({ type: 'app/setOnline', payload: true });
});

window.addEventListener('offline', () => {
  store.dispatch({ type: 'app/setOnline', payload: false });
});

// Handle visibility change for performance optimization
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // App is hidden, pause non-essential operations
    store.dispatch({ type: 'app/setVisible', payload: false });
  } else {
    // App is visible, resume operations
    store.dispatch({ type: 'app/setVisible', payload: true });
    // Refresh critical data
    queryClient.invalidateQueries(['user', 'accounts', 'transactions']);
  }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + K for quick search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    store.dispatch({ type: 'app/toggleSearch' });
  }
  
  // Ctrl/Cmd + N for new transaction
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    store.dispatch({ type: 'app/quickTransaction' });
  }
  
  // Escape to close modals
  if (e.key === 'Escape') {
    store.dispatch({ type: 'app/closeModals' });
  }
});

// Handle errors
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  // Report to error tracking service
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  // Report to error tracking service
});