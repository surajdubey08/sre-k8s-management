import React, { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';
import { useAuth, useWebSocketContext } from '../App';
import { usePerformance } from './PerformanceProvider';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import ConfigurationEditor from './ConfigurationEditor';
import EnhancedConfigurationEditor from './EnhancedConfigurationEditor';
import OptimizedResourceList from './OptimizedResourceList';
import PerformanceDashboard from './PerformanceDashboard';
import { 
  Shield, Server, Activity, Users, LogOut, RefreshCw, Settings, 
  Play, Square, BarChart3, Clock, AlertTriangle, CheckCircle, 
  XCircle, Zap, Database, Network, Terminal, Eye, Scale,
  Container, Layers, GitBranch, HardDrive, Cpu, MemoryStick,
  Wifi, WifiOff, Radio, TrendingUp
} from 'lucide-react';

const Dashboard = memo(() => {
  const { user, logout } = useAuth();
  const { 
    isConnected, 
    isConnecting, 
    connectionStats, 
    realTimeUpdates, 
    clearUpdates 
  } = useWebSocketContext();
  
  const { 
    optimizedApiCall,
    useRenderTiming,
    debounce,
    getPerformanceStats
  } = usePerformance();

  // Performance monitoring for this component
  useRenderTiming('Dashboard');
  
  const [dashboardStats, setDashboardStats] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [daemonsets, setDaemonsets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [showEnhancedEditor, setShowEnhancedEditor] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Optimized data fetching with caching
  const fetchDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      
      // Use performance-optimized API calls with caching
      const [statsRes, deploymentsRes, daemonsetsRes, auditRes] = await Promise.all([
        optimizedApiCall(
          () => axios.get('/dashboard/stats'),
          'dashboard-stats',
          30000 // Cache for 30 seconds
        ),
        optimizedApiCall(
          () => axios.get('/deployments'),
          'deployments-list',
          60000 // Cache for 1 minute
        ),
        optimizedApiCall(
          () => axios.get('/daemonsets'),
          'daemonsets-list',
          60000 // Cache for 1 minute
        ),
        optimizedApiCall(
          () => axios.get('/audit-logs?limit=50'),
          'audit-logs',
          30000 // Cache for 30 seconds
        )
      ]);

      setDashboardStats(statsRes.data);
      setDeployments(deploymentsRes.data);
      setDaemonsets(daemonsetsRes.data);
      setAuditLogs(auditRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to refresh dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [optimizedApiCall]);

  // Debounced refresh function to avoid excessive API calls
  const debouncedRefresh = useCallback(
    debounce(fetchDashboardData, 1000),
    [fetchDashboardData, debounce]
  );

  const handleScaleDeployment = useCallback(async (namespace, name, replicas) => {
    try {
      await optimizedApiCall(
        () => axios.patch(`/deployments/${namespace}/${name}/scale`, { replicas }),
        null // Don't cache scale operations
      );
      toast.success(`Successfully scaled ${name} to ${replicas} replicas`);
      debouncedRefresh();
    } catch (error) {
      toast.error(`Failed to scale deployment: ${error.response?.data?.detail || error.message}`);
    }
  }, [optimizedApiCall, debouncedRefresh]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status, total, ready) => {
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    if (percentage === 100) return 'text-emerald-400';
    if (percentage > 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusBadge = (ready, total) => {
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    if (percentage === 100) {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Healthy</Badge>;
    }
    if (percentage > 50) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Critical</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto"></div>
          <p className="text-slate-400">Loading SRE Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="glass-effect border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Shield className="h-8 w-8 text-emerald-400" />
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  K8s Control
                </span>
              </div>
              <div className="h-6 w-px bg-slate-600"></div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-yellow-400' : 'bg-red-400'
                }`}></div>
                <span className="text-sm text-slate-300">
                  {dashboardStats?.cluster_status === 'connected' ? 'Cluster Connected' : 'Mock Mode'}
                </span>
                <div className="h-3 w-px bg-slate-600 mx-2"></div>
                <div className="flex items-center space-x-1">
                  {isConnected ? (
                    <Wifi className="h-3 w-3 text-emerald-400" />
                  ) : isConnecting ? (
                    <Radio className="h-3 w-3 text-yellow-400 animate-pulse" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-400" />
                  )}
                  <span className="text-xs text-slate-400">
                    {isConnected ? 'Live' : isConnecting ? 'Connecting...' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={fetchDashboardData}
                disabled={refreshing}
                className="text-slate-300 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              
              <div className="flex items-center space-x-2 px-3 py-1 bg-slate-800/50 rounded-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center text-sm font-bold">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="text-sm">
                  <p className="text-white font-medium">{user?.username}</p>
                  <p className="text-slate-400 text-xs">{user?.role}</p>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={logout} className="text-slate-300 hover:text-red-400">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="deployments" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <Container className="h-4 w-4 mr-2" />
              Deployments
            </TabsTrigger>
            <TabsTrigger value="daemonsets" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
              <Layers className="h-4 w-4 mr-2" />
              DaemonSets
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
              <Eye className="h-4 w-4 mr-2" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400">
              <TrendingUp className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Stats Cards */}
            <div className="dashboard-grid">
              <Card className="metric-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">Deployments</CardTitle>
                  <Container className="h-4 w-4 text-emerald-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{dashboardStats?.deployments?.total || 0}</div>
                  <div className="flex items-center space-x-4 mt-2">
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3 text-emerald-400" />
                      <span className="text-xs text-emerald-400">{dashboardStats?.deployments?.healthy || 0} Healthy</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <XCircle className="h-3 w-3 text-red-400" />
                      <span className="text-xs text-red-400">{dashboardStats?.deployments?.unhealthy || 0} Issues</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="metric-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">DaemonSets</CardTitle>
                  <Layers className="h-4 w-4 text-cyan-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{dashboardStats?.daemonsets?.total || 0}</div>
                  <div className="flex items-center space-x-4 mt-2">
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3 text-emerald-400" />
                      <span className="text-xs text-emerald-400">{dashboardStats?.daemonsets?.healthy || 0} Healthy</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <XCircle className="h-3 w-3 text-red-400" />
                      <span className="text-xs text-red-400">{dashboardStats?.daemonsets?.unhealthy || 0} Issues</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="metric-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">Operations (24h)</CardTitle>
                  <Activity className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{dashboardStats?.recent_operations || 0}</div>
                  <p className="text-xs text-slate-400 mt-2">Recent cluster operations</p>
                </CardContent>
              </Card>

              <Card className="metric-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-300">Cluster Status</CardTitle>
                  <Server className="h-4 w-4 text-yellow-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white capitalize">
                    {dashboardStats?.cluster_status?.replace('_', ' ') || 'Unknown'}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Connection status</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass-effect border-slate-700/50">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="h-5 w-5 text-emerald-400" />
                    <span>Recent Activity</span>
                  </CardTitle>
                  <CardDescription>Latest operations and events from your cluster</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {auditLogs.slice(0, 5).map((log, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${log.success ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                          <div>
                            <p className="text-sm text-white font-medium">{log.operation}</p>
                            <p className="text-xs text-slate-400">{log.resource} by {log.user}</p>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDate(log.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Real-time Updates */}
              <Card className="glass-effect border-slate-700/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                      <CardTitle className="flex items-center space-x-2">
                        <Zap className="h-5 w-5 text-cyan-400" />
                        <span>Real-time Updates</span>
                      </CardTitle>
                    </div>
                    {realTimeUpdates.length > 0 && (
                      <Button variant="outline" size="sm" onClick={clearUpdates}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    Live events from WebSocket connection
                    {connectionStats.connectionCount > 1 && (
                      <span className="ml-2 text-cyan-400">
                        (Reconnected {connectionStats.connectionCount - 1} times)
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {realTimeUpdates.length === 0 ? (
                      <div className="text-center py-8">
                        <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${
                          isConnected ? 'bg-emerald-500/20' : 'bg-slate-500/20'
                        }`}>
                          {isConnected ? (
                            <Wifi className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                        <p className="text-slate-400 text-sm">
                          {isConnected ? 'Waiting for real-time updates...' : 'WebSocket disconnected'}
                        </p>
                      </div>
                    ) : (
                      realTimeUpdates.slice(0, 10).map((update, index) => (
                        <div key={index} className="p-2 bg-slate-800/20 rounded border-l-2 border-cyan-400">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white font-medium">
                              {update.type?.replace('_', ' ').toUpperCase() || 'UPDATE'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date().toLocaleTimeString()}
                            </span>
                          </div>
                          {update.data && (
                            <p className="text-xs text-slate-400 mt-1">
                              {JSON.stringify(update.data, null, 2).slice(0, 100)}
                              {JSON.stringify(update.data).length > 100 && '...'}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Deployments Tab - Using Optimized Resource List */}
          <TabsContent value="deployments" className="space-y-6 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Deployments</h2>
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {deployments.length} Total
              </Badge>
            </div>

            <OptimizedResourceList
              resources={deployments}
              resourceType="deployment"
              onScaleDeployment={handleScaleDeployment}
              onConfigurationUpdated={debouncedRefresh}
              loading={loading}
            />
          </TabsContent>

          {/* DaemonSets Tab - Using Optimized Resource List */}
          <TabsContent value="daemonsets" className="space-y-6 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">DaemonSets</h2>
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {daemonsets.length} Total
              </Badge>
            </div>

            <OptimizedResourceList
              resources={daemonsets}
              resourceType="daemonset"
              onScaleDeployment={handleScaleDeployment}
              onConfigurationUpdated={debouncedRefresh}
              loading={loading}
            />
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit" className="space-y-6 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Audit Logs</h2>
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {auditLogs.length} Entries
              </Badge>
            </div>

            <Card className="glass-effect border-slate-700/50">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Terminal className="h-5 w-5 text-purple-400" />
                  <span>Security & Operations Log</span>
                </CardTitle>
                <CardDescription>Complete audit trail of all cluster operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {auditLogs.map((log, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-slate-800/20 rounded-lg hover:bg-slate-800/40 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${log.success ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white truncate">
                            {log.operation}
                          </p>
                          <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                            {formatDate(log.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Resource: <span className="font-mono">{log.resource}</span> | 
                          User: <span className="font-medium">{log.user}</span>
                        </p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs font-mono">
                            <pre className="text-slate-400 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6 mt-6">
            <PerformanceDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard;