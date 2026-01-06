import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

// Import slices
import authReducer from './slices/authSlice';
import appReducer from './slices/appSlice';
import accountsReducer from './slices/accountsSlice';
import transactionsReducer from './slices/transactionsSlice';
import budgetReducer from './slices/budgetSlice';
import billsReducer from './slices/billsSlice';
import goalsReducer from './slices/goalsSlice';
import collaborationReducer from './slices/collaborationSlice';
import notificationsReducer from './slices/notificationsSlice';
import websocketReducer from './slices/websocketSlice';

// Import API services
import { api } from './api/api';

export const store = configureStore({
  reducer: {
    // API reducer
    [api.reducerPath]: api.reducer,
    
    // Feature slices
    auth: authReducer,
    app: appReducer,
    accounts: accountsReducer,
    transactions: transactionsReducer,
    budget: budgetReducer,
    bills: billsReducer,
    goals: goalsReducer,
    collaboration: collaborationReducer,
    notifications: notificationsReducer,
    websocket: websocketReducer,
  },
  
  // Add the API middleware
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }).concat(api.middleware),
  
  // Enable Redux DevTools in development
  devTools: process.env.NODE_ENV !== 'production',
});

// Setup listeners for RTK Query
setupListeners(store.dispatch);

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export store for testing
export default store;