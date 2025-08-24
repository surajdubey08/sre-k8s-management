import React, { useState, useMemo, useCallback, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import EnhancedConfigurationEditor from './EnhancedConfigurationEditor';
import ConfigurationEditor from './ConfigurationEditor';
import { 
  Container, Layers, Scale, CheckCircle, XCircle, 
  AlertTriangle, Search, Filter 
} from 'lucide-react';

// Memoized resource item component for performance
const ResourceItem = memo(({ 
  resource, 
  resourceType, 
  index, 
  style,
  onScaleDeployment,
  onConfigurationUpdated,
  showEnhancedEditor,
  onToggleEditor 
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

  return (
    <div style={style} className="px-2 py-1">
      <Card className="resource-card h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-white flex items-center space-x-2">
              {resourceType === 'deployment' ? (
                <Container className="h-5 w-5 text-cyan-400" />
              ) : (
                <Layers className="h-5 w-5 text-blue-400" />
              )}
              <span className="truncate">{resource.name}</span>
            </CardTitle>
            {getStatusBadge(statusData.ready, statusData.total)}
          </div>
          <div className="text-sm">
            <span className="text-slate-400">Namespace: </span>
            <span className="text-slate-300">{resource.namespace}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">
                {resourceType === 'deployment' ? 'Replicas' : 'Ready'}
              </p>
              <p className={`font-mono font-bold ${getStatusColor(resource.status, statusData.total, statusData.ready)}`}>
                {statusData.ready}/{statusData.total}
              </p>
            </div>
            <div>
              <p className="text-slate-400">
                {resourceType === 'deployment' ? 'Updated' : 'Current'}
              </p>
              <p className="font-mono text-slate-300">
                {resourceType === 'deployment' ? statusData.updated : statusData.current}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Available</p>
              <p className="font-mono text-slate-300">{statusData.available || 0}</p>
            </div>
            <div>
              <p className="text-slate-400">Created</p>
              <p className="text-xs text-slate-400">{formatDate(resource.created)}</p>
            </div>
          </div>

          {resource.labels && (
            <div>
              <p className="text-slate-400 text-sm mb-2">Labels</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(resource.labels).slice(0, 3).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="text-xs border-slate-600 text-slate-400">
                    {key}: {value}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {resourceType === 'deployment' && (
            <div className="flex space-x-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="btn-secondary flex-1"
                onClick={() => onScaleDeployment(resource.namespace, resource.name, resource.status.replicas + 1)}
              >
                <Scale className="h-3 w-3 mr-1" />
                Scale Up
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="btn-secondary flex-1"
                onClick={() => onScaleDeployment(resource.namespace, resource.name, Math.max(0, resource.status.replicas - 1))}
                disabled={resource.status.replicas === 0}
              >
                <Scale className="h-3 w-3 mr-1" />
                Scale Down
              </Button>
            </div>
          )}
          
          <div className="pt-2">
            <div className="flex space-x-2">
              {showEnhancedEditor ? (
                <EnhancedConfigurationEditor
                  resource={resource}
                  resourceType={resourceType}
                  onConfigurationUpdated={onConfigurationUpdated}
                />
              ) : (
                <ConfigurationEditor
                  resource={resource}
                  resourceType={resourceType}
                  onConfigurationUpdated={onConfigurationUpdated}
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleEditor(resource.name)}
                className="text-xs"
              >
                {showEnhancedEditor ? 'Basic' : 'Enhanced'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

ResourceItem.displayName = 'ResourceItem';

const OptimizedResourceList = ({ 
  resources, 
  resourceType, 
  onScaleDeployment,
  onConfigurationUpdated,
  loading = false 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [showEnhancedEditor, setShowEnhancedEditor] = useState({});

  const handleToggleEditor = useCallback((resourceName) => {
    setShowEnhancedEditor(prev => ({
      ...prev,
      [resourceName]: !prev[resourceName]
    }));
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
      showEnhancedEditor={showEnhancedEditor[filteredResources[index]?.name]}
      onToggleEditor={handleToggleEditor}
    />
  ), [filteredResources, resourceType, onScaleDeployment, onConfigurationUpdated, showEnhancedEditor, handleToggleEditor]);

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

      {/* Virtualized Resource List */}
      {filteredResources.length > 0 ? (
        <div className="h-96 w-full">
          <List
            height={384} // 96 * 4 (h-96 in pixels)
            itemCount={filteredResources.length}
            itemSize={280} // Approximate height of each resource card
            className="scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600"
          >
            {renderResourceItem}
          </List>
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