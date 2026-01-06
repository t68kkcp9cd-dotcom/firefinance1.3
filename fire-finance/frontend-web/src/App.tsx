import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Toaster } from 'react-hot-toast';

// Layout Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Budget from './pages/Budget';
import Bills from './pages/Bills';
import Goals from './pages/Goals';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Business from './pages/Business';
import Investments from './pages/Investments';
import Collaboration from './pages/Collaboration';

// Components
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';

// Store
import { RootState } from './store';
import { initializeApp } from './store/slices/appSlice';

// Utils
import { logger } from './utils/logger';

function App() {
  const dispatch = useDispatch();
  const { isLoading, error } = useAuth();
  const { isOnline } = useSelector((state: RootState) => state.app);
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  
  // Initialize WebSocket connection
  useWebSocket();
  
  useEffect(() => {
    // Initialize app
    dispatch(initializeApp());
    
    // Log app version
    logger.info(`Fire Finance Web v${process.env.REACT_APP_VERSION || '1.0.0'}`);
  }, [dispatch]);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="large" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        {/* Install prompt for PWA */}
        <InstallPrompt />
        
        {/* Network status indicator */}
        {!isOnline && (
          <div className="fixed top-0 left-0 right-0 bg-destructive text-destructive-foreground p-2 text-center text-sm z-50">
            You're offline. Some features may be limited.
          </div>
        )}
        
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          } />
          <Route path="/register" element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
          } />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="budget" element={<Budget />} />
            <Route path="bills" element={<Bills />} />
            <Route path="goals" element={<Goals />} />
            <Route path="reports" element={<Reports />} />
            <Route path="investments" element={<Investments />} />
            <Route path="business" element={<Business />} />
            <Route path="collaboration" element={<Collaboration />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        
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
      </div>
    </ErrorBoundary>
  );
}

export default App;