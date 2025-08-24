import React, { useState, useMemo, useCallback, memo } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import EnhancedConfigurationEditor from './EnhancedConfigurationEditor';
import { 
  Container, Layers, Search, Filter, Plus, Minus,
  RotateCcw, CheckCircle, XCircle, AlertTriangle, Settings
} from 'lucide-react';

// Memoized resource card component for performance
const ResourceCard = memo(({ 
  resource, 
  resourceType, 
  onScaleDeployment,
  onConfigurationUpdated,
  onRestartResource
}) => {
  const getStatusColor = useCallback((status, total, ready) => {
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    if (percentage === 100) return 'text-emerald-400';
    if (percentage > 50) return 'text-yellow-400';
    return 'text-red-400';
  }, []);

  const getStatusBadge = useCallback((ready, total) => {
    const percentage = total > 0 ? (ready / total) * 100 : 0;
    if (percentage === 100) {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Healthy</Badge>;
    }
    if (percentage > 50) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Critical</Badge>;
  }, []);

  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleString();
  }, []);

  const statusData = useMemo(() => {
    if (resourceType === 'deployment') {
      return {
        ready: resource.status.ready_replicas,
        total: resource.status.replicas,
        updated: resource.status.updated_replicas,
        available: resource.status.available_replicas
      };
    } else {
      return {
        ready: resource.status.number_ready,
        total: resource.status.desired_number_scheduled,
        current: resource.status.current_number_scheduled,
        updated: resource.status.updated_number_scheduled,
        available: resource.status.number_available
      };
    }
  }, [resource.status, resourceType]);

  const handleScaleUp = () => {
    onScaleDeployment(resource.namespace, resource.name, resource.status.replicas + 1);
  };

  const handleScaleDown = () => {
    onScaleDeployment(resource.namespace, resource.name, Math.max(0, resource.status.replicas - 1));
  };

  const handleRestart = () => {
    if (onRestartResource) {
      onRestartResource(resource.namespace, resource.name, resourceType);
    }
  };

  return (
    <Card className="resource-card h-full hover:bg-slate-800/30 transition-colors border-slate-700 bg-slate-800/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white flex items-center space-x-3">
            {resourceType === 'deployment' ? (
              <Container className="h-5 w-5 text-cyan-400" />
            ) : (
              <Layers className="h-5 w-5 text-blue-400" />
            )}
            <span className="truncate">{resource.name}</span>
          </CardTitle>
          {getStatusBadge(statusData.ready, statusData.total)}
        </div>
        <div className="text-sm flex items-center space-x-4">
          <span className="text-slate-400">Namespace:</span>
          <Badge variant="outline" className="text-slate-300 border-slate-600 text-xs">
            {resource.namespace}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-slate-900/30 rounded-lg">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              {resourceType === 'deployment' ? 'Replicas' : 'Ready'}
            </p>
            <p className={`text-lg font-bold font-mono ${getStatusColor(resource.status, statusData.total, statusData.ready)}`}>
              {statusData.ready}/{statusData.total}
            </p>
          </div>
          <div className="text-center p-3 bg-slate-900/30 rounded-lg">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              {resourceType === 'deployment' ? 'Updated' : 'Current'}
            </p>
            <p className="text-lg font-bold font-mono text-slate-300">
              {resourceType === 'deployment' ? statusData.updated : statusData.current}
            </p>
          </div>
          <div className="text-center p-3 bg-slate-900/30 rounded-lg">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Available</p>
            <p className="text-lg font-bold font-mono text-slate-300">{statusData.available || 0}</p>
          </div>
          <div className="text-center p-3 bg-slate-900/30 rounded-lg">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Age</p>
            <p className="text-xs text-slate-300 font-mono">{formatDate(resource.created)}</p>
          </div>
        </div>

        {/* Labels */}
        {resource.labels && (
          <div>
            <p className="text-slate-400 text-sm mb-2 font-medium">Labels</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(resource.labels).slice(0, 3).map(([key, value]) => (
                <Badge key={key} variant="outline" className="text-xs border-slate-600 text-slate-400">
                  {key}: {value}
                </Badge>
              ))}
              {Object.keys(resource.labels).length > 3 && (
                <Badge variant="outline" className="text-xs border-slate-600 text-slate-500">
                  +{Object.keys(resource.labels).length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          {/* Scaling Actions (only for deployments) */}
          {resourceType === 'deployment' && (
            <div className="flex space-x-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                onClick={handleScaleUp}
              >
                <Plus className="h-4 w-4 mr-2" />
                Scale Up
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 hover:bg-red-500/10 hover:border-red-500/50"
                onClick={handleScaleDown}
                disabled={resource.status.replicas === 0}
              >
                <Minus className="h-4 w-4 mr-2" />
                Scale Down
              </Button>
            </div>
          )}
          
          {/* Management Actions */}
          <div className="flex space-x-2">
            <EnhancedConfigurationEditor
              resource={resource}
              resourceType={resourceType}
              onConfigurationUpdated={onConfigurationUpdated}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestart}
              className="flex-1 hover:bg-yellow-500/10 hover:border-yellow-500/50"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

ResourceCard.displayName = 'ResourceCard';

const OptimizedResourceList = ({ 
  resources, 
  resourceType, 
  onScaleDeployment,
  onConfigurationUpdated,
  loading = false 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('');

  const handleRestartResource = useCallback(async (namespace, name, type) => {
    // TODO: Implement restart functionality
    console.log(`Restarting ${type} ${namespace}/${name}`);
    // You can add the restart API call here
  }, []);

  const uniqueNamespaces = useMemo(() => {
    return [...new Set(resources.map(r => r.namespace))].sort();
  }, [resources]);

  const filteredResources = useMemo(() => {
    return resources.filter(resource => {
      const matchesSearch = resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           resource.namespace.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesNamespace = !namespaceFilter || resource.namespace === namespaceFilter;
      return matchesSearch && matchesNamespace;
    });
  }, [resources, searchTerm, namespaceFilter]);

  const renderResourceItem = useCallback(({ index, style }) => (
    <ResourceItem
      resource={filteredResources[index]}
      resourceType={resourceType}
      index={index}
      style={style}
      onScaleDeployment={onScaleDeployment}
      onConfigurationUpdated={onConfigurationUpdated}
      onRestartResource={handleRestartResource}
    />
  ), [filteredResources, resourceType, onScaleDeployment, onConfigurationUpdated, handleRestartResource]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
        <span className="ml-3 text-slate-400">Loading {resourceType}s...</span>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <Card className="glass-effect text-center py-12">
        <CardContent>
          {resourceType === 'deployment' ? (
            <Container className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          ) : (
            <Layers className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          )}
          <p className="text-slate-400">No {resourceType}s found</p>
          <p className="text-slate-500 text-sm mt-2">
            Connect to a real cluster to see {resourceType}s
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 max-w-md space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${resourceType}s...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
              className="pl-10 pr-8 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent appearance-none"
            >
              <option value="">All Namespaces</option>
              {uniqueNamespaces.map(namespace => (
                <option key={namespace} value={namespace}>{namespace}</option>
              ))}
            </select>
          </div>
        </div>
        
        <Badge variant="outline" className="text-slate-300 border-slate-600">
          {filteredResources.length} of {resources.length} {resourceType}s
        </Badge>
      </div>

      {/* Card Grid Layout */}
      {filteredResources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredResources.map((resource, index) => (
            <ResourceCard
              key={`${resource.namespace}-${resource.name}`}
              resource={resource}
              resourceType={resourceType}
              onScaleDeployment={onScaleDeployment}
              onConfigurationUpdated={onConfigurationUpdated}
              onRestartResource={handleRestartResource}
            />
          ))}
        </div>
      ) : (
        <Card className="glass-effect text-center py-12">
          <CardContent>
            <Search className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No {resourceType}s match your search</p>
            <p className="text-slate-500 text-sm mt-2">
              Try adjusting your search terms or filters
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default memo(OptimizedResourceList);