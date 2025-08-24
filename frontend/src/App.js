import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import Register from './components/Register';
import { Toaster } from './components/ui/sonner';
// Performance monitoring completely removed
import useWebSocket from './hooks/useWebSocket';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = `${BACKEND_URL.replace('http', 'ws')}/ws`;

// Configure axios defaults
axios.defaults.baseURL = API;

// Auth context
const AuthContext = createContext();

// WebSocket context
const WebSocketContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    try {
      const response = await axios.post('/auth/login', credentials);
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Login failed' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post('/auth/register', userData);
      const { access_token, user: newUser } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(newUser);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    user,
    login,
    register,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

const WebSocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [realTimeUpdates, setRealTimeUpdates] = useState([]);
  const [connectionStats, setConnectionStats] = useState({
    connected: false,
    connectionCount: 0,
    lastMessage: null
  });

  // Memoize callback functions to prevent infinite loop
  const handleMessage = useCallback((message) => {
    console.log('Real-time update:', message);
    
    // Add to real-time updates
    setRealTimeUpdates(prev => [message, ...prev.slice(0, 49)]);
    
    // Update connection stats
    setConnectionStats(prev => ({
      ...prev,
      lastMessage: message,
      connected: true
    }));
  }, []);

  const handleOpen = useCallback(() => {
    console.log('WebSocket connected');
    setConnectionStats(prev => ({
      ...prev,
      connected: true,
      connectionCount: prev.connectionCount + 1
    }));
  }, []);

  const handleClose = useCallback(() => {
    console.log('WebSocket disconnected');
    setConnectionStats(prev => ({
      ...prev,
      connected: false
    }));
  }, []);

  const handleError = useCallback((error) => {
    console.error('WebSocket error:', error);
    setConnectionStats(prev => ({
      ...prev,
      connected: false
    }));
  }, []);

  // WebSocket connection with authentication check
  const {
    connectionState,
    lastMessage,
    messageHistory,
    sendMessage,
    isConnected,
    isConnecting
  } = useWebSocket(WS_URL, {
    autoConnect: !!user,
    showNotifications: true,
    onMessage: handleMessage,
    onOpen: handleOpen,
    onClose: handleClose,
    onError: handleError
  });

  const wsValue = {
    connectionState,
    lastMessage,
    messageHistory,
    sendMessage,
    isConnected,
    isConnecting,
    realTimeUpdates,
    connectionStats,
    clearUpdates: () => setRealTimeUpdates([])
  };

  return (
    <WebSocketContext.Provider value={wsValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" />;
};

const App = () => {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          {/* Performance monitoring completely removed */}
            <WebSocketProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <Toaster position="top-right" />
            </WebSocketProvider>
          {/* Performance monitoring completely removed */}
        </AuthProvider>
      </Router>
    </div>
  );
};

export default App;