import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { 
  Settings, Save, Eye, Code, FileText, AlertTriangle, 
  CheckCircle, X, RotateCcw, Zap, PlayCircle, Pause,
  Activity, Clock, History, Shield
} from 'lucide-react';
import axios from 'axios';

const EnhancedConfigurationEditor = ({ 
  resource, 
  resourceType, 
  onConfigurationUpdated,
  enableRealTimeUpdates = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [originalConfig, setOriginalConfig] = useState('');
  const [currentConfig, setCurrentConfig] = useState('');
  const [viewMode, setViewMode] = useState('yaml'); // yaml, json, diff
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [previewResult, setPreviewResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [websocket, setWebsocket] = useState(null);
  const [realTimeUpdates, setRealTimeUpdates] = useState([]);
  const [rollbackHistory, setRollbackHistory] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (enableRealTimeUpdates && isOpen) {
      const ws = new WebSocket(process.env.REACT_APP_BACKEND_URL?.replace('http', 'ws') + '/ws');
      
      ws.onopen = () => {
        console.log('WebSocket connected for real-time configuration updates');
        setWebsocket(ws);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'resource_updated' && 
            message.data.resource_type === resourceType &&
            message.data.namespace === resource.namespace &&
            message.data.name === resource.name) {
          
          setRealTimeUpdates(prev => [...prev, {
            timestamp: new Date().toISOString(),
            message: `Configuration updated by ${message.data.user}`,
            type: message.data.success ? 'success' : 'error'
          }]);
          
          // Optionally refresh configuration if updated by another user
          if (message.data.user !== getCurrentUser()) {
            toast.info('Configuration updated by another user. Click refresh to see changes.');
          }
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWebsocket(null);
      };
      
      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
    }
  }, [isOpen, enableRealTimeUpdates, resourceType, resource.namespace, resource.name]);

  const getCurrentUser = () => {
    // Get current user from auth context or localStorage
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.username || 'unknown';
  };

  const fetchConfiguration = async () => {
    setIsLoading(true);
    setValidationError('');
    setValidationErrors([]);
    
    try {
      const endpoint = `/${resourceType}/${resource.namespace}/${resource.name}/config`;
      const response = await axios.get(endpoint);
      
      const configYaml = yaml.dump(response.data, { 
        indent: 2, 
        lineWidth: 120,
        noRefs: true 
      });
      
      setOriginalConfig(configYaml);
      setCurrentConfig(configYaml);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
      toast.error(`Failed to load ${resourceType} configuration`);
      setValidationError(error.response?.data?.detail || 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const validateConfiguration = async (config) => {
    if (!config) return [];
    
    try {
      setIsValidating(true);
      const parsedConfig = viewMode === 'yaml' ? yaml.load(config) : JSON.parse(config);
      
      const response = await axios.post('/validate-config', {
        resource_type: resourceType,
        config: parsedConfig
      });
      
      return response.data.validation_errors || [];
    } catch (error) {
      console.error('Validation error:', error);
      return [error.response?.data?.detail || error.message || 'Validation failed'];
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfigChange = useCallback(async (value) => {
    setCurrentConfig(value || '');
    setHasChanges(value !== originalConfig);
    setValidationError('');
    
    // Validate YAML/JSON syntax
    try {
      if (viewMode === 'yaml') {
        yaml.load(value || '');
      } else if (viewMode === 'json') {
        JSON.parse(value || '{}');
      }
      
      // Debounced validation
      const validationErrors = await validateConfiguration(value);
      setValidationErrors(validationErrors);
    } catch (error) {
      setValidationError(`Invalid ${viewMode.toUpperCase()}: ${error.message}`);
      setValidationErrors([]);
    }
  }, [originalConfig, viewMode, resourceType]);

  const handlePreview = async () => {
    if (validationError || validationErrors.length > 0) {
      toast.error('Please fix validation errors before previewing');
      return;
    }

    setIsSaving(true);
    
    try {
      // Parse configuration based on current view mode
      let configData;
      if (viewMode === 'yaml') {
        configData = yaml.load(currentConfig);
      } else {
        configData = JSON.parse(currentConfig);
      }

      const endpoint = `/${resourceType}/${resource.namespace}/${resource.name}/config`;
      
      const response = await axios.put(endpoint, {
        configuration: configData,
        dry_run: true
      });

      setPreviewResult(response.data);
      setShowPreview(true);
      toast.success('Preview generated successfully');
    } catch (error) {
      console.error('Failed to generate preview:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate preview');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (validationError || validationErrors.length > 0) {
      toast.error('Please fix validation errors before saving');
      return;
    }

    setIsSaving(true);
    
    try {
      // Parse configuration based on current view mode
      let configData;
      if (viewMode === 'yaml') {
        configData = yaml.load(currentConfig);
      } else {
        configData = JSON.parse(currentConfig);
      }

      const endpoint = `/${resourceType}/${resource.namespace}/${resource.name}/config`;
      
      const response = await axios.put(endpoint, {
        configuration: configData,
        dry_run: false
      });

      if (response.data.rollback_key) {
        setRollbackHistory(prev => [...prev, {
          timestamp: new Date().toISOString(),
          rollback_key: response.data.rollback_key,
          message: response.data.message,
          changes: response.data.applied_changes.length
        }]);
      }

      toast.success(response.data.message);
      
      // Update the original config
      setOriginalConfig(currentConfig);
      setHasChanges(false);
      setIsOpen(false);
      
      // Notify parent component
      if (onConfigurationUpdated) {
        onConfigurationUpdated();
      }
      
    } catch (error) {
      console.error('Failed to save configuration:', error);
      toast.error(error.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCurrentConfig(originalConfig);
    setHasChanges(false);
    setValidationError('');
    setValidationErrors([]);
    toast.info('Configuration reset to original');
  };

  const convertToJson = () => {
    try {
      const yamlData = yaml.load(currentConfig);
      const jsonConfig = JSON.stringify(yamlData, null, 2);
      setCurrentConfig(jsonConfig);
      setViewMode('json');
    } catch (error) {
      toast.error('Invalid YAML format');
    }
  };

  const convertToYaml = () => {
    try {
      const jsonData = JSON.parse(currentConfig);
      const yamlConfig = yaml.dump(jsonData, { 
        indent: 2, 
        lineWidth: 120,
        noRefs: true 
      });
      setCurrentConfig(yamlConfig);
      setViewMode('yaml');
    } catch (error) {
      toast.error('Invalid JSON format');
    }
  };

  const handleOpen = (open) => {
    setIsOpen(open);
    if (open) {
      fetchConfiguration();
      setRealTimeUpdates([]);
    } else {
      // Reset state when closing
      setOriginalConfig('');
      setCurrentConfig('');
      setHasChanges(false);
      setValidationError('');
      setValidationErrors([]);
      setShowPreview(false);
      setPreviewResult(null);
      setRealTimeUpdates([]);
    }
  };

  const getValidationStatus = () => {
    if (isValidating) return { color: 'text-blue-400', icon: Activity, text: 'Validating...' };
    if (validationError) return { color: 'text-red-400', icon: X, text: 'Syntax Error' };
    if (validationErrors.length > 0) return { color: 'text-orange-400', icon: AlertTriangle, text: 'Validation Issues' };
    if (!hasChanges && currentConfig) return { color: 'text-emerald-400', icon: CheckCircle, text: 'Valid & Saved' };
    if (hasChanges && !validationError && validationErrors.length === 0) return { color: 'text-cyan-400', icon: Eye, text: 'Valid Changes' };
    return { color: 'text-slate-400', icon: Code, text: 'Ready' };
  };

  const validationStatus = getValidationStatus();

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="btn-secondary">
          <Settings className="h-3 w-3 mr-1" />
          Edit Config
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-7xl max-h-[95vh] glass-effect border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl text-white flex items-center space-x-2">
                <Code className="h-5 w-5 text-cyan-400" />
                <span>Enhanced Configuration Editor</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 mt-1">
                {resource.name} ({resourceType}) in {resource.namespace} namespace
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              {websocket && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <Activity className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
              <Badge className={`border-opacity-30 ${validationStatus.color.replace('text-', 'bg-').replace('-400', '-500/20 text-').replace('-500/20 text-', '-400 border-').replace('-400 border-', '-500/30')}`}>
                <validationStatus.icon className="h-3 w-3 mr-1" />
                {validationStatus.text}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <span className="ml-3 text-slate-400">Loading configuration...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Validation Errors */}
            {validationError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">
                  <strong>Syntax Error:</strong> {validationError}
                </AlertDescription>
              </Alert>
            )}

            {validationErrors.length > 0 && (
              <Alert className="border-orange-500/50 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-400">
                  <strong>Validation Issues:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Real-time Updates */}
            {realTimeUpdates.length > 0 && (
              <Alert className="border-blue-500/50 bg-blue-500/10">
                <Activity className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-400">
                  <strong>Real-time Updates:</strong>
                  <div className="mt-2 space-y-1">
                    {realTimeUpdates.slice(-3).map((update, index) => (
                      <div key={index} className="text-sm flex items-center space-x-2">
                        <Clock className="h-3 w-3" />
                        <span>{update.message}</span>
                        <span className="text-xs text-slate-500">
                          {new Date(update.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Enhanced Controls */}
            <div className="flex items-center justify-between bg-slate-800/30 rounded-lg p-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={dryRun}
                    onCheckedChange={setDryRun}
                  />
                  <span className="text-sm text-slate-300">Dry Run Mode</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={showAdvanced}
                    onCheckedChange={setShowAdvanced}
                  />
                  <span className="text-sm text-slate-300">Advanced Tools</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {dryRun && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handlePreview}
                    disabled={!!validationError || validationErrors.length > 0 || isSaving}
                  >
                    <PlayCircle className="h-3 w-3 mr-1" />
                    Preview Changes
                  </Button>
                )}
                
                {showAdvanced && rollbackHistory.length > 0 && (
                  <Button variant="outline" size="sm">
                    <History className="h-3 w-3 mr-1" />
                    History ({rollbackHistory.length})
                  </Button>
                )}
              </div>
            </div>

            {/* Preview Results */}
            {showPreview && previewResult && (
              <Card className="border-cyan-500/50 bg-cyan-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-cyan-400 flex items-center space-x-2">
                    <Eye className="h-4 w-4" />
                    <span>Preview Results</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">
                      <strong>Changes:</strong> {previewResult.applied_changes?.length || 0} modifications detected
                    </p>
                    {previewResult.applied_changes?.slice(0, 5).map((change, index) => (
                      <div key={index} className="text-xs bg-slate-800/50 rounded p-2">
                        <span className="text-cyan-400">{change.field_path}:</span> {change.change_type}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs for different views */}
            <Tabs value={viewMode} onValueChange={setViewMode}>
              <div className="flex items-center justify-between">
                <TabsList className="bg-slate-800/50 border border-slate-700">
                  <TabsTrigger 
                    value="yaml" 
                    className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    YAML
                  </TabsTrigger>
                  <TabsTrigger 
                    value="json"
                    className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    JSON
                  </TabsTrigger>
                  <TabsTrigger 
                    value="diff"
                    className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
                    disabled={!hasChanges}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Diff
                  </TabsTrigger>
                </TabsList>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  {viewMode === 'yaml' && (
                    <Button variant="outline" size="sm" onClick={convertToJson} disabled={!!validationError}>
                      Convert to JSON
                    </Button>
                  )}
                  {viewMode === 'json' && (
                    <Button variant="outline" size="sm" onClick={convertToYaml} disabled={!!validationError}>
                      Convert to YAML
                    </Button>
                  )}
                  {hasChanges && (
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              <TabsContent value="yaml" className="mt-4">
                <Card className="terminal-bg border-slate-700">
                  <CardContent className="p-0">
                    <Editor
                      height="600px"
                      language="yaml"
                      theme="vs-dark"
                      value={currentConfig}
                      onChange={handleConfigChange}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        folding: true,
                        formatOnType: true,
                        formatOnPaste: true,
                        quickSuggestions: true,
                        suggestOnTriggerCharacters: true
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="json" className="mt-4">
                <Card className="terminal-bg border-slate-700">
                  <CardContent className="p-0">
                    <Editor
                      height="600px"
                      language="json"
                      theme="vs-dark"
                      value={currentConfig}
                      onChange={handleConfigChange}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        folding: true,
                        formatOnType: true,
                        formatOnPaste: true,
                        quickSuggestions: true,
                        suggestOnTriggerCharacters: true
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diff" className="mt-4">
                <Card className="terminal-bg border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">Configuration Changes</CardTitle>
                    <CardDescription>Review changes before applying</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ReactDiffViewer
                      oldValue={originalConfig}
                      newValue={currentConfig}
                      splitView={true}
                      leftTitle="Original Configuration"
                      rightTitle="Modified Configuration"
                      hideLineNumbers={false}
                      showDiffOnly={false}
                      styles={{
                        variables: {
                          dark: {
                            diffViewerBackground: '#0f172a',
                            diffViewerColor: '#e2e8f0',
                            addedBackground: '#065f46',
                            addedColor: '#6ee7b7',
                            removedBackground: '#7f1d1d',
                            removedColor: '#fca5a5',
                            wordAddedBackground: '#059669',
                            wordRemovedBackground: '#dc2626',
                            addedGutterBackground: '#065f46',
                            removedGutterBackground: '#7f1d1d',
                            gutterBackground: '#1e293b',
                            gutterBackgroundDark: '#0f172a',
                            highlightBackground: '#374151',
                            highlightGutterBackground: '#374151'
                          }
                        }
                      }}
                      useDarkTheme={true}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400 flex items-center space-x-4">
                {hasChanges ? (
                  <span className="text-yellow-400 flex items-center space-x-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Unsaved changes</span>
                  </span>
                ) : currentConfig ? (
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3" />
                    <span>Configuration up to date</span>
                  </span>
                ) : null}
                
                {dryRun && (
                  <span className="text-blue-400 flex items-center space-x-1">
                    <Shield className="h-3 w-3" />
                    <span>Safe mode enabled</span>
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={dryRun ? handlePreview : handleSave}
                  disabled={!hasChanges || !!validationError || validationErrors.length > 0 || isSaving}
                  className="btn-primary"
                >
                  {isSaving ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      <span>{dryRun ? 'Previewing...' : 'Applying...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      {dryRun ? <Eye className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                      <span>{dryRun ? 'Preview Changes' : 'Apply Changes'}</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedConfigurationEditor;