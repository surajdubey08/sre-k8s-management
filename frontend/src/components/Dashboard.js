import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import ConfigurationEditor from './ConfigurationEditor';
import { 
  Shield, Server, Activity, Users, LogOut, RefreshCw, Settings, 
  Play, Square, BarChart3, Clock, AlertTriangle, CheckCircle, 
  XCircle, Zap, Database, Network, Terminal, Eye, Scale,
  Container, Layers, GitBranch, HardDrive, Cpu, MemoryStick
} from 'lucide-react';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [dashboardStats, setDashboardStats] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [daemonsets, setDaemonsets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const [statsRes, deploymentsRes, daemonsetsRes, auditRes] = await Promise.all([
        axios.get('/dashboard/stats'),
        axios.get('/deployments'),
        axios.get('/daemonsets'),
        axios.get('/audit-logs?limit=50')
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
  };

  const handleScaleDeployment = async (namespace, name, replicas) => {
    try {
      await axios.patch(`/deployments/${namespace}/${name}/scale`, { replicas });
      toast.success(`Successfully scaled ${name} to ${replicas} replicas`);
      fetchDashboardData();
    } catch (error) {
      toast.error(`Failed to scale deployment: ${error.response?.data?.detail || error.message}`);
    }
  };

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
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-300">
                  {dashboardStats?.cluster_status === 'connected' ? 'Cluster Connected' : 'Mock Mode'}
                </span>
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
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700">
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
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments" className="space-y-6 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Deployments</h2>
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {deployments.length} Total
              </Badge>
            </div>

            <div className="resource-grid">
              {deployments.map((deployment, index) => (
                <Card key={index} className="resource-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg text-white flex items-center space-x-2">
                        <Container className="h-5 w-5 text-cyan-400" />
                        <span>{deployment.name}</span>
                      </CardTitle>
                      {getStatusBadge(deployment.status.ready_replicas, deployment.status.replicas)}
                    </div>
                    <CardDescription>
                      <span className="text-slate-400">Namespace: </span>
                      <span className="text-slate-300">{deployment.namespace}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-400">Replicas</p>
                        <p className={`font-mono font-bold ${getStatusColor(deployment.status, deployment.status.replicas, deployment.status.ready_replicas)}`}>
                          {deployment.status.ready_replicas}/{deployment.status.replicas}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Updated</p>
                        <p className="font-mono text-slate-300">{deployment.status.updated_replicas || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Available</p>
                        <p className="font-mono text-slate-300">{deployment.status.available_replicas || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Created</p>
                        <p className="text-xs text-slate-400">{formatDate(deployment.created)}</p>
                      </div>
                    </div>

                    {deployment.labels && (
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Labels</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(deployment.labels).slice(0, 3).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs border-slate-600 text-slate-400">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="btn-secondary flex-1"
                        onClick={() => handleScaleDeployment(deployment.namespace, deployment.name, deployment.status.replicas + 1)}
                      >
                        <Scale className="h-3 w-3 mr-1" />
                        Scale Up
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="btn-secondary flex-1"
                        onClick={() => handleScaleDeployment(deployment.namespace, deployment.name, Math.max(0, deployment.status.replicas - 1))}
                        disabled={deployment.status.replicas === 0}
                      >
                        <Scale className="h-3 w-3 mr-1" />
                        Scale Down
                      </Button>
                    </div>
                    
                    <div className="pt-2">
                      <ConfigurationEditor
                        resource={deployment}
                        resourceType="deployment"
                        onConfigurationUpdated={fetchDashboardData}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {deployments.length === 0 && (
              <Card className="glass-effect text-center py-12">
                <CardContent>
                  <Container className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400">No deployments found</p>
                  <p className="text-slate-500 text-sm mt-2">
                    {dashboardStats?.cluster_status === 'mock_mode' 
                      ? 'Connect to a real cluster to see deployments' 
                      : 'Deploy your first application to get started'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* DaemonSets Tab */}
          <TabsContent value="daemonsets" className="space-y-6 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">DaemonSets</h2>
              <Badge variant="outline" className="text-slate-300 border-slate-600">
                {daemonsets.length} Total
              </Badge>
            </div>

            <div className="resource-grid">
              {daemonsets.map((daemonset, index) => (
                <Card key={index} className="resource-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg text-white flex items-center space-x-2">
                        <Layers className="h-5 w-5 text-blue-400" />
                        <span>{daemonset.name}</span>
                      </CardTitle>
                      {getStatusBadge(daemonset.status.number_ready, daemonset.status.desired_number_scheduled)}
                    </div>
                    <CardDescription>
                      <span className="text-slate-400">Namespace: </span>
                      <span className="text-slate-300">{daemonset.namespace}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-400">Ready</p>
                        <p className={`font-mono font-bold ${getStatusColor(daemonset.status, daemonset.status.desired_number_scheduled, daemonset.status.number_ready)}`}>
                          {daemonset.status.number_ready}/{daemonset.status.desired_number_scheduled}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Current</p>
                        <p className="font-mono text-slate-300">{daemonset.status.current_number_scheduled || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Updated</p>
                        <p className="font-mono text-slate-300">{daemonset.status.updated_number_scheduled || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Available</p>
                        <p className="font-mono text-slate-300">{daemonset.status.number_available || 0}</p>
                      </div>
                    </div>

                    {daemonset.labels && (
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Labels</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(daemonset.labels).slice(0, 3).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs border-slate-600 text-slate-400">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-500">
                      Created: {formatDate(daemonset.created)}
                    </div>
                    
                    <div className="pt-2">
                      <ConfigurationEditor
                        resource={daemonset}
                        resourceType="daemonset"
                        onConfigurationUpdated={fetchDashboardData}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {daemonsets.length === 0 && (
              <Card className="glass-effect text-center py-12">
                <CardContent>
                  <Layers className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400">No daemonsets found</p>
                  <p className="text-slate-500 text-sm mt-2">
                    {dashboardStats?.cluster_status === 'mock_mode' 
                      ? 'Connect to a real cluster to see daemonsets' 
                      : 'DaemonSets ensure pods run on all nodes'}
                  </p>
                </CardContent>
              </Card>
            )}
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
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;