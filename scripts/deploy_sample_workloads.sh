#!/bin/bash

# Deploy Sample Workloads Script
# This script deploys various sample applications and workloads for testing

set -e

echo "🚀 Deploying sample workloads to Minikube cluster..."

# Function to apply YAML and wait for readiness
apply_and_wait() {
    local file_path=$1
    local namespace=$2
    local resource_type=$3
    local resource_name=$4
    
    echo "📦 Applying $file_path..."
    kubectl apply -f "$file_path"
    
    if [ "$resource_type" = "deployment" ]; then
        kubectl wait --for=condition=available deployment/"$resource_name" -n "$namespace" --timeout=300s
    elif [ "$resource_type" = "daemonset" ]; then
        kubectl wait --for=condition=ready pod -l app="$resource_name" -n "$namespace" --timeout=300s
    fi
}

# Create sample deployment manifests
echo "📝 Creating sample deployment manifests..."

# Sample Nginx Deployment
cat > /tmp/nginx-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  namespace: sample-apps
  labels:
    app: nginx
    tier: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
  namespace: sample-apps
spec:
  selector:
    app: nginx
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
  type: ClusterIP
EOF

# Sample Redis Deployment
cat > /tmp/redis-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-deployment
  namespace: sample-apps
  labels:
    app: redis
    tier: database
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:6.2
        ports:
        - containerPort: 6379
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 100m
            memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  namespace: sample-apps
spec:
  selector:
    app: redis
  ports:
    - protocol: TCP
      port: 6379
      targetPort: 6379
  type: ClusterIP
EOF

# Sample Node.js App Deployment
cat > /tmp/nodejs-app-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nodejs-app
  namespace: sample-apps
  labels:
    app: nodejs-app
    tier: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nodejs-app
  template:
    metadata:
      labels:
        app: nodejs-app
    spec:
      containers:
      - name: nodejs-app
        image: node:16-alpine
        command: ["/bin/sh"]
        args: ["-c", "echo 'const http = require(\"http\"); const server = http.createServer((req, res) => { res.writeHead(200, {\"Content-Type\": \"text/plain\"}); res.end(\"Hello from Node.js App!\"); }); server.listen(3000, () => { console.log(\"Server running on port 3000\"); });' > app.js && node app.js"]
        ports:
        - containerPort: 3000
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 100m
            memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: nodejs-service
  namespace: sample-apps
spec:
  selector:
    app: nodejs-app
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
  type: ClusterIP
EOF

# Deploy sample applications
echo "🚀 Deploying sample applications..."
apply_and_wait "/tmp/nginx-deployment.yaml" "sample-apps" "deployment" "nginx-deployment"
apply_and_wait "/tmp/redis-deployment.yaml" "sample-apps" "deployment" "redis-deployment"
apply_and_wait "/tmp/nodejs-app-deployment.yaml" "sample-apps" "deployment" "nodejs-app"

# Create some test deployments with different configurations
echo "📦 Creating additional test deployments..."

# Scaled deployment for testing
kubectl create deployment test-scale-app --image=nginx:1.20 --replicas=5 -n testing
kubectl expose deployment test-scale-app --port=80 --target-port=80 -n testing

# Deployment with resource constraints
kubectl create deployment resource-test-app --image=busybox --replicas=1 -n testing -- sleep 3600
kubectl set resources deployment resource-test-app -n testing --requests=cpu=50m,memory=32Mi --limits=cpu=100m,memory=64Mi

# Wait for test deployments to be ready
kubectl wait --for=condition=available deployment/test-scale-app -n testing --timeout=300s
kubectl wait --for=condition=available deployment/resource-test-app -n testing --timeout=300s

echo "✅ Sample workloads deployed successfully!"
echo "📊 Deployment Summary:"
echo "   Sample Apps Namespace:"
kubectl get deployments -n sample-apps -o wide
echo ""
echo "   Testing Namespace:"
kubectl get deployments -n testing -o wide
echo ""
echo "🌐 Services:"
kubectl get services -n sample-apps
kubectl get services -n testing