import React, { useState, useEffect } from 'react';
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
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { 
  Settings, Save, Eye, Code, FileText, AlertTriangle, 
  CheckCircle, X, RotateCcw, Zap, Play, TestTube,
  Clock, User, GitBranch, History, Shield
} from 'lucide-react';
import axios from 'axios';

const EnhancedConfigurationEditor = ({ 
  resource, 
  resourceType, 
  onConfigurationUpdated 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [originalConfig, setOriginalConfig] = useState('');
  const [currentConfig, setCurrentConfig] = useState('');
  const [viewMode, setViewMode] = useState('yaml'); // yaml, json, diff
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [validationResults, setValidationResults] = useState(null);
  const [configDiff, setConfigDiff] = useState(null);
  const [lastUpdateResult, setLastUpdateResult] = useState(null);

  const fetchConfiguration = async () => {
    setIsLoading(true);
    setValidationError('');
    
    try {
      const response = await axios.get(`/${resourceType}/${resource.namespace}/${resource.name}/config`);
      const configYaml = yaml.dump(response.data, { 
        indent: 2, 
        lineWidth: 120,
        noRefs: true 
      });
      
      setOriginalConfig(configYaml);
      setCurrentConfig(configYaml);
      setHasChanges(false);
      setLastUpdateResult(null);
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
      toast.error(`Failed to load ${resourceType} configuration`);
      setValidationError(error.response?.data?.detail || 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = (value) => {
    setCurrentConfig(value || '');
    const changed = value !== originalConfig;
    setHasChanges(changed);
    setValidationError('');
    setValidationResults(null);
    setConfigDiff(null);
    
    // Validate syntax
    try {
      if (viewMode === 'yaml') {
        yaml.load(value || '');
      } else if (viewMode === 'json') {
        JSON.parse(value || '{}');
      }
    } catch (error) {
      setValidationError(`Invalid ${viewMode.toUpperCase()}: ${error.message}`);
    }
  };

  const validateConfiguration = async () => {
    if (validationError || !hasChanges) return;

    setIsValidating(true);
    try {
      let configData;
      if (viewMode === 'yaml') {
        configData = yaml.load(currentConfig);
      } else {
        configData = JSON.parse(currentConfig);
      }

      const [validationResponse, diffResponse] = await Promise.all([
        axios.post('/validate-config', {
          resource_type: resourceType,
          config: configData
        }),
        axios.post('/config-diff', {
          original_config: yaml.load(originalConfig),
          updated_config: configData
        })
      ]);

      setValidationResults(validationResponse.data);
      setConfigDiff(diffResponse.data);

      if (validationResponse.data.valid) {
        toast.success('Configuration validated successfully');
      } else {
        toast.warning('Configuration has validation warnings');
      }
    } catch (error) {
      toast.error('Failed to validate configuration');
      setValidationError(error.response?.data?.detail || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
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

  const handleSave = async () => {
    if (validationError) {
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

      const response = await axios.put(`/${resourceType}/${resource.namespace}/${resource.name}/config`, {
        configuration: configData,
        dry_run: dryRun,
        strategy: 'merge'
      });

      setLastUpdateResult(response.data);

      if (response.data.success) {
        if (dryRun) {
          toast.success('Dry run completed successfully - no changes applied');
        } else {
          toast.success('Configuration updated successfully');
          setOriginalConfig(currentConfig);
          setHasChanges(false);
        }
      } else {
        toast.error(response.data.message);
      }
      
      // If not dry run and successful, notify parent and close
      if (!dryRun && response.data.success) {
        setIsOpen(false);
        if (onConfigurationUpdated) {
          onConfigurationUpdated();
        }
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
    setValidationResults(null);
    setConfigDiff(null);
    setLastUpdateResult(null);
    toast.info('Configuration reset to original');
  };

  const handleOpen = (open) => {
    setIsOpen(open);
    if (open) {
      fetchConfiguration();
    } else {
      // Reset state when closing
      setOriginalConfig('');
      setCurrentConfig('');
      setHasChanges(false);
      setValidationError('');
      setValidationResults(null);
      setConfigDiff(null);
      setLastUpdateResult(null);
      setDryRun(true);
    }
  };

  const getEditorTheme = () => {
    return 'vs-dark';
  };

  const getValidationStatusBadge = () => {
    if (validationResults) {
      if (validationResults.valid) {
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Valid Configuration
          </Badge>
        );
      } else {
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Validation Issues
          </Badge>
        );
      }
    }
    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="btn-secondary">
          <Settings className="h-3 w-3 mr-1" />
          Enhanced Config
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-7xl max-h-[95vh] glass-effect border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl text-white flex items-center space-x-2">
                <Shield className="h-5 w-5 text-cyan-400" />
                <span>Enhanced Configuration Editor</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 mt-1">
                Advanced configuration management for {resource.name} in {resource.namespace} namespace
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              {hasChanges && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Unsaved Changes
                </Badge>
              )}
              {validationError && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  <X className="h-3 w-3 mr-1" />
                  Syntax Error
                </Badge>
              )}
              {getValidationStatusBadge()}
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
            {/* Validation Error Alert */}
            {validationError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">
                  {validationError}
                </AlertDescription>
              </Alert>
            )}

            {/* Validation Results */}
            {validationResults && !validationResults.valid && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-400">
                  <div className="space-y-1">
                    <p className="font-medium">Configuration Validation Issues:</p>
                    {validationResults.validation_errors.map((error, index) => (
                      <p key={index} className="text-sm">• {error}</p>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Last Update Result */}
            {lastUpdateResult && (
              <Alert className={`border-${lastUpdateResult.success ? 'emerald' : 'red'}-500/50 bg-${lastUpdateResult.success ? 'emerald' : 'red'}-500/10`}>
                <CheckCircle className={`h-4 w-4 text-${lastUpdateResult.success ? 'emerald' : 'red'}-400`} />
                <AlertDescription className={`text-${lastUpdateResult.success ? 'emerald' : 'red'}-400`}>
                  <div className="space-y-2">
                    <p className="font-medium">{lastUpdateResult.message}</p>
                    {lastUpdateResult.applied_changes.length > 0 && (
                      <div>
                        <p className="text-sm">Applied Changes:</p>
                        {lastUpdateResult.applied_changes.slice(0, 3).map((change, index) => (
                          <p key={index} className="text-xs font-mono">
                            {change.field_path}: {change.change_type}
                          </p>
                        ))}
                        {lastUpdateResult.applied_changes.length > 3 && (
                          <p className="text-xs">...and {lastUpdateResult.applied_changes.length - 3} more changes</p>
                        )}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Configuration Controls */}
            <Card className="bg-slate-800/30 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white">Configuration Options</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="dry-run"
                        checked={dryRun}
                        onCheckedChange={setDryRun}
                      />
                      <label htmlFor="dry-run" className="text-sm text-slate-300">
                        Dry Run Mode
                      </label>
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={validateConfiguration}
                      disabled={!hasChanges || validationError || isValidating}
                    >
                      {isValidating ? (
                        <div className="flex items-center space-x-1">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-cyan-400"></div>
                          <span>Validating...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <TestTube className="h-3 w-3" />
                          <span>Validate</span>
                        </div>
                      )}
                    </Button>
                  </div>
                  <div className="text-xs text-slate-500">
                    {dryRun ? 'Changes will be validated only' : 'Changes will be applied immediately'}
                  </div>
                </div>
              </CardContent>
            </Card>

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
                    Diff Preview
                  </TabsTrigger>
                  {configDiff && (
                    <TabsTrigger 
                      value="changes"
                      className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
                    >
                      <GitBranch className="h-4 w-4 mr-2" />
                      Changes
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  {viewMode === 'yaml' && (
                    <Button variant="outline" size="sm" onClick={convertToJson} disabled={validationError}>
                      Convert to JSON
                    </Button>
                  )}
                  {viewMode === 'json' && (
                    <Button variant="outline" size="sm" onClick={convertToYaml} disabled={validationError}>
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
                      height="500px"
                      language="yaml"
                      theme={getEditorTheme()}
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
                        automaticLayout: true
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="json" className="mt-4">
                <Card className="terminal-bg border-slate-700">
                  <CardContent className="p-0">
                    <Editor
                      height="500px"
                      language="json"
                      theme={getEditorTheme()}
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
                        automaticLayout: true
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="diff" className="mt-4">
                <Card className="terminal-bg border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-white flex items-center space-x-2">
                      <Eye className="h-4 w-4" />
                      <span>Configuration Changes Preview</span>
                    </CardTitle>
                    <CardDescription>Review changes before applying</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ReactDiffViewer
                      oldValue={originalConfig}
                      newValue={currentConfig}
                      splitView={true}
                      leftTitle="Current Configuration"
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

              {configDiff && (
                <TabsContent value="changes" className="mt-4">
                  <Card className="terminal-bg border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-sm text-white flex items-center space-x-2">
                        <GitBranch className="h-4 w-4" />
                        <span>Detailed Change Analysis</span>
                      </CardTitle>
                      <CardDescription>AI-powered change analysis and impact assessment</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                          <h4 className="text-sm font-medium text-white mb-2">Configuration Diff</h4>
                          <pre className="text-xs text-slate-400 overflow-auto max-h-64">
                            {JSON.stringify(configDiff.diff, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400 space-y-1">
                {hasChanges ? (
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    <span className="text-yellow-400">You have unsaved changes</span>
                  </div>
                ) : currentConfig ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Configuration is synchronized</span>
                  </div>
                ) : null}
                {dryRun && (
                  <div className="flex items-center space-x-2">
                    <TestTube className="h-3 w-3 text-cyan-400" />
                    <span className="text-cyan-400">Dry run mode enabled - changes will be validated only</span>
                  </div>
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
                  onClick={handleSave}
                  disabled={!hasChanges || !!validationError || isSaving}
                  className="btn-primary"
                >
                  {isSaving ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      <span>{dryRun ? 'Validating...' : 'Applying...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      {dryRun ? <TestTube className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                      <span>{dryRun ? 'Dry Run' : 'Apply Changes'}</span>
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