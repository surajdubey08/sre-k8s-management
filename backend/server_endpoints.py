"""
Enhanced API endpoints for Kubernetes resource management
"""

from fastapi import HTTPException, Depends, BackgroundTasks
from typing import List, Optional
import re
import logging
from datetime import datetime, timezone

from server_enhanced import (
    app, get_enhanced_k8s_service, get_current_user, create_audit_log,
    User, ResourceInfo, EnhancedResourceConfiguration, EnhancedConfigurationResult,
    DeploymentScale, BatchOperationRequest, BatchOperationResult, AuditLog,
    k8s_cache, cache_manager, websocket_manager, db, require_admin
)
from services.database_optimizer import DatabaseOptimizer

# Enhanced Kubernetes Management Endpoints

@app.get("/api/deployments", response_model=List[ResourceInfo])
async def list_deployments(
    namespace: Optional[str] = None,
    label_selector: Optional[str] = None,
    use_cache: bool = False,  # DISABLED CACHE for fresh deployment data
    current_user: User = Depends(get_current_user)
):
    try:
        service = get_enhanced_k8s_service()
        deployments = await service.list_deployments(namespace, label_selector, use_cache)
        
        await create_audit_log(
            "list_deployments",
            f"deployments/{namespace or 'all'}",
            current_user.username,
            True,
            {"count": len(deployments), "use_cache": use_cache}
        )
        
        return deployments
    except Exception as e:
        await create_audit_log(
            "list_deployments",
            f"deployments/{namespace or 'all'}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise

@app.get("/api/daemonsets", response_model=List[ResourceInfo])
async def list_daemonsets(
    namespace: Optional[str] = None,
    label_selector: Optional[str] = None,
    use_cache: bool = False,  # DISABLED CACHE for fresh daemonset data
    current_user: User = Depends(get_current_user)
):
    try:
        service = get_enhanced_k8s_service()
        daemonsets = await service.list_daemonsets(namespace, label_selector, use_cache)
        
        await create_audit_log(
            "list_daemonsets",
            f"daemonsets/{namespace or 'all'}",
            current_user.username,
            True,
            {"count": len(daemonsets), "use_cache": use_cache}
        )
        
        return daemonsets
    except Exception as e:
        await create_audit_log(
            "list_daemonsets",
            f"daemonsets/{namespace or 'all'}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise

@app.patch("/api/deployments/{namespace}/{name}/scale")
async def scale_deployment(
    namespace: str,
    name: str,
    scale_request: DeploymentScale,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    # Validate inputs
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', namespace):
        raise HTTPException(status_code=400, detail="Invalid namespace format")
    
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', name):
        raise HTTPException(status_code=400, detail="Invalid deployment name format")
    
    try:
        # Get current configuration
        service = get_enhanced_k8s_service()
        current_config = await service.get_resource_configuration("deployment", namespace, name)
        
        # Update replicas
        if 'spec' not in current_config:
            current_config['spec'] = {}
        current_config['spec']['replicas'] = scale_request.replicas
        
        # Apply the configuration
        result = await service.update_resource_configuration(
            "deployment", namespace, name, current_config, current_user.username
        )
        
        await create_audit_log(
            "scale_deployment",
            f"deployments/{namespace}/{name}",
            current_user.username,
            result.success,
            {"replicas": scale_request.replicas, "changes": len(result.applied_changes)}
        )
        
        # Invalidate related cache in background
        background_tasks.add_task(k8s_cache.invalidate_namespace, namespace)
        
        return {
            "success": result.success,
            "message": result.message,
            "replicas": scale_request.replicas,
            "applied_changes": len(result.applied_changes),
            "timestamp": result.timestamp,
            "user": result.user
        }
    except Exception as e:
        await create_audit_log(
            "scale_deployment",
            f"deployments/{namespace}/{name}",
            current_user.username,
            False,
            {"error": str(e), "replicas": scale_request.replicas}
        )
        raise

@app.get("/api/{resource_type}/{namespace}/{name}/config")
async def get_resource_config(
    resource_type: str,
    namespace: str,
    name: str,
    use_cache: bool = False,  # DISABLED CACHE for fresh config data
    current_user: User = Depends(get_current_user)
):
    """Get resource configuration for editing"""
    # Validate resource type
    valid_types = ["deployment", "daemonset", "statefulset", "service"]
    if resource_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Unsupported resource type. Valid types: {valid_types}")
    
    try:
        service = get_enhanced_k8s_service()
        config = await service.get_resource_configuration(resource_type, namespace, name, use_cache)
        
        await create_audit_log(
            f"get_{resource_type}_config",
            f"{resource_type}s/{namespace}/{name}",
            current_user.username,
            True,
            {"use_cache": use_cache}
        )
        
        return config
    except Exception as e:
        await create_audit_log(
            f"get_{resource_type}_config",
            f"{resource_type}s/{namespace}/{name}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise

@app.put("/api/{resource_type}/{namespace}/{name}/config", response_model=EnhancedConfigurationResult)
async def update_resource_config(
    resource_type: str,
    namespace: str,
    name: str,
    config_request: EnhancedResourceConfiguration,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Update resource configuration with enhanced validation and rollback support"""
    # Validate inputs
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', namespace):
        raise HTTPException(status_code=400, detail="Invalid namespace format")
    
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', name):
        raise HTTPException(status_code=400, detail="Invalid resource name format")
    
    valid_types = ["deployment", "daemonset", "statefulset", "service"]
    if resource_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Unsupported resource type. Valid types: {valid_types}")
    
    try:
        service = get_enhanced_k8s_service()
        result = await service.update_resource_configuration(
            resource_type, namespace, name, 
            config_request.configuration, 
            current_user.username, 
            config_request.dry_run
        )
        
        # Convert result to response model
        enhanced_result = EnhancedConfigurationResult(
            success=result.success,
            message=result.message,
            applied_changes=[{
                "field_path": change.field_path,
                "old_value": change.old_value,
                "new_value": change.new_value,
                "change_type": change.change_type
            } for change in result.applied_changes],
            rollback_key=f"{resource_type}:{namespace}:{name}:{result.timestamp}" if result.success else None,
            validation_errors=result.validation_errors,
            timestamp=result.timestamp,
            user=result.user,
            resource_version=result.resource_version,
            dry_run=config_request.dry_run
        )
        
        await create_audit_log(
            f"update_{resource_type}_config",
            f"{resource_type}s/{namespace}/{name}",
            current_user.username,
            result.success,
            {
                "changes_count": len(result.applied_changes),
                "dry_run": config_request.dry_run,
                "validation_errors": len(result.validation_errors)
            }
        )
        
        # Invalidate cache in background if not dry run
        if not config_request.dry_run and result.success:
            background_tasks.add_task(k8s_cache.invalidate_resource, resource_type, namespace, name)
        
        return enhanced_result
    except Exception as e:
        await create_audit_log(
            f"update_{resource_type}_config",
            f"{resource_type}s/{namespace}/{name}",
            current_user.username,
            False,
            {"error": str(e), "dry_run": config_request.dry_run}
        )
        raise

@app.post("/api/batch-operations", response_model=BatchOperationResult)
async def batch_operations(
    batch_request: BatchOperationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Execute batch operations on multiple resources"""
    try:
        service = get_enhanced_k8s_service()
        result = await service.batch_operation(batch_request, current_user.username)
        
        await create_audit_log(
            f"batch_{batch_request.operation}",
            f"batch/{len(batch_request.resources)}_resources",
            current_user.username,
            result.success,
            {
                "operation": batch_request.operation,
                "resource_count": len(batch_request.resources),
                "success_count": result.success_count,
                "failed_count": result.failed_count
            }
        )
        
        # Invalidate relevant caches in background
        background_tasks.add_task(cache_manager.invalidate_by_pattern, "*")
        
        return result
    except Exception as e:
        await create_audit_log(
            f"batch_{batch_request.operation}",
            f"batch/{len(batch_request.resources)}_resources",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise

@app.get("/api/audit-logs", response_model=List[AuditLog])
async def get_audit_logs(
    limit: int = 100,
    operation: Optional[str] = None,
    user: Optional[str] = None,
    resource: Optional[str] = None,
    success: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    # Only admins can view all audit logs, users can only see their own
    query = {}
    if current_user.role != "admin":
        query["user"] = current_user.username
    
    if operation:
        query["operation"] = {"$regex": operation, "$options": "i"}
    if user and current_user.role == "admin":
        query["user"] = {"$regex": user, "$options": "i"}
    if resource:
        query["resource"] = {"$regex": resource, "$options": "i"}
    if success is not None:
        query["success"] = success
    
    audit_logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    return [AuditLog(**log) for log in audit_logs]

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    try:
        service = get_enhanced_k8s_service()
        deployments = await service.list_deployments(use_cache=True)
        daemonsets = await service.list_daemonsets(use_cache=True)
        
        # Calculate stats
        deployment_stats = {
            "total": len(deployments),
            "healthy": sum(1 for d in deployments if d.status.get("ready_replicas", 0) == d.status.get("replicas", 1)),
            "unhealthy": sum(1 for d in deployments if d.status.get("ready_replicas", 0) != d.status.get("replicas", 1))
        }
        
        daemonset_stats = {
            "total": len(daemonsets),
            "healthy": sum(1 for d in daemonsets if d.status.get("number_ready", 0) == d.status.get("desired_number_scheduled", 1)),
            "unhealthy": sum(1 for d in daemonsets if d.status.get("number_ready", 0) != d.status.get("desired_number_scheduled", 1))
        }
        
        # Recent audit logs count
        recent_logs = await db.audit_logs.count_documents({
            "timestamp": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)}
        })
        
        return {
            "deployments": deployment_stats,
            "daemonsets": daemonset_stats,
            "recent_operations": recent_logs,
            "cluster_status": "connected" if service.available else "mock_mode",
            "cache_stats": cache_manager.get_stats(),
            "websocket_connections": len(websocket_manager.active_connections)
        }
    except Exception as e:
        # Log error for debugging
        print(f"Failed to get dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve dashboard statistics")

# Cache Management Endpoints (Admin only)
@app.get("/api/admin/cache/stats")
async def get_cache_stats(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return cache_manager.get_cache_info()

@app.post("/api/admin/cache/clear")
async def clear_cache(
    pattern: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        if pattern:
            cleared_count = await cache_manager.invalidate_by_pattern(pattern)
            message = f"Cleared {cleared_count} cache entries matching pattern '{pattern}'"
        else:
            cleared_count = await cache_manager.clear_all()
            message = f"Cleared all {cleared_count} cache entries"
        
        await create_audit_log(
            "cache_clear",
            f"cache/{pattern or 'all'}",
            current_user.username,
            True,
            {"cleared_count": cleared_count, "pattern": pattern}
        )
        
        return {"success": True, "message": message, "cleared_count": cleared_count}
    except Exception as e:
        await create_audit_log(
            "cache_clear",
            f"cache/{pattern or 'all'}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@app.post("/api/admin/cache/refresh")
async def refresh_cache(
    background_tasks: BackgroundTasks,
    resource_type: Optional[str] = None,
    namespace: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Refresh cache by fetching fresh data"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        service = get_enhanced_k8s_service()
        
        # Refresh specific resource type or all
        if resource_type == "deployments":
            await service.list_deployments(namespace=namespace, use_cache=False)
        elif resource_type == "daemonsets":
            await service.list_daemonsets(namespace=namespace, use_cache=False)
        else:
            # Refresh all resource types
            background_tasks.add_task(service.list_deployments, namespace, None, False)
            background_tasks.add_task(service.list_daemonsets, namespace, None, False)
        
        await create_audit_log(
            "cache_refresh",
            f"cache/{resource_type or 'all'}/{namespace or 'all'}",
            current_user.username,
            True,
            {"resource_type": resource_type, "namespace": namespace}
        )
        
        return {"success": True, "message": "Cache refresh initiated"}
    except Exception as e:
        await create_audit_log(
            "cache_refresh",
            f"cache/{resource_type or 'all'}/{namespace or 'all'}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to refresh cache: {str(e)}")

# Configuration validation endpoint
@app.post("/api/validate-config")
async def validate_configuration(
    resource_type: str,
    config: dict,
    current_user: User = Depends(get_current_user)
):
    """Validate resource configuration without applying"""
    try:
        service = get_enhanced_k8s_service()
        if not service.config_manager:
            raise HTTPException(status_code=503, detail="Configuration manager not available")
        
        from services.kubernetes_service_enhanced import ResourceType
        resource_enum = ResourceType(resource_type.lower())
        
        validation_errors = await service.config_manager.validate_configuration(resource_enum, config)
        
        return {
            "valid": len(validation_errors) == 0,
            "validation_errors": validation_errors,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unsupported resource type: {resource_type}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")

# Configuration diff endpoint
@app.post("/api/config-diff")
async def get_configuration_diff(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Get detailed configuration diff"""
    try:
        service = get_enhanced_k8s_service()
        if not service.config_manager:
            raise HTTPException(status_code=503, detail="Configuration manager not available")
        
        # Extract configurations from request
        original_config = request.get("original_config")
        updated_config = request.get("updated_config")
        
        if not original_config or not updated_config:
            raise HTTPException(status_code=400, detail="Both original_config and updated_config are required")
        
        diff = service.config_manager.get_configuration_diff(original_config, updated_config)
        
        return {
            "diff": diff,
            "has_changes": bool(diff),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diff calculation error: {str(e)}")

# Database Optimization Endpoints (Admin only)
db_optimizer = DatabaseOptimizer(db)

@app.get("/api/admin/database/stats")
async def get_database_stats(current_user: User = Depends(require_admin)):
    """Get comprehensive database statistics"""
    try:
        stats = await db_optimizer.get_database_stats()
        
        await create_audit_log(
            "database_stats",
            "database/stats",
            current_user.username,
            True
        )
        
        return stats
    except Exception as e:
        await create_audit_log(
            "database_stats",
            "database/stats", 
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to get database stats: {str(e)}")

@app.get("/api/admin/database/analyze/{collection_name}")
async def analyze_collection_performance(
    collection_name: str,
    current_user: User = Depends(require_admin)
):
    """Analyze performance for a specific collection"""
    try:
        analysis = await db_optimizer.analyze_collection_performance(collection_name)
        
        await create_audit_log(
            "analyze_collection",
            f"database/analyze/{collection_name}",
            current_user.username,
            True,
            {"collection": collection_name}
        )
        
        return analysis
    except Exception as e:
        await create_audit_log(
            "analyze_collection",
            f"database/analyze/{collection_name}",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to analyze collection: {str(e)}")

@app.post("/api/admin/database/optimize")
async def optimize_database(current_user: User = Depends(require_admin)):
    """Perform comprehensive database optimization"""
    try:
        results = await db_optimizer.optimize_queries()
        
        await create_audit_log(
            "database_optimize",
            "database/optimize",
            current_user.username,
            True,
            {"optimized_collections": list(results.keys())}
        )
        
        return {
            "success": True,
            "message": "Database optimization completed",
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        await create_audit_log(
            "database_optimize", 
            "database/optimize",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to optimize database: {str(e)}")

@app.post("/api/admin/database/cleanup")
async def cleanup_old_data(
    days_to_keep: int = 30,
    current_user: User = Depends(require_admin)
):
    """Clean up old data and optimize storage"""
    try:
        results = await db_optimizer.cleanup_old_data(days_to_keep)
        
        await create_audit_log(
            "database_cleanup",
            "database/cleanup", 
            current_user.username,
            True,
            {"days_to_keep": days_to_keep, "results": results}
        )
        
        return {
            "success": True,
            "message": f"Database cleanup completed - kept last {days_to_keep} days",
            "results": results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        await create_audit_log(
            "database_cleanup",
            "database/cleanup",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to cleanup database: {str(e)}")

@app.post("/api/admin/database/profiling")
async def toggle_database_profiling(
    enable: bool = True,
    level: int = 1,
    slow_ms: int = 100,
    current_user: User = Depends(require_admin)
):
    """Enable or disable database profiling for performance monitoring"""
    try:
        if enable:
            success = await db_optimizer.enable_profiling(level, slow_ms)
            action = "enable"
            message = f"Database profiling enabled at level {level} for queries slower than {slow_ms}ms"
        else:
            success = await db_optimizer.disable_profiling()
            action = "disable"
            message = "Database profiling disabled"
        
        await create_audit_log(
            f"database_profiling_{action}",
            "database/profiling",
            current_user.username,
            success,
            {"enable": enable, "level": level, "slow_ms": slow_ms}
        )
        
        if success:
            return {
                "success": True,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to {action} database profiling")
            
    except Exception as e:
        await create_audit_log(
            f"database_profiling_{action}",
            "database/profiling",
            current_user.username,
            False,
            {"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Failed to toggle profiling: {str(e)}")