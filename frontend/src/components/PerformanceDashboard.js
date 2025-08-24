import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { usePerformance } from './PerformanceProvider';
import { 
  Zap, Clock, Database, TrendingUp, RefreshCw,
  Activity, BarChart3, Cpu, MemoryStick, Trash2,
  AlertTriangle, CheckCircle, Info
} from 'lucide-react';

const PerformanceDashboard = () => {
  const {
    getPerformanceStats,
    getCacheStats,
    isOptimizationEnabled,
    setIsOptimizationEnabled,
    clearCache,
    resetMetrics
  } = usePerformance();

  const [stats, setStats] = useState({});
  const [cacheStats, setCacheStats] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(null);

  const refreshStats = () => {
    setStats(getPerformanceStats());
    setCacheStats(getCacheStats());
  };

  useEffect(() => {
    refreshStats();
    
    // Auto-refresh stats every 5 seconds
    const interval = setInterval(refreshStats, 5000);
    setRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const formatUptime = (uptime) => {
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getPerformanceLevel = () => {
    const cacheHitRate = parseFloat(stats.cacheHitRate || 0);
    
    if (cacheHitRate >= 70) return { level: 'excellent', color: 'emerald' };
    if (cacheHitRate >= 50) return { level: 'good', color: 'cyan' };
    if (cacheHitRate >= 30) return { level: 'moderate', color: 'yellow' };
    return { level: 'poor', color: 'red' };
  };

  const performanceLevel = getPerformanceLevel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
            <Zap className="h-6 w-6 text-yellow-400" />
            <span>Performance Dashboard</span>
          </h2>
          <p className="text-slate-400 mt-1">Monitor and optimize application performance</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="optimization"
              checked={isOptimizationEnabled}
              onCheckedChange={setIsOptimizationEnabled}
            />
            <label htmlFor="optimization" className="text-sm text-slate-300">
              Performance Monitoring
            </label>
          </div>
          <Button variant="outline" size="sm" onClick={refreshStats}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Performance Alert */}
      {performanceLevel.level === 'poor' && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">
            Poor performance detected! Cache hit rate is below 30%. Consider optimizing API calls or clearing cache.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Stats */}
      <div className="dashboard-grid">
        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Cache Performance</CardTitle>
            <Database className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.cacheHitRate}%</div>
            <p className="text-xs text-slate-400 mt-1">
              {stats.totalApiCalls} API calls • {cacheStats.size}/{cacheStats.maxSize} cached
            </p>
            <div className="mt-2">
              <Badge className={`bg-${performanceLevel.color}-500/20 text-${performanceLevel.color}-400 border-${performanceLevel.color}-500/30`}>
                {performanceLevel.level.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Render Performance</CardTitle>
            <Activity className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalRenders}</div>
            <p className="text-xs text-slate-400 mt-1">Total renders</p>
            {Object.keys(stats.averageRenderTimes || {}).length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-500">
                  Avg: {Object.values(stats.averageRenderTimes)[0]}ms
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Memory Usage</CardTitle>
            <MemoryStick className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stats.currentMemoryUsage ? formatBytes(stats.currentMemoryUsage.used) : 'N/A'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {stats.currentMemoryUsage ? 
                `of ${formatBytes(stats.currentMemoryUsage.total)}` : 
                'Memory info unavailable'
              }
            </p>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Session Uptime</CardTitle>
            <Clock className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatUptime(stats.uptime || 0)}</div>
            <p className="text-xs text-slate-400 mt-1">Since page load</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Performance Metrics */}
      <Tabs defaultValue="components" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="components" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            <BarChart3 className="h-4 w-4 mr-2" />
            Components
          </TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
            <TrendingUp className="h-4 w-4 mr-2" />
            API Calls
          </TabsTrigger>
          <TabsTrigger value="cache" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            <Database className="h-4 w-4 mr-2" />
            Cache
          </TabsTrigger>
          <TabsTrigger value="memory" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
            <Cpu className="h-4 w-4 mr-2" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="space-y-4">
          <Card className="glass-effect border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Component Render Times</CardTitle>
              <CardDescription>Average render performance per component</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats.averageRenderTimes || {}).map(([component, time]) => (
                  <div key={component} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                    <span className="text-slate-300 font-medium">{component}</span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-mono ${parseFloat(time) > 100 ? 'text-red-400' : parseFloat(time) > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {time}ms
                      </span>
                      {parseFloat(time) > 100 && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      {parseFloat(time) <= 50 && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                    </div>
                  </div>
                ))}
                {Object.keys(stats.averageRenderTimes || {}).length === 0 && (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">No render data available yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card className="glass-effect border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">API Response Times</CardTitle>
              <CardDescription>Average response times for API endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats.averageApiTimes || {}).map(([endpoint, time]) => (
                  <div key={endpoint} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                    <span className="text-slate-300 font-medium truncate">{endpoint}</span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-mono ${parseFloat(time) > 1000 ? 'text-red-400' : parseFloat(time) > 500 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {time}ms
                      </span>
                    </div>
                  </div>
                ))}
                {Object.keys(stats.averageApiTimes || {}).length === 0 && (
                  <div className="text-center py-8">
                    <TrendingUp className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">No API timing data available yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <Card className="glass-effect border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-white">Cache Management</CardTitle>
                  <CardDescription>Client-side cache statistics and controls</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={clearCache}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Cache
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-800/30 rounded-lg">
                  <div className="text-2xl font-bold text-cyan-400">{cacheStats.size}</div>
                  <p className="text-sm text-slate-400">Cached Entries</p>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-400">{cacheStats.usage}%</div>
                  <p className="text-sm text-slate-400">Cache Usage</p>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-400">{stats.cacheHitRate}%</div>
                  <p className="text-sm text-slate-400">Hit Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="space-y-4">
          <Card className="glass-effect border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">System Performance</CardTitle>
              <CardDescription>Memory usage and system metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.currentMemoryUsage ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <div className="text-2xl font-bold text-orange-400">
                      {formatBytes(stats.currentMemoryUsage.used)}
                    </div>
                    <p className="text-sm text-slate-400">Used Memory</p>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">
                      {formatBytes(stats.currentMemoryUsage.total)}
                    </div>
                    <p className="text-sm text-slate-400">Total Allocated</p>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">
                      {formatBytes(stats.currentMemoryUsage.limit)}
                    </div>
                    <p className="text-sm text-slate-400">Memory Limit</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Info className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400">Memory monitoring not available in this browser</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Performance Actions */}
      <Card className="glass-effect border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-lg text-white">Performance Actions</CardTitle>
          <CardDescription>Tools to optimize application performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={clearCache}>
              <Database className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>
            <Button variant="outline" onClick={resetMetrics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Metrics
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <Zap className="h-4 w-4 mr-2" />
              Reload App
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceDashboard;