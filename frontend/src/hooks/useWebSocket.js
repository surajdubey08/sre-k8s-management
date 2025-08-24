import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

const useWebSocket = (url, options = {}) => {
  const [connectionState, setConnectionState] = useState('Disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [messageHistory, setMessageHistory] = useState([]);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    pingInterval = 30000,
    maxMessageHistory = 100,
    autoConnect = true,
    showNotifications = true
  } = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionState('Connecting');
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = (event) => {
        console.log('WebSocket connected');
        setConnectionState('Connected');
        reconnectAttemptsRef.current = 0;
        setConnectionCount(prev => prev + 1);
        
        if (showNotifications && reconnectAttemptsRef.current > 0) {
          toast.success('Real-time connection restored');
        }
        
        // Start ping interval
        if (pingInterval > 0) {
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
            }
          }, pingInterval);
        }
        
        onOpen?.(event);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
          
          // Add to message history
          setMessageHistory(prev => {
            const newHistory = [message, ...prev];
            return newHistory.slice(0, maxMessageHistory);
          });
          
          // Handle ping/pong
          if (message.type === 'pong') {
            return;
          }
          
          // Show notification for important updates
          if (showNotifications && message.type !== 'ping') {
            handleMessageNotification(message);
          }
          
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionState('Disconnected');
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        onClose?.(event);
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttemptsRef.current < reconnectAttempts) {
          attemptReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('Error');
        onError?.(error);
        
        if (showNotifications) {
          toast.error('Real-time connection error');
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionState('Error');
      if (showNotifications) {
        toast.error('Failed to establish real-time connection');
      }
    }
  }, [url]); // Only depend on url to reduce re-creation

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= reconnectAttempts) {
      if (showNotifications) {
        toast.error('Real-time connection failed - maximum reconnection attempts reached');
      }
      return;
    }

    reconnectAttemptsRef.current += 1;
    setConnectionState('Reconnecting');
    
    if (showNotifications) {
      toast.info(`Reconnecting... (${reconnectAttemptsRef.current}/${reconnectAttempts})`);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, reconnectInterval);
  }, [connect, reconnectAttempts, reconnectInterval, showNotifications]);

  const handleMessageNotification = (message) => {
    switch (message.type) {
      case 'resource_updated':
        toast.success(`${message.data.resource_type} "${message.data.name}" updated by ${message.data.user}`);
        break;
      case 'audit_log':
        if (message.data.success) {
          toast.info(`${message.data.operation} completed`);
        } else {
          toast.error(`${message.data.operation} failed`);
        }
        break;
      case 'batch_operation':
        toast.info(`Batch operation completed: ${message.data.success_count} successful, ${message.data.failed_count} failed`);
        break;
      case 'cache_invalidated':
        toast.info('Cache refreshed - data updated');
        break;
      default:
        // Don't show notifications for unknown message types
        break;
    }
  };

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setConnectionState('Disconnected');
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('WebSocket is not connected');
    return false;
  }, []);

  const getConnectionStatus = useCallback(() => {
    return {
      state: connectionState,
      connected: connectionState === 'Connected',
      connecting: connectionState === 'Connecting',
      reconnecting: connectionState === 'Reconnecting',
      error: connectionState === 'Error',
      connectionCount,
      reconnectAttempts: reconnectAttemptsRef.current
    };
  }, [connectionState, connectionCount]);

  // Auto-connect on mount - remove connect/disconnect from dependencies to avoid infinite loop
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only depend on autoConnect, not the functions

  // Cleanup on unmount - remove disconnect from dependencies
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, []); // No dependencies for cleanup

  return {
    connectionState,
    lastMessage,
    messageHistory,
    connect,
    disconnect,
    sendMessage,
    getConnectionStatus,
    isConnected: connectionState === 'Connected',
    isConnecting: connectionState === 'Connecting' || connectionState === 'Reconnecting'
  };
};

export default useWebSocket;