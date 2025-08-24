from fastapi import FastAPI, HTTPException, Depends, status, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
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

# FastAPI app
app = FastAPI(
    title="Kubernetes DaemonSet Management API",
    description="SRE-focused API for managing Kubernetes DaemonSets and Deployments",
    version="1.0.0"
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
        
    def load_config(self):
        if not KUBERNETES_AVAILABLE:
            logger.warning("Kubernetes client not available, running in mock mode")
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
                return
        
        self.configuration = client.Configuration.get_default_copy()
        self.api_client = client.ApiClient(self.configuration)
        
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

# Pydantic Models
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

class DeploymentUpdate(BaseModel):
    image: Optional[str] = None
    replicas: Optional[int] = Field(None, ge=0, le=100)
    environment_variables: Optional[Dict[str, str]] = None

class ResourceConfiguration(BaseModel):
    configuration: Dict[str, Any] = Field(..., description="Complete resource configuration")
    
class ConfigurationUpdate(BaseModel):
    success: bool
    message: str
    applied_changes: Optional[Dict[str, Any]] = None
    timestamp: str
    user: str

class OperationResult(BaseModel):
    success: bool
    message: str
    resource: Optional[Dict[str, Any]] = None
    timestamp: str
    user: str

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    operation: str
    resource: str
    user: str
    success: bool
    details: Optional[Dict[str, Any]] = None

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
    logger.info(f"AUDIT: {operation} on {resource} by {user} - {'SUCCESS' if success else 'FAILED'}")

# Kubernetes Service Mock for non-k8s environments
class KubernetesMockService:
    def __init__(self):
        self.mock_data = {
            "deployments": [
                {
                    "name": "nginx-deployment",
                    "namespace": "default",
                    "created": "2024-01-01T10:00:00Z",
                    "status": {"replicas": 3, "ready_replicas": 3, "updated_replicas": 3, "available_replicas": 3},
                    "labels": {"app": "nginx"},
                    "annotations": {}
                }
            ],
            "daemonsets": [
                {
                    "name": "datadog-agent",
                    "namespace": "kube-system",
                    "created": "2024-01-01T09:00:00Z",
                    "status": {"desired_number_scheduled": 3, "current_number_scheduled": 3, "number_ready": 3, "updated_number_scheduled": 3, "number_available": 3},
                    "labels": {"app": "datadog-agent"},
                    "annotations": {}
                }
            ]
        }
    
    async def list_deployments(self, namespace=None, label_selector=None):
        return [ResourceInfo(**dep) for dep in self.mock_data["deployments"]]
    
    async def list_daemonsets(self, namespace=None, label_selector=None):
        return [ResourceInfo(**ds) for ds in self.mock_data["daemonsets"]]
    
    async def get_deployment(self, namespace: str, name: str):
        for dep in self.mock_data["deployments"]:
            if dep["name"] == name and dep["namespace"] == namespace:
                return ResourceInfo(**dep)
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    async def get_deployment_config(self, namespace: str, name: str):
        """Get complete deployment configuration for editing"""
        for dep in self.mock_data["deployments"]:
            if dep["name"] == name and dep["namespace"] == namespace:
                # Return a mock configuration that looks like a real K8s deployment
                return {
                    "apiVersion": "apps/v1",
                    "kind": "Deployment",
                    "metadata": {
                        "name": name,
                        "namespace": namespace,
                        "labels": dep.get("labels", {}),
                        "annotations": dep.get("annotations", {})
                    },
                    "spec": {
                        "replicas": dep["status"]["replicas"],
                        "selector": {
                            "matchLabels": dep.get("labels", {})
                        },
                        "template": {
                            "metadata": {
                                "labels": dep.get("labels", {})
                            },
                            "spec": {
                                "containers": [
                                    {
                                        "name": "nginx",
                                        "image": "nginx:latest",
                                        "ports": [{"containerPort": 80}],
                                        "env": [
                                            {"name": "ENV", "value": "production"},
                                            {"name": "LOG_LEVEL", "value": "info"}
                                        ],
                                        "resources": {
                                            "requests": {"memory": "128Mi", "cpu": "100m"},
                                            "limits": {"memory": "256Mi", "cpu": "200m"}
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    async def update_deployment_config(self, namespace: str, name: str, config: Dict[str, Any], user: str):
        """Update deployment configuration"""
        for dep in self.mock_data["deployments"]:
            if dep["name"] == name and dep["namespace"] == namespace:
                # Update the mock data based on the new configuration
                if "spec" in config and "replicas" in config["spec"]:
                    dep["status"]["replicas"] = config["spec"]["replicas"]
                if "metadata" in config and "labels" in config["metadata"]:
                    dep["labels"] = config["metadata"]["labels"]
                if "metadata" in config and "annotations" in config["metadata"]:
                    dep["annotations"] = config["metadata"]["annotations"]
                
                return ConfigurationUpdate(
                    success=True,
                    message=f"Successfully updated configuration for deployment '{name}'",
                    applied_changes={
                        "replicas": config.get("spec", {}).get("replicas"),
                        "labels": config.get("metadata", {}).get("labels", {}),
                        "annotations": config.get("metadata", {}).get("annotations", {})
                    },
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    user=user
                )
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    async def get_daemonset_config(self, namespace: str, name: str):
        """Get complete daemonset configuration for editing"""
        for ds in self.mock_data["daemonsets"]:
            if ds["name"] == name and ds["namespace"] == namespace:
                # Return a mock configuration that looks like a real K8s daemonset
                return {
                    "apiVersion": "apps/v1",
                    "kind": "DaemonSet",
                    "metadata": {
                        "name": name,
                        "namespace": namespace,
                        "labels": ds.get("labels", {}),
                        "annotations": ds.get("annotations", {})
                    },
                    "spec": {
                        "selector": {
                            "matchLabels": ds.get("labels", {})
                        },
                        "template": {
                            "metadata": {
                                "labels": ds.get("labels", {})
                            },
                            "spec": {
                                "containers": [
                                    {
                                        "name": "datadog-agent",
                                        "image": "datadog/agent:latest",
                                        "ports": [{"containerPort": 8125}],
                                        "env": [
                                            {"name": "DD_API_KEY", "value": "your-api-key"},
                                            {"name": "DD_SITE", "value": "datadoghq.com"},
                                            {"name": "DD_LOGS_ENABLED", "value": "true"}
                                        ],
                                        "resources": {
                                            "requests": {"memory": "256Mi", "cpu": "200m"},
                                            "limits": {"memory": "512Mi", "cpu": "500m"}
                                        },
                                        "volumeMounts": [
                                            {"name": "dockersocket", "mountPath": "/var/run/docker.sock"},
                                            {"name": "procdir", "mountPath": "/host/proc", "readOnly": True}
                                        ]
                                    }
                                ],
                                "volumes": [
                                    {"name": "dockersocket", "hostPath": {"path": "/var/run/docker.sock"}},
                                    {"name": "procdir", "hostPath": {"path": "/proc"}}
                                ]
                            }
                        }
                    }
                }
        raise HTTPException(status_code=404, detail="DaemonSet not found")
    
    async def update_daemonset_config(self, namespace: str, name: str, config: Dict[str, Any], user: str):
        """Update daemonset configuration"""
        for ds in self.mock_data["daemonsets"]:
            if ds["name"] == name and ds["namespace"] == namespace:
                # Update the mock data based on the new configuration
                if "metadata" in config and "labels" in config["metadata"]:
                    ds["labels"] = config["metadata"]["labels"]
                if "metadata" in config and "annotations" in config["metadata"]:
                    ds["annotations"] = config["metadata"]["annotations"]
                
                return ConfigurationUpdate(
                    success=True,
                    message=f"Successfully updated configuration for daemonset '{name}'",
                    applied_changes={
                        "labels": config.get("metadata", {}).get("labels", {}),
                        "annotations": config.get("metadata", {}).get("annotations", {}),
                        "containers": len(config.get("spec", {}).get("template", {}).get("spec", {}).get("containers", []))
                    },
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    user=user
                )
        raise HTTPException(status_code=404, detail="DaemonSet not found")
    
    async def scale_deployment(self, namespace: str, name: str, replicas: int, user: str):
        for dep in self.mock_data["deployments"]:
            if dep["name"] == name and dep["namespace"] == namespace:
                dep["status"]["replicas"] = replicas
                return OperationResult(
                    success=True,
                    message=f"Successfully scaled deployment '{name}' to {replicas} replicas",
                    resource={"name": name, "namespace": namespace, "replicas": replicas},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    user=user
                )
        raise HTTPException(status_code=404, detail="Deployment not found")

# Kubernetes Service
class KubernetesService:
    def __init__(self, k8s_config: KubernetesConfig):
        self.k8s_config = k8s_config
        self.core_v1 = k8s_config.get_core_v1_api()
        self.apps_v1 = k8s_config.get_apps_v1_api()
        self.available = k8s_config.available
    
    async def list_deployments(self, namespace=None, label_selector=None):
        if not self.available:
            return []
        
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
            return result
        except ApiException as e:
            logger.error(f"Failed to list deployments: {e}")
            raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")
    
    async def list_daemonsets(self, namespace=None, label_selector=None):
        if not self.available:
            return []
        
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
            return result
        except ApiException as e:
            logger.error(f"Failed to list daemonsets: {e}")
            raise HTTPException(status_code=e.status, detail=f"Kubernetes API error: {e.reason}")

# Global service instance
k8s_service = None
mock_service = KubernetesMockService()

def get_k8s_service():
    global k8s_service
    if k8s_service is None and k8s_config.available:
        k8s_service = KubernetesService(k8s_config)
        return k8s_service
    elif not k8s_config.available:
        return mock_service
    return k8s_service

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Kubernetes DaemonSet Management API...")
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

# Health Check Endpoints
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "kubernetes_available": k8s_config.available,
        "in_cluster": k8s_config.in_cluster,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Authentication Endpoints
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

# Kubernetes Management Endpoints
@app.get("/api/deployments", response_model=List[ResourceInfo])
async def list_deployments(
    namespace: Optional[str] = None,
    label_selector: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    try:
        service = get_k8s_service()
        deployments = await service.list_deployments(namespace, label_selector)
        
        await create_audit_log(
            "list_deployments",
            f"deployments/{namespace or 'all'}",
            current_user.username,
            True,
            {"count": len(deployments)}
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
    current_user: User = Depends(get_current_user)
):
    try:
        service = get_k8s_service()
        daemonsets = await service.list_daemonsets(namespace, label_selector)
        
        await create_audit_log(
            "list_daemonsets",
            f"daemonsets/{namespace or 'all'}",
            current_user.username,
            True,
            {"count": len(daemonsets)}
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

@app.patch("/api/deployments/{namespace}/{name}/scale", response_model=OperationResult)
async def scale_deployment(
    namespace: str,
    name: str,
    scale_request: DeploymentScale,
    current_user: User = Depends(get_current_user)
):
    # Validate inputs
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', namespace):
        raise HTTPException(status_code=400, detail="Invalid namespace format")
    
    if not re.match(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?$', name):
        raise HTTPException(status_code=400, detail="Invalid deployment name format")
    
    try:
        service = get_k8s_service()
        result = await service.scale_deployment(namespace, name, scale_request.replicas, current_user.username)
        
        await create_audit_log(
            "scale_deployment",
            f"deployments/{namespace}/{name}",
            current_user.username,
            True,
            {"replicas": scale_request.replicas}
        )
        
        return result
    except Exception as e:
        await create_audit_log(
            "scale_deployment",
            f"deployments/{namespace}/{name}",
            current_user.username,
            False,
            {"error": str(e), "replicas": scale_request.replicas}
        )
        raise

@app.get("/api/audit-logs", response_model=List[AuditLog])
async def get_audit_logs(
    limit: int = 100,
    operation: Optional[str] = None,
    user: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Only admins can view all audit logs, users can only see their own
    query = {}
    if current_user.role != "admin":
        query["user"] = current_user.username
    
    if operation:
        query["operation"] = operation
    if user and current_user.role == "admin":
        query["user"] = user
    
    audit_logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    return [AuditLog(**log) for log in audit_logs]

# Dashboard Stats Endpoint
@app.get("/api/dashboard/stats")
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    try:
        service = get_k8s_service()
        deployments = await service.list_deployments()
        daemonsets = await service.list_daemonsets()
        
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
            "timestamp": {"$gte": datetime.now(timezone.utc) - timedelta(hours=24)}
        })
        
        return {
            "deployments": deployment_stats,
            "daemonsets": daemonset_stats,
            "recent_operations": recent_logs,
            "cluster_status": "connected" if k8s_config.available else "mock_mode"
        }
    except Exception as e:
        logger.error(f"Failed to get dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve dashboard statistics")

@app.on_event("shutdown")
async def shutdown_event():
    client_mongo.close()