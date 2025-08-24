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
import { toast } from 'sonner';
import { 
  Settings, Save, Eye, Code, FileText, AlertTriangle, 
  CheckCircle, X, RotateCcw, Zap 
} from 'lucide-react';
import axios from 'axios';

const ConfigurationEditor = ({ 
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
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const fetchConfiguration = async () => {
    setIsLoading(true);
    setValidationError('');
    
    try {
      const endpoint = resourceType === 'deployment' 
        ? `/deployments/${resource.namespace}/${resource.name}/config`
        : `/daemonsets/${resource.namespace}/${resource.name}/config`;
      
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

  const handleConfigChange = (value) => {
    setCurrentConfig(value || '');
    setHasChanges(value !== originalConfig);
    setValidationError('');
    
    // Validate YAML syntax
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

      const endpoint = resourceType === 'deployment' 
        ? `/deployments/${resource.namespace}/${resource.name}/config`
        : `/daemonsets/${resource.namespace}/${resource.name}/config`;
      
      const response = await axios.put(endpoint, {
        configuration: configData
      });

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
      setShowPreview(false);
    }
  };

  const getEditorLanguage = () => {
    return viewMode === 'yaml' ? 'yaml' : 'json';
  };

  const getEditorTheme = () => {
    return 'vs-dark';
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="btn-secondary">
          <Settings className="h-3 w-3 mr-1" />
          Edit Config
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col glass-effect border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl text-white flex items-center space-x-2">
                <Code className="h-5 w-5 text-cyan-400" />
                <span>Configure {resourceType}</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 mt-1">
                Edit configuration for {resource.name} in {resource.namespace} namespace
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
                  Invalid
                </Badge>
              )}
              {!validationError && !hasChanges && currentConfig && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Valid
                </Badge>
              )}
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
                        formatOnPaste: true
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
                        formatOnPaste: true
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
              <div className="text-sm text-slate-400">
                {hasChanges ? (
                  <span className="text-yellow-400">You have unsaved changes</span>
                ) : currentConfig ? (
                  <span className="text-emerald-400">Configuration is up to date</span>
                ) : null}
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
                      <span>Applying...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Save className="h-3 w-3" />
                      <span>Apply Changes</span>
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

export default ConfigurationEditor;