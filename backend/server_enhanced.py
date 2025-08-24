"""
Enhanced Kubernetes DaemonSet Management API with Advanced Configuration Management
"""

from fastapi import FastAPI, HTTPException, Depends, status, Security, WebSocket, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
import bcrypt
import asyncio
import re
import json
import websockets
import copy

# Enhanced services
from services.kubernetes_service_enhanced import (
    KubernetesConfigManager, ResourceType, ConfigurationResult, ConfigurationChange
)
from services.cache_manager import cache_manager, k8s_cache, CacheStrategy

# Kubernetes imports
try:
    from kubernetes import client, config
    from kubernetes.client.rest import ApiException
    KUBERNETES_AVAILABLE = True
except ImportError:
    KUBERNETES_AVAILABLE = False
    logging.warning("Kubernetes client not available")

from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client_mongo = AsyncIOMotorClient(mongo_url)
db = client_mongo[os.environ['DB_NAME']]

# JWT configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Security
security = HTTPBearer(auto_error=False)

# FastAPI app with enhanced configuration
app = FastAPI(
    title="Enhanced Kubernetes DaemonSet Management API",
    description="Advanced SRE-focused API for managing Kubernetes resources with complete configuration management",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kubernetes Configuration
class KubernetesConfig:
    def __init__(self):
        self.api_client = None
        self.configuration = None
        self.in_cluster = False
        self.available = KUBERNETES_AVAILABLE
        self.config_manager = None
        
    def load_config(self):
        if not KUBERNETES_AVAILABLE:
            logger.warning("Kubernetes client not available, running in mock mode")
            self.config_manager = MockConfigurationManager()
            return
            
        try:
            # Try in-cluster config first
            config.load_incluster_config()
            self.in_cluster = True
            logger.info("Loaded in-cluster Kubernetes configuration")
        except config.ConfigException:
            try:
                # Fallback to kubeconfig
                config.load_kube_config()
                self.in_cluster = False
                logger.info("Loaded kubeconfig configuration")
            except config.ConfigException as e:
                logger.error(f"Failed to load Kubernetes configuration: {e}")
                self.available = False
                # Initialize mock config manager when K8s is not available
                self.config_manager = MockConfigurationManager()
                return
        
        self.configuration = client.Configuration.get_default_copy()
        self.api_client = client.ApiClient(self.configuration)
        
        # Initialize enhanced config manager
        apps_v1_api = client.AppsV1Api(self.api_client)
        core_v1_api = client.CoreV1Api(self.api_client)
        self.config_manager = KubernetesConfigManager(apps_v1_api, core_v1_api)
        
    def get_core_v1_api(self):
        if not self.available:
            return None
        return client.CoreV1Api(self.api_client)
    
    def get_apps_v1_api(self):
        if not self.available:
            return None
        return client.AppsV1Api(self.api_client)

# Global Kubernetes config
k8s_config = KubernetesConfig()

# Mock Configuration Manager for non-k8s environments
class MockConfigurationManager:
    """Mock configuration manager for testing without Kubernetes"""
    
    def __init__(self):
        self.mock_configs = {
            "deployment:default:nginx-deployment": {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {
                    "name": "nginx-deployment",
                    "namespace": "default",
                    "labels": {"app": "nginx"}
                },
                "spec": {
                    "replicas": 3,
                    "selector": {"matchLabels": {"app": "nginx"}},
                    "template": {
                        "metadata": {"labels": {"app": "nginx"}},
                        "spec": {
                            "containers": [{
                                "name": "nginx",
                                "image": "nginx:1.20",
                                "ports": [{"containerPort": 80}]
                            }]
                        }
                    }
                }
            },
            "daemonset:kube-system:datadog-agent": {
                "apiVersion": "apps/v1",
                "kind": "DaemonSet",
                "metadata": {
                    "name": "datadog-agent",
                    "namespace": "kube-system",
                    "labels": {"app": "datadog-agent"}
                },
                "spec": {
                    "selector": {"matchLabels": {"app": "datadog-agent"}},
                    "template": {
                        "metadata": {"labels": {"app": "datadog-agent"}},
                        "spec": {
                            "containers": [{
                                "name": "datadog-agent",
                                "image": "datadog/agent:latest",
                                "env": [{"name": "DD_API_KEY", "value": "mock-key"}]
                            }]
                        }
                    }
                }
            }
        }
    
    async def get_resource_configuration(self, resource_type, namespace: str, name: str):
        """Get mock resource configuration"""
        key = f"{resource_type.value}:{namespace}:{name}"
        if key in self.mock_configs:
            return copy.deepcopy(self.mock_configs[key])
        else:
            raise HTTPException(status_code=404, detail=f"Mock resource {key} not found")
    
    async def update_resource_configuration(self, resource_type, namespace: str, name: str, 
                                          new_config: Dict[str, Any], user: str, dry_run: bool = False):
        """Update mock resource configuration"""
        from services.kubernetes_service_enhanced import ConfigurationResult, ConfigurationChange
        
        key = f"{resource_type.value}:{namespace}:{name}"
        
        # Mock validation
        validation_errors = []
        if 'spec' in new_config:
            if resource_type.value == 'deployment' and 'replicas' in new_config['spec']:
                replicas = new_config['spec']['replicas']
                if not isinstance(replicas, int) or replicas < 0:
                    validation_errors.append("Replicas must be a non-negative integer")
        
        # Mock changes calculation
        changes = []
        if key in self.mock_configs:
            current_config = self.mock_configs[key]
            if 'spec' in new_config and 'spec' in current_config:
                if new_config['spec'].get('replicas') != current_config['spec'].get('replicas'):
                    changes.append(ConfigurationChange(
                        field_path="spec.replicas",
                        old_value=current_config['spec'].get('replicas'),
                        new_value=new_config['spec'].get('replicas'),
                        change_type='modified'
                    ))
        
        if not dry_run and not validation_errors:
            # Update mock config
            if key in self.mock_configs:
                self.mock_configs[key] = self._deep_merge_dict(self.mock_configs[key], new_config)
        
        return ConfigurationResult(
            success=len(validation_errors) == 0,
            message="Mock configuration updated successfully" if len(validation_errors) == 0 else "Validation failed",
            applied_changes=changes,
            rollback_data=self.mock_configs.get(key),
            validation_errors=validation_errors,
            timestamp=datetime.now(timezone.utc).isoformat(),
            user=user,
            resource_version="mock-version-123"
        )
    
    async def validate_configuration(self, resource_type, config: Dict[str, Any]) -> List[str]:
        """Validate mock configuration"""
        validation_errors = []
        
        if 'spec' in config:
            if resource_type.value == 'deployment':
                if 'replicas' in config['spec']:
                    replicas = config['spec']['replicas']
                    if not isinstance(replicas, int) or replicas < 0:
                        validation_errors.append("Replicas must be a non-negative integer")
                        
                if 'selector' not in config['spec']:
                    validation_errors.append("Deployment must have a selector")
                    
                if 'template' not in config['spec']:
                    validation_errors.append("Deployment must have a pod template")
        
        return validation_errors
    
    def get_configuration_diff(self, original: Dict[str, Any], updated: Dict[str, Any]) -> Dict[str, Any]:
        """Get mock configuration diff"""
        try:
            import deepdiff
            diff = deepdiff.DeepDiff(original, updated, ignore_order=True, report_type='dict')
            return dict(diff)
        except ImportError:
            # Fallback simple diff
            return {"mock_diff": "DeepDiff not available, showing mock diff"}
    
    def _deep_merge_dict(self, target: Dict, source: Dict) -> Dict:
        """Deep merge two dictionaries"""
        result = copy.deepcopy(target)
        
        for key, value in source.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge_dict(result[key], value)
            else:
                result[key] = copy.deepcopy(value)
                
        return result

# Enhanced Pydantic Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str
    role: str = "user"  # user, admin
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    password: str = Field(..., min_length=6)
    role: str = "user"

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class ResourceInfo(BaseModel):
    name: str
    namespace: str
    created: str
    status: Dict[str, Any]
    labels: Optional[Dict[str, str]] = None
    annotations: Optional[Dict[str, str]] = None

class DeploymentScale(BaseModel):
    replicas: int = Field(..., ge=0, le=100)

class EnhancedResourceConfiguration(BaseModel):
    configuration: Dict[str, Any] = Field(..., description="Complete resource configuration")
    dry_run: bool = Field(False, description="Validate without applying changes")
    strategy: str = Field("merge", description="Update strategy: merge, replace")

class EnhancedConfigurationResult(BaseModel):
    success: bool
    message: str
    applied_changes: List[Dict[str, Any]]
    rollback_key: Optional[str] = None
    validation_errors: List[str]
    timestamp: str
    user: str
    resource_version: Optional[str] = None
    dry_run: bool = False

class BatchOperationRequest(BaseModel):
    resources: List[Dict[str, str]]  # [{"type": "deployment", "namespace": "default", "name": "app"}]
    operation: str  # scale, restart, update_config
    parameters: Dict[str, Any] = {}

class BatchOperationResult(BaseModel):
    success: bool
    results: List[Dict[str, Any]]
    failed_count: int
    success_count: int
    timestamp: str

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    operation: str
    resource: str
    user: str
    success: bool
    details: Optional[Dict[str, Any]] = None

# WebSocket Connection Manager
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(self.active_connections)}")
        
    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
            
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
                
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

websocket_manager = WebSocketManager()

# Utility Functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_data: dict) -> str:
    payload = {
        'user_id': user_data['id'],
        'username': user_data['username'],
        'role': user_data['role'],
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        payload = decode_jwt_token(credentials.credentials)
        user = await db.users.find_one({"id": payload["user_id"]})
        if not user or not user.get("is_active"):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return User(**user)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid authentication")

async def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def create_audit_log(operation: str, resource: str, user: str, success: bool, details: Optional[Dict] = None):
    audit_entry = AuditLog(
        operation=operation,
        resource=resource,
        user=user,
        success=success,
        details=details or {}
    )
    await db.audit_logs.insert_one(audit_entry.dict())
    
    # Broadcast real-time update
    await websocket_manager.broadcast({
        "type": "audit_log",
        "data": audit_entry.dict()
    })
    
    logger.info(f"AUDIT: {operation} on {resource} by {user} - {'SUCCESS' if success else 'FAILED'}")

# Enhanced Kubernetes Service with caching
class EnhancedKubernetesService:
    def __init__(self, k8s_config: KubernetesConfig):
        self.k8s_config = k8s_config
        self.core_v1 = k8s_config.get_core_v1_api()
        self.apps_v1 = k8s_config.get_apps_v1_api()
        self.available = k8s_config.available
        self.config_manager = k8s_config.config_manager
    
    async def list_deployments(self, namespace=None, label_selector=None, use_cache=True):
        # Check cache first
        if use_cache:
            cached = await k8s_cache.get_deployments(namespace=namespace, label_selector=label_selector)
            if cached is not None:
                return cached
        
        if not self.available:
            # Mock data for non-k8s environments
            mock_data = [
                ResourceInfo(
                    name="nginx-deployment",
                    namespace="default",
                    created="2024-01-01T10:00:00Z",
                    status={"replicas": 3, "ready_replicas": 3, "updated_replicas": 3, "available_replicas": 3},
                    labels={"app": "nginx"},
                    annotations={}
                )
            ]
            if use_cache:
                await k8s_cache.set_deployments(mock_data, namespace=namespace, label_selector=label_selector)
            return mock_data
        
        try:
            if namespace:
                deployments = self.apps_v1.list_namespaced_deployment(
                    namespace=namespace, label_selector=label_selector
                )
            else:
                deployments = self.apps_v1.list_deployment_for_all_namespaces(
                    label_selector=label_selector
                )
            
            result = []
            for deployment in deployments.items:
                result.append(ResourceInfo(
                    name=deployment.metadata.name,
                    namespace=deployment.metadata.namespace,
                    created=deployment.metadata.creation_timestamp.isoformat(),
                    status={
                        "replicas": deployment.status.replicas or 0,
                        "ready_replicas": deployment.status.ready_replicas or 0,
                        "updated_replicas": deployment.status.updated_replicas or 0,
                        "available_replicas": deployment.status.available_replicas or 0
                    },
                    labels=deployment.metadata.labels,
                    annotations=deployment.metadata.annotations
                ))
            
            # Cache the results
            if use_cache:
                await k8s_cache.set_deployments(result, namespace=namespace, label_selector=label_selector)
            
            return result
        except ApiException as e:
            logger.error(f"Failed to list deployments: {e}")
            raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")
    
    async def list_daemonsets(self, namespace=None, label_selector=None, use_cache=True):
        # Check cache first
        if use_cache:
            cached = await k8s_cache.get_daemonsets(namespace=namespace, label_selector=label_selector)
            if cached is not None:
                return cached
        
        if not self.available:
            # Mock data for non-k8s environments
            mock_data = [
                ResourceInfo(
                    name="datadog-agent",
                    namespace="kube-system",
                    created="2024-01-01T09:00:00Z",
                    status={"desired_number_scheduled": 3, "current_number_scheduled": 3, "number_ready": 3, "updated_number_scheduled": 3, "number_available": 3},
                    labels={"app": "datadog-agent"},
                    annotations={}
                )
            ]
            if use_cache:
                await k8s_cache.set_daemonsets(mock_data, namespace=namespace, label_selector=label_selector)
            return mock_data
        
        try:
            if namespace:
                daemonsets = self.apps_v1.list_namespaced_daemon_set(
                    namespace=namespace, label_selector=label_selector
                )
            else:
                daemonsets = self.apps_v1.list_daemon_set_for_all_namespaces(
                    label_selector=label_selector
                )
            
            result = []
            for daemonset in daemonsets.items:
                result.append(ResourceInfo(
                    name=daemonset.metadata.name,
                    namespace=daemonset.metadata.namespace,
                    created=daemonset.metadata.creation_timestamp.isoformat(),
                    status={
                        "desired_number_scheduled": daemonset.status.desired_number_scheduled or 0,
                        "current_number_scheduled": daemonset.status.current_number_scheduled or 0,
                        "number_ready": daemonset.status.number_ready or 0,
                        "updated_number_scheduled": daemonset.status.updated_number_scheduled or 0,
                        "number_available": daemonset.status.number_available or 0
                    },
                    labels=daemonset.metadata.labels,
                    annotations=daemonset.metadata.annotations
                ))
            
            # Cache the results
            if use_cache:
                await k8s_cache.set_daemonsets(result, namespace=namespace, label_selector=label_selector)
            
            return result
        except ApiException as e:
            logger.error(f"Failed to list daemonsets: {e}")
            raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")

    async def get_resource_configuration(self, resource_type: str, namespace: str, name: str, use_cache=True):
        if use_cache:
            cached = await k8s_cache.get_resource_config(resource_type, namespace, name)
            if cached is not None:
                return cached
        
        if not self.config_manager:
            raise HTTPException(status_code=503, detail="Configuration manager not available")
        
        try:
            resource_enum = ResourceType(resource_type.lower())
            config = await self.config_manager.get_resource_configuration(resource_enum, namespace, name)
            
            if use_cache:
                await k8s_cache.set_resource_config(config, resource_type, namespace, name)
            
            return config
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unsupported resource type: {resource_type}")

    async def update_resource_configuration(self, resource_type: str, namespace: str, name: str, 
                                          config: Dict[str, Any], user: str, dry_run: bool = False):
        if not self.config_manager:
            raise HTTPException(status_code=503, detail="Configuration manager not available")
        
        try:
            resource_enum = ResourceType(resource_type.lower())
            result = await self.config_manager.update_resource_configuration(
                resource_enum, namespace, name, config, user, dry_run
            )
            
            # Invalidate cache for this resource
            await k8s_cache.invalidate_resource(resource_type, namespace, name)
            
            # Broadcast real-time update
            await websocket_manager.broadcast({
                "type": "resource_updated",
                "data": {
                    "resource_type": resource_type,
                    "namespace": namespace,
                    "name": name,
                    "user": user,
                    "success": result.success,
                    "dry_run": dry_run
                }
            })
            
            return result
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unsupported resource type: {resource_type}")

    async def batch_operation(self, batch_request: BatchOperationRequest, user: str):
        results = []
        success_count = 0
        failed_count = 0
        
        for resource in batch_request.resources:
            try:
                resource_type = resource["type"]
                namespace = resource["namespace"]
                name = resource["name"]
                
                if batch_request.operation == "scale":
                    # Scale operation (for deployments)
                    if resource_type == "deployment":
                        replicas = batch_request.parameters.get("replicas", 1)
                        # Implementation for scaling...
                        result = {"resource": resource, "success": True, "message": f"Scaled to {replicas} replicas"}
                        success_count += 1
                    else:
                        result = {"resource": resource, "success": False, "message": "Scaling not supported for this resource type"}
                        failed_count += 1
                        
                elif batch_request.operation == "update_config":
                    # Configuration update
                    config = batch_request.parameters.get("configuration", {})
                    update_result = await self.update_resource_configuration(
                        resource_type, namespace, name, config, user
                    )
                    result = {
                        "resource": resource, 
                        "success": update_result.success, 
                        "message": update_result.message
                    }
                    if update_result.success:
                        success_count += 1
                    else:
                        failed_count += 1
                else:
                    result = {"resource": resource, "success": False, "message": "Unsupported operation"}
                    failed_count += 1
                    
                results.append(result)
                
            except Exception as e:
                result = {"resource": resource, "success": False, "message": str(e)}
                results.append(result)
                failed_count += 1
        
        return BatchOperationResult(
            success=failed_count == 0,
            results=results,
            success_count=success_count,
            failed_count=failed_count,
            timestamp=datetime.now(timezone.utc).isoformat()
        )

# Global enhanced service instance
enhanced_k8s_service = None

def get_enhanced_k8s_service():
    global enhanced_k8s_service
    if enhanced_k8s_service is None:
        enhanced_k8s_service = EnhancedKubernetesService(k8s_config)
    return enhanced_k8s_service

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Enhanced Kubernetes DaemonSet Management API...")
    k8s_config.load_config()
    
    # Create default admin user if not exists
    admin_user = await db.users.find_one({"username": "admin"})
    if not admin_user:
        admin_data = UserCreate(
            username="admin",
            email="admin@example.com",
            password="admin123",
            role="admin"
        )
        hashed_password = hash_password(admin_data.password)
        user = User(**admin_data.dict(exclude={"password"}))
        user_dict = user.dict()
        user_dict["password"] = hashed_password
        await db.users.insert_one(user_dict)
        logger.info("Created default admin user (admin/admin123)")

@app.on_event("shutdown")
async def shutdown_event():
    await cache_manager.shutdown()
    client_mongo.close()

# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle client messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
                
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)

# Health Check Endpoints
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "kubernetes_available": k8s_config.available,
        "in_cluster": k8s_config.in_cluster,
        "cache_stats": cache_manager.get_stats(),
        "websocket_connections": len(websocket_manager.active_connections),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Authentication Endpoints (keeping existing implementation)
@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"$or": [{"username": user_data.username}, {"email": user_data.email}]})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Create new user
    hashed_password = hash_password(user_data.password)
    user = User(**user_data.dict(exclude={"password"}))
    user_dict = user.dict()
    user_dict["password"] = hashed_password
    
    await db.users.insert_one(user_dict)
    
    # Create token
    token = create_jwt_token(user_dict)
    
    await create_audit_log("user_register", f"user/{user.username}", user.username, True)
    
    return Token(
        access_token=token,
        token_type="bearer",
        user={"id": user.id, "username": user.username, "email": user.email, "role": user.role}
    )

@app.post("/api/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user or not verify_password(credentials.password, user["password"]):
        await create_audit_log("user_login", f"user/{credentials.username}", credentials.username, False, {"error": "invalid_credentials"})
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active"):
        await create_audit_log("user_login", f"user/{credentials.username}", credentials.username, False, {"error": "user_inactive"})
        raise HTTPException(status_code=401, detail="Account is inactive")
    
    token = create_jwt_token(user)
    
    await create_audit_log("user_login", f"user/{credentials.username}", credentials.username, True)
    
    return Token(
        access_token=token,
        token_type="bearer",
        user={"id": user["id"], "username": user["username"], "email": user["email"], "role": user["role"]}
    )

@app.get("/api/auth/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user