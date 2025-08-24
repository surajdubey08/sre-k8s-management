import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

const PerformanceContext = createContext();

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
};

// Performance monitoring and optimization utilities
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      renders: 0,
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      componentRenderTimes: {},
      apiResponseTimes: {},
      memoryUsage: []
    };
    this.observers = [];
    this.startTime = Date.now();
  }

  // Track component render performance
  trackRender(componentName, renderTime) {
    this.metrics.renders++;
    
    if (!this.metrics.componentRenderTimes[componentName]) {
      this.metrics.componentRenderTimes[componentName] = [];
    }
    
    this.metrics.componentRenderTimes[componentName].push({
      time: renderTime,
      timestamp: Date.now()
    });

    // Keep only last 100 measurements per component
    if (this.metrics.componentRenderTimes[componentName].length > 100) {
      this.metrics.componentRenderTimes[componentName].shift();
    }
  }

  // Track API call performance
  trackApiCall(endpoint, responseTime, fromCache = false) {
    this.metrics.apiCalls++;
    
    if (fromCache) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    if (!this.metrics.apiResponseTimes[endpoint]) {
      this.metrics.apiResponseTimes[endpoint] = [];
    }

    this.metrics.apiResponseTimes[endpoint].push({
      time: responseTime,
      timestamp: Date.now(),
      fromCache
    });

    // Keep only last 50 measurements per endpoint
    if (this.metrics.apiResponseTimes[endpoint].length > 50) {
      this.metrics.apiResponseTimes[endpoint].shift();
    }
  }

  // Track memory usage
  trackMemoryUsage() {
    if (performance.memory) {
      this.metrics.memoryUsage.push({
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      });

      // Keep only last 100 measurements
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage.shift();
      }
    }
  }

  // Get performance statistics
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      uptime,
      totalRenders: this.metrics.renders,
      totalApiCalls: this.metrics.apiCalls,
      cacheHitRate: this.metrics.apiCalls > 0 
        ? (this.metrics.cacheHits / this.metrics.apiCalls * 100).toFixed(2)
        : 0,
      averageRenderTimes: this.getAverageRenderTimes(),
      averageApiTimes: this.getAverageApiTimes(),
      currentMemoryUsage: this.getCurrentMemoryUsage()
    };
  }

  getAverageRenderTimes() {
    const averages = {};
    
    for (const [component, times] of Object.entries(this.metrics.componentRenderTimes)) {
      if (times.length > 0) {
        const sum = times.reduce((acc, t) => acc + t.time, 0);
        averages[component] = (sum / times.length).toFixed(2);
      }
    }
    
    return averages;
  }

  getAverageApiTimes() {
    const averages = {};
    
    for (const [endpoint, times] of Object.entries(this.metrics.apiResponseTimes)) {
      if (times.length > 0) {
        const sum = times.reduce((acc, t) => acc + t.time, 0);
        averages[endpoint] = (sum / times.length).toFixed(2);
      }
    }
    
    return averages;
  }

  getCurrentMemoryUsage() {
    if (this.metrics.memoryUsage.length > 0) {
      return this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
    }
    return null;
  }

  // Reset all metrics
  reset() {
    this.metrics = {
      renders: 0,
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      componentRenderTimes: {},
      apiResponseTimes: {},
      memoryUsage: []
    };
    this.startTime = Date.now();
  }
}

// Client-side caching with performance optimization
class ClientCache {
  constructor(maxSize = 100, defaultTTL = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.accessTimes = new Map();
  }

  set(key, value, ttl = this.defaultTTL) {
    // Evict oldest entries if at max capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
    this.accessTimes.set(key, Date.now());
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessTimes.delete(key);
      return null;
    }

    this.accessTimes.set(key, Date.now());
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
    this.accessTimes.delete(key);
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: ((this.cache.size / this.maxSize) * 100).toFixed(2)
    };
  }
}

export const PerformanceProvider = ({ children }) => {
  const [performanceMonitor] = useState(() => new PerformanceMonitor());
  const [clientCache] = useState(() => new ClientCache());
  const [isOptimizationEnabled, setIsOptimizationEnabled] = useState(true);

  // Performance-aware API call wrapper
  const optimizedApiCall = useCallback(async (apiFunction, cacheKey = null, cacheTTL = 300000) => {
    const startTime = Date.now();

    // Check cache first if caching is enabled and key provided
    if (cacheKey && clientCache.has(cacheKey)) {
      const cachedData = clientCache.get(cacheKey);
      const responseTime = Date.now() - startTime;
      
      performanceMonitor.trackApiCall(cacheKey, responseTime, true);
      return cachedData;
    }

    try {
      const result = await apiFunction();
      const responseTime = Date.now() - startTime;

      // Cache the result if caching key provided
      if (cacheKey) {
        clientCache.set(cacheKey, result, cacheTTL);
      }

      performanceMonitor.trackApiCall(cacheKey || 'uncached', responseTime, false);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      performanceMonitor.trackApiCall(cacheKey || 'error', responseTime, false);
      throw error;
    }
  }, [performanceMonitor, clientCache]);

  // Component render timing hook
  const useRenderTiming = (componentName) => {
    const startTime = useMemo(() => Date.now(), []);

    useEffect(() => {
      const renderTime = Date.now() - startTime;
      performanceMonitor.trackRender(componentName, renderTime);
    });
  };

  // Memory monitoring
  useEffect(() => {
    if (!isOptimizationEnabled) return;

    const memoryInterval = setInterval(() => {
      performanceMonitor.trackMemoryUsage();
    }, 10000); // Every 10 seconds

    return () => clearInterval(memoryInterval);
  }, [performanceMonitor, isOptimizationEnabled]);

  // Performance alerts
  useEffect(() => {
    if (!isOptimizationEnabled) return;

    const alertInterval = setInterval(() => {
      const stats = performanceMonitor.getStats();
      
      // Alert on poor performance
      if (stats.cacheHitRate < 30 && stats.totalApiCalls > 10) {
        console.warn(`Low cache hit rate: ${stats.cacheHitRate}%`);
      }

      // Alert on memory issues
      const memUsage = stats.currentMemoryUsage;
      if (memUsage && memUsage.used > memUsage.limit * 0.8) {
        console.warn('High memory usage detected');
        toast.warning('High memory usage - consider refreshing the page');
      }

      // Alert on slow renders
      const avgRenderTimes = stats.averageRenderTimes;
      const slowComponents = Object.entries(avgRenderTimes)
        .filter(([, time]) => parseFloat(time) > 100) // > 100ms
        .map(([name]) => name);
      
      if (slowComponents.length > 0) {
        console.warn('Slow rendering components:', slowComponents);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(alertInterval);
  }, [performanceMonitor, isOptimizationEnabled]);

  // Debounced function helper
  const debounce = useCallback((func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }, []);

  // Throttled function helper
  const throttle = useCallback((func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }, []);

  // Memoize the context functions to prevent infinite re-renders
  const getPerformanceStats = useCallback(() => performanceMonitor.getStats(), [performanceMonitor]);
  const getCacheStats = useCallback(() => clientCache.getStats(), [clientCache]);
  const clearCache = useCallback(() => clientCache.clear(), [clientCache]);
  const resetMetrics = useCallback(() => performanceMonitor.reset(), [performanceMonitor]);

  const value = useMemo(() => ({
    performanceMonitor,
    clientCache,
    optimizedApiCall,
    useRenderTiming,
    isOptimizationEnabled,
    setIsOptimizationEnabled,
    debounce,
    throttle,
    getPerformanceStats,
    getCacheStats,
    clearCache,
    resetMetrics
  }), [
    performanceMonitor,
    clientCache,
    optimizedApiCall,
    useRenderTiming,
    isOptimizationEnabled,
    setIsOptimizationEnabled,
    debounce,
    throttle,
    getPerformanceStats,
    getCacheStats,
    clearCache,
    resetMetrics
  ]);

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
};