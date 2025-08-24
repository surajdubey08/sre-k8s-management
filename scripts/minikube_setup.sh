#!/bin/bash

# Minikube Setup Script for Kubernetes DaemonSet Management Testing
# This script sets up a complete Minikube cluster with sample workloads and monitoring tools

set -e

echo "🚀 Setting up Minikube cluster for Kubernetes DaemonSet Management testing..."

# Check if minikube is installed
if ! command -v minikube &> /dev/null; then
    echo "❌ Minikube is not installed. Please install minikube first."
    echo "   Visit: https://minikube.sigs.k8s.io/docs/start/"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Function to wait for pods to be ready
wait_for_pods() {
    local namespace=$1
    local label_selector=$2
    local timeout=${3:-300}
    
    echo "⏳ Waiting for pods in namespace '$namespace' with selector '$label_selector' to be ready..."
    kubectl wait --for=condition=ready pod -l "$label_selector" -n "$namespace" --timeout="${timeout}s" || true
}

# Function to check if minikube is running
check_minikube_status() {
    if minikube status | grep -q "Running"; then
        echo "✅ Minikube is already running"
        return 0
    else
        return 1
    fi
}

# Start Minikube if not running
if ! check_minikube_status; then
    echo "🎯 Starting Minikube cluster..."
    minikube start --driver=docker --cpus=4 --memory=8192 --disk-size=20g --kubernetes-version=v1.28.3
    
    # Wait for cluster to be ready
    echo "⏳ Waiting for cluster to be ready..."
    kubectl wait --for=condition=ready nodes --all --timeout=300s
else
    echo "✅ Using existing Minikube cluster"
fi

# Enable necessary addons
echo "🔧 Enabling Minikube addons..."
minikube addons enable dashboard
minikube addons enable metrics-server
minikube addons enable ingress

# Wait for addons to be ready
echo "⏳ Waiting for addons to be ready..."
wait_for_pods "kubernetes-dashboard" "k8s-app=kubernetes-dashboard" 120
wait_for_pods "kube-system" "k8s-app=metrics-server" 120

# Create namespaces
echo "🏗️ Creating namespaces..."
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace sample-apps --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace testing --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Minikube cluster setup completed!"
echo "📊 Cluster Information:"
kubectl cluster-info
echo ""
echo "📋 Node Status:"
kubectl get nodes -o wide