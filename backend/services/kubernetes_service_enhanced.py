"""
Enhanced Kubernetes Service with Complete Configuration Management
"""

import asyncio
import logging
import json
import copy
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Union
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from fastapi import HTTPException
import yaml
import deepdiff
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ResourceType(Enum):
    DEPLOYMENT = "deployment"
    DAEMONSET = "daemonset"
    STATEFULSET = "statefulset"
    SERVICE = "service"
    CONFIGMAP = "configmap"
    SECRET = "secret"

@dataclass
class ConfigurationChange:
    field_path: str
    old_value: Any
    new_value: Any
    change_type: str  # added, removed, modified

@dataclass
class ConfigurationResult:
    success: bool
    message: str
    applied_changes: List[ConfigurationChange]
    rollback_data: Optional[Dict[str, Any]]
    validation_errors: List[str]
    timestamp: str
    user: str
    resource_version: Optional[str] = None

class KubernetesConfigManager:
    """Advanced Kubernetes Configuration Manager with complete spec handling"""
    
    def __init__(self, apps_v1_api, core_v1_api):
        self.apps_v1 = apps_v1_api
        self.core_v1 = core_v1_api
        self.config_cache = {}
        self.rollback_store = {}
        
    def _get_resource_client(self, resource_type: ResourceType):
        """Get the appropriate Kubernetes API client for resource type"""
        if resource_type in [ResourceType.DEPLOYMENT, ResourceType.DAEMONSET, ResourceType.STATEFULSET]:
            return self.apps_v1
        elif resource_type in [ResourceType.SERVICE, ResourceType.CONFIGMAP, ResourceType.SECRET]:
            return self.core_v1
        else:
            raise ValueError(f"Unsupported resource type: {resource_type}")

    def _sanitize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Remove read-only metadata fields"""
        sanitized = copy.deepcopy(metadata)
        
        # Remove read-only fields
        readonly_fields = [
            'uid', 'resourceVersion', 'generation', 'creationTimestamp',
            'deletionTimestamp', 'deletionGracePeriodSeconds', 'selfLink'
        ]
        
        for field in readonly_fields:
            sanitized.pop(field, None)
            
        # Handle managed fields
        if 'managedFields' in sanitized:
            del sanitized['managedFields']
            
        return sanitized

    def _validate_kubernetes_spec(self, resource_type: ResourceType, spec: Dict[str, Any]) -> List[str]:
        """Validate Kubernetes resource specification"""
        validation_errors = []
        
        try:
            if resource_type == ResourceType.DEPLOYMENT:
                self._validate_deployment_spec(spec, validation_errors)
            elif resource_type == ResourceType.DAEMONSET:
                self._validate_daemonset_spec(spec, validation_errors)
            elif resource_type == ResourceType.STATEFULSET:
                self._validate_statefulset_spec(spec, validation_errors)
            elif resource_type == ResourceType.SERVICE:
                self._validate_service_spec(spec, validation_errors)
                
        except Exception as e:
            validation_errors.append(f"Validation error: {str(e)}")
            
        return validation_errors

    def _validate_deployment_spec(self, spec: Dict[str, Any], errors: List[str]):
        """Validate deployment specification"""
        # Validate replicas
        if 'replicas' in spec:
            replicas = spec['replicas']
            if not isinstance(replicas, int) or replicas < 0:
                errors.append("Replicas must be a non-negative integer")
                
        # Validate selector
        if 'selector' not in spec:
            errors.append("Deployment must have a selector")
        elif 'matchLabels' not in spec['selector']:
            errors.append("Deployment selector must have matchLabels")
            
        # Validate template
        if 'template' not in spec:
            errors.append("Deployment must have a pod template")
        else:
            self._validate_pod_template(spec['template'], errors)

    def _validate_daemonset_spec(self, spec: Dict[str, Any], errors: List[str]):
        """Validate daemonset specification"""
        # Validate selector
        if 'selector' not in spec:
            errors.append("DaemonSet must have a selector")
        elif 'matchLabels' not in spec['selector']:
            errors.append("DaemonSet selector must have matchLabels")
            
        # Validate template
        if 'template' not in spec:
            errors.append("DaemonSet must have a pod template")
        else:
            self._validate_pod_template(spec['template'], errors)

    def _validate_statefulset_spec(self, spec: Dict[str, Any], errors: List[str]):
        """Validate statefulset specification"""
        # Validate replicas
        if 'replicas' in spec:
            replicas = spec['replicas']
            if not isinstance(replicas, int) or replicas < 0:
                errors.append("Replicas must be a non-negative integer")
                
        # Validate serviceName
        if 'serviceName' not in spec:
            errors.append("StatefulSet must have a serviceName")

    def _validate_service_spec(self, spec: Dict[str, Any], errors: List[str]):
        """Validate service specification"""
        # Validate ports
        if 'ports' in spec:
            for i, port in enumerate(spec['ports']):
                if 'port' not in port:
                    errors.append(f"Service port {i} must have a port number")

    def _validate_pod_template(self, template: Dict[str, Any], errors: List[str]):
        """Validate pod template specification"""
        if 'spec' not in template:
            errors.append("Pod template must have a spec")
            return
            
        pod_spec = template['spec']
        
        # Validate containers
        if 'containers' not in pod_spec:
            errors.append("Pod spec must have containers")
        else:
            for i, container in enumerate(pod_spec['containers']):
                if 'name' not in container:
                    errors.append(f"Container {i} must have a name")
                if 'image' not in container:
                    errors.append(f"Container {i} must have an image")

    def _deep_merge_dict(self, target: Dict, source: Dict) -> Dict:
        """Deep merge two dictionaries"""
        result = copy.deepcopy(target)
        
        for key, value in source.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge_dict(result[key], value)
            else:
                result[key] = copy.deepcopy(value)
                
        return result

    def _calculate_changes(self, original: Dict[str, Any], updated: Dict[str, Any]) -> List[ConfigurationChange]:
        """Calculate detailed changes between configurations"""
        changes = []
        
        try:
            diff = deepdiff.DeepDiff(original, updated, ignore_order=True, report_type='list')
            
            for change_type, change_list in diff.items():
                for change in change_list:
                    if change_type == 'values_changed':
                        changes.append(ConfigurationChange(
                            field_path=change['root'],
                            old_value=change['old_value'],
                            new_value=change['new_value'],
                            change_type='modified'
                        ))
                    elif change_type == 'dictionary_item_added':
                        changes.append(ConfigurationChange(
                            field_path=change['root'],
                            old_value=None,
                            new_value=change['new_value'],
                            change_type='added'
                        ))
                    elif change_type == 'dictionary_item_removed':
                        changes.append(ConfigurationChange(
                            field_path=change['root'],
                            old_value=change['old_value'],
                            new_value=None,
                            change_type='removed'
                        ))
                        
        except Exception as e:
            logger.error(f"Error calculating changes: {e}")
            
        return changes

    async def get_resource_configuration(self, 
                                       resource_type: ResourceType, 
                                       namespace: str, 
                                       name: str) -> Dict[str, Any]:
        """Get complete resource configuration"""
        try:
            api_client = self._get_resource_client(resource_type)
            
            if resource_type == ResourceType.DEPLOYMENT:
                resource = api_client.read_namespaced_deployment(name=name, namespace=namespace)
            elif resource_type == ResourceType.DAEMONSET:
                resource = api_client.read_namespaced_daemon_set(name=name, namespace=namespace)
            elif resource_type == ResourceType.STATEFULSET:
                resource = api_client.read_namespaced_stateful_set(name=name, namespace=namespace)
            elif resource_type == ResourceType.SERVICE:
                resource = api_client.read_namespaced_service(name=name, namespace=namespace)
            else:
                raise ValueError(f"Unsupported resource type: {resource_type}")
                
            # Convert to dict and sanitize
            config = resource.to_dict()
            
            # Remove status and sanitize metadata
            if 'status' in config:
                del config['status']
            if 'metadata' in config:
                config['metadata'] = self._sanitize_metadata(config['metadata'])
                
            # Cache the configuration
            cache_key = f"{resource_type.value}:{namespace}:{name}"
            self.config_cache[cache_key] = {
                'config': copy.deepcopy(config),
                'timestamp': datetime.now(timezone.utc),
                'resource_version': resource.metadata.resource_version
            }
            
            return config
            
        except ApiException as e:
            if e.status == 404:
                raise HTTPException(
                    status_code=404, 
                    detail=f"{resource_type.value.title()} '{name}' not found in namespace '{namespace}'"
                )
            raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")

    async def update_resource_configuration(self,
                                          resource_type: ResourceType,
                                          namespace: str,
                                          name: str,
                                          new_config: Dict[str, Any],
                                          user: str,
                                          dry_run: bool = False) -> ConfigurationResult:
        """Update resource configuration with complete validation and rollback support"""
        
        try:
            # Get current configuration
            current_config = await self.get_resource_configuration(resource_type, namespace, name)
            original_config = copy.deepcopy(current_config)
            
            # Validate the new configuration
            validation_errors = []
            if 'spec' in new_config:
                validation_errors = self._validate_kubernetes_spec(resource_type, new_config['spec'])
                
            if validation_errors and not dry_run:
                return ConfigurationResult(
                    success=False,
                    message="Configuration validation failed",
                    applied_changes=[],
                    rollback_data=None,
                    validation_errors=validation_errors,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    user=user
                )
            
            # Calculate changes
            changes = self._calculate_changes(current_config, new_config)
            
            if dry_run:
                return ConfigurationResult(
                    success=True,
                    message="Dry run completed successfully",
                    applied_changes=changes,
                    rollback_data=original_config,
                    validation_errors=validation_errors,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    user=user
                )
            
            # Store rollback data
            rollback_key = f"{resource_type.value}:{namespace}:{name}:{datetime.now().isoformat()}"
            self.rollback_store[rollback_key] = {
                'config': original_config,
                'user': user,
                'timestamp': datetime.now(timezone.utc)
            }
            
            # Apply the configuration
            api_client = self._get_resource_client(resource_type)
            
            # Merge configurations properly
            merged_config = self._deep_merge_dict(current_config, new_config)
            
            # Create the appropriate Kubernetes object
            if resource_type == ResourceType.DEPLOYMENT:
                k8s_object = client.V1Deployment(**merged_config)
                updated_resource = api_client.patch_namespaced_deployment(
                    name=name,
                    namespace=namespace,
                    body=k8s_object
                )
            elif resource_type == ResourceType.DAEMONSET:
                k8s_object = client.V1DaemonSet(**merged_config)
                updated_resource = api_client.patch_namespaced_daemon_set(
                    name=name,
                    namespace=namespace,
                    body=k8s_object
                )
            elif resource_type == ResourceType.STATEFULSET:
                k8s_object = client.V1StatefulSet(**merged_config)
                updated_resource = api_client.patch_namespaced_stateful_set(
                    name=name,
                    namespace=namespace,
                    body=k8s_object
                )
            elif resource_type == ResourceType.SERVICE:
                k8s_object = client.V1Service(**merged_config)
                updated_resource = api_client.patch_namespaced_service(
                    name=name,
                    namespace=namespace,
                    body=k8s_object
                )
            else:
                raise ValueError(f"Unsupported resource type: {resource_type}")
            
            # Invalidate cache
            cache_key = f"{resource_type.value}:{namespace}:{name}"
            if cache_key in self.config_cache:
                del self.config_cache[cache_key]
            
            return ConfigurationResult(
                success=True,
                message=f"Successfully updated {resource_type.value} '{name}'",
                applied_changes=changes,
                rollback_data=original_config,
                validation_errors=[],
                timestamp=datetime.now(timezone.utc).isoformat(),
                user=user,
                resource_version=updated_resource.metadata.resource_version
            )
            
        except ApiException as e:
            if e.status == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"{resource_type.value.title()} '{name}' not found in namespace '{namespace}'"
                )
            elif e.status == 409:
                raise HTTPException(
                    status_code=409,
                    detail=f"Configuration conflict. Resource was modified by another user. Please refresh and try again."
                )
            else:
                raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")
        
        except Exception as e:
            logger.error(f"Error updating {resource_type.value} configuration: {e}")
            return ConfigurationResult(
                success=False,
                message=f"Failed to update configuration: {str(e)}",
                applied_changes=[],
                rollback_data=None,
                validation_errors=[str(e)],
                timestamp=datetime.now(timezone.utc).isoformat(),
                user=user
            )

    async def rollback_configuration(self,
                                   resource_type: ResourceType,
                                   namespace: str,
                                   name: str,
                                   rollback_key: str,
                                   user: str) -> ConfigurationResult:
        """Rollback to a previous configuration"""
        
        if rollback_key not in self.rollback_store:
            raise HTTPException(status_code=404, detail="Rollback data not found")
            
        rollback_data = self.rollback_store[rollback_key]
        original_config = rollback_data['config']
        
        # Apply the rollback configuration
        return await self.update_resource_configuration(
            resource_type, namespace, name, original_config, user
        )

    async def validate_configuration(self,
                                   resource_type: ResourceType,
                                   config: Dict[str, Any]) -> List[str]:
        """Validate configuration without applying"""
        validation_errors = []
        
        if 'spec' in config:
            validation_errors = self._validate_kubernetes_spec(resource_type, config['spec'])
            
        return validation_errors

    def get_configuration_diff(self, 
                             original: Dict[str, Any], 
                             updated: Dict[str, Any]) -> Dict[str, Any]:
        """Get detailed configuration diff"""
        try:
            diff = deepdiff.DeepDiff(
                original, 
                updated, 
                ignore_order=True, 
                report_type='dict'
            )
            return dict(diff)
        except Exception as e:
            logger.error(f"Error calculating diff: {e}")
            return {}