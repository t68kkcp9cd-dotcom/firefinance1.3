import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authAPI } from '../../api/auth';
import { User, AuthTokens, LoginRequest, RegisterRequest } from '../../types/auth';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mfaRequired: boolean;
  mfaSecret: string | null;
  qrCode: string | null;
  backupCodes: string[] | null;
}

const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  mfaRequired: false,
  mfaSecret: null,
  qrCode: null,
  backupCodes: null,
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(credentials);
      return response;
    } catch (error: any) {
      if (error.response?.data?.error === 'MFA_REQUIRED') {
        return rejectWithValue({ mfaRequired: true });
      }
      return rejectWithValue({ message: error.response?.data?.message || 'Login failed' });
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData: RegisterRequest, { rejectWithValue }) => {
    try {
      const response = await authAPI.register(userData);
      return response;
    } catch (error: any) {
      return rejectWithValue({ message: error.response?.data?.message || 'Registration failed' });
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as { auth: AuthState };
      if (auth.tokens?.refreshToken) {
        await authAPI.logout(auth.tokens.refreshToken);
      }
      return;
    } catch (error: any) {
      return rejectWithValue({ message: error.message || 'Logout failed' });
    }
  }
);

export const refreshTokens = createAsyncThunk(
  'auth/refreshTokens',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as { auth: AuthState };
      if (!auth.tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await authAPI.refreshTokens(auth.tokens.refreshToken);
      return response;
    } catch (error: any) {
      return rejectWithValue({ message: error.message || 'Token refresh failed' });
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const user = await authAPI.getCurrentUser();
      return user;
    } catch (error: any) {
      return rejectWithValue({ message: error.message || 'Failed to fetch user' });
    }
  }
);

export const setupMFA = createAsyncThunk(
  'auth/setupMFA',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authAPI.setupMFA();
      return response;
    } catch (error: any) {
      return rejectWithValue({ message: error.message || 'MFA setup failed' });
    }
  }
);

export const enableMFA = createAsyncThunk(
  'auth/enableMFA',
  async (params: { secret: string; token: string; backupCodes: string[] }, { rejectWithValue }) => {
    try {
      await authAPI.enableMFA(params.secret, params.token, params.backupCodes);
      return;
    } catch (error: any) {
      return rejectWithValue({ message: error.message || 'MFA enable failed' });
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTokens: (state, action: PayloadAction<AuthTokens>) => {
      state.tokens = action.payload;
      state.isAuthenticated = true;
    },
    clearError: (state) => {
      state.error = null;
    },
    resetMFA: (state) => {
      state.mfaRequired = false;
      state.mfaSecret = null;
      state.qrCode = null;
      state.backupCodes = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.mfaRequired = false;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tokens = action.payload.tokens;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(login.rejected, (state, action: any) => {
        state.isLoading = false;
        if (action.payload?.mfaRequired) {
          state.mfaRequired = true;
        } else {
          state.error = action.payload?.message || 'Login failed';
        }
      })
      
      // Register
      .addCase(register.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tokens = action.payload.tokens;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(register.rejected, (state, action: any) => {
        state.isLoading = false;
        state.error = action.payload?.message || 'Registration failed';
      })
      
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.tokens = null;
        state.isAuthenticated = false;
        state.mfaRequired = false;
        state.mfaSecret = null;
        state.qrCode = null;
        state.backupCodes = null;
      })
      
      // Refresh tokens
      .addCase(refreshTokens.fulfilled, (state, action) => {
        state.tokens = action.payload;
      })
      .addCase(refreshTokens.rejected, (state) => {
        state.user = null;
        state.tokens = null;
        state.isAuthenticated = false;
      })
      
      // Fetch current user
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      
      // Setup MFA
      .addCase(setupMFA.fulfilled, (state, action) => {
        state.mfaSecret = action.payload.secret;
        state.qrCode = action.payload.qrCode;
        state.backupCodes = action.payload.backupCodes;
      })
      
      // Enable MFA
      .addCase(enableMFA.fulfilled, (state) => {
        if (state.user) {
          state.user.mfaEnabled = true;
        }
        state.mfaSecret = null;
        state.qrCode = null;
        state.backupCodes = null;
      });
  },
});

export const { setTokens, clearError, resetMFA } = authSlice.actions;
export default authSlice.reducer;