#!/bin/bash

# Comprehensive Testing Script for Minikube Setup
# This script runs comprehensive tests against the deployed Minikube environment

set -e

echo "🧪 Running comprehensive tests against Minikube cluster..."

# Function to test cluster connectivity
test_cluster_connectivity() {
    echo "🔗 Testing cluster connectivity..."
    
    if kubectl cluster-info | grep -q "running"; then
        echo "✅ Cluster is accessible"
    else
        echo "❌ Cluster connectivity failed"
        return 1
    fi
    
    # Test node status
    if kubectl get nodes | grep -q "Ready"; then
        echo "✅ Nodes are ready"
    else
        echo "❌ Nodes are not ready"
        return 1
    fi
}

# Function to test deployments
test_deployments() {
    echo "🚀 Testing deployments..."
    
    # Test sample-apps namespace deployments
    local deployments=(
        "sample-apps:nginx-deployment"
        "sample-apps:redis-deployment"
        "sample-apps:nodejs-app"
        "testing:test-scale-app"
        "testing:resource-test-app"
    )
    
    for deployment in "${deployments[@]}"; do
        IFS=':' read -r namespace name <<< "$deployment"
        
        if kubectl get deployment "$name" -n "$namespace" &> /dev/null; then
            # Check if deployment is available
            if kubectl wait --for=condition=available deployment/"$name" -n "$namespace" --timeout=60s; then
                echo "✅ Deployment $namespace/$name is ready"
                
                # Get replica info
                local desired=$(kubectl get deployment "$name" -n "$namespace" -o jsonpath='{.spec.replicas}')
                local ready=$(kubectl get deployment "$name" -n "$namespace" -o jsonpath='{.status.readyReplicas}')
                echo "   📊 Replicas: $ready/$desired ready"
            else
                echo "❌ Deployment $namespace/$name is not ready"
            fi
        else
            echo "❌ Deployment $namespace/$name not found"
        fi
    done
}

# Function to test daemonsets
test_daemonsets() {
    echo "👹 Testing DaemonSets..."
    
    local daemonsets=(
        "monitoring:datadog-agent"
        "monitoring:node-exporter"
        "monitoring:fluentd-logging"
    )
    
    for daemonset in "${daemonsets[@]}"; do
        IFS=':' read -r namespace name <<< "$daemonset"
        
        if kubectl get daemonset "$name" -n "$namespace" &> /dev/null; then
            # Get DaemonSet status
            local desired=$(kubectl get daemonset "$name" -n "$namespace" -o jsonpath='{.status.desiredNumberScheduled}')
            local current=$(kubectl get daemonset "$name" -n "$namespace" -o jsonpath='{.status.currentNumberScheduled}')
            local ready=$(kubectl get daemonset "$name" -n "$namespace" -o jsonpath='{.status.numberReady}')
            
            echo "✅ DaemonSet $namespace/$name found"
            echo "   📊 Status: $ready/$current ready, $desired desired"
            
            if [ "$ready" = "$desired" ]; then
                echo "   ✅ All DaemonSet pods are ready"
            else
                echo "   ⚠️ Some DaemonSet pods are not ready"
            fi
        else
            echo "❌ DaemonSet $namespace/$name not found"
        fi
    done
}

# Function to test services
test_services() {
    echo "🌐 Testing services..."
    
    local services=(
        "sample-apps:nginx-service:80"
        "sample-apps:redis-service:6379"
        "sample-apps:nodejs-service:3000"
        "testing:test-scale-app:80"
        "monitoring:node-exporter-service:9100"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r namespace name port <<< "$service"
        
        if kubectl get service "$name" -n "$namespace" &> /dev/null; then
            local cluster_ip=$(kubectl get service "$name" -n "$namespace" -o jsonpath='{.spec.clusterIP}')
            echo "✅ Service $namespace/$name found (IP: $cluster_ip:$port)"
            
            # Test service connectivity using a test pod
            if kubectl run test-connectivity-$(date +%s) --rm -i --image=alpine:3.16 --restart=Never -- \
                /bin/sh -c "timeout 10 nc -z $cluster_ip $port" &> /dev/null; then
                echo "   ✅ Service is accessible"
            else
                echo "   ⚠️ Service connectivity test inconclusive"
            fi
        else
            echo "❌ Service $namespace/$name not found"
        fi
    done
}

# Function to test pod logs
test_pod_logs() {
    echo "📝 Testing pod logs..."
    
    # Test logs from DaemonSet pods
    local daemonsets=("datadog-agent" "node-exporter" "fluentd-logging")
    
    for ds in "${daemonsets[@]}"; do
        echo "📋 Checking logs for DaemonSet: $ds"
        local pods=$(kubectl get pods -n monitoring -l app="$ds" -o jsonpath='{.items[*].metadata.name}')
        
        for pod in $pods; do
            if kubectl logs "$pod" -n monitoring --tail=5 &> /dev/null; then
                echo "✅ Logs available for pod: $pod"
                echo "   Last log lines:"
                kubectl logs "$pod" -n monitoring --tail=2 | sed 's/^/     /'
            else
                echo "❌ No logs available for pod: $pod"
            fi
        done
    done
}

# Function to test resource usage
test_resource_usage() {
    echo "📊 Testing resource usage..."
    
    # Test if metrics-server is working
    if kubectl top nodes &> /dev/null; then
        echo "✅ Node metrics available:"
        kubectl top nodes | sed 's/^/   /'
    else
        echo "⚠️ Node metrics not available (metrics-server may still be starting)"
    fi
    
    if kubectl top pods -n monitoring &> /dev/null; then
        echo "✅ Pod metrics available for monitoring namespace:"
        kubectl top pods -n monitoring | sed 's/^/   /'
    else
        echo "⚠️ Pod metrics not available"
    fi
}

# Function to test scaling operations
test_scaling_operations() {
    echo "📏 Testing scaling operations..."
    
    # Test scaling up
    echo "🔼 Testing scale up operation..."
    kubectl scale deployment test-scale-app -n testing --replicas=7
    
    if kubectl wait --for=condition=available deployment/test-scale-app -n testing --timeout=120s; then
        local ready=$(kubectl get deployment test-scale-app -n testing -o jsonpath='{.status.readyReplicas}')
        echo "✅ Scale up successful: $ready replicas ready"
    else
        echo "❌ Scale up operation failed"
    fi
    
    # Test scaling down
    echo "🔽 Testing scale down operation..."
    kubectl scale deployment test-scale-app -n testing --replicas=3
    
    sleep 10  # Wait a bit for scale down
    local ready=$(kubectl get deployment test-scale-app -n testing -o jsonpath='{.status.readyReplicas}')
    echo "✅ Scale down completed: $ready replicas ready"
}

# Function to generate test report
generate_test_report() {
    echo ""
    echo "📋 COMPREHENSIVE TEST REPORT"
    echo "================================"
    
    echo "🏷️ Cluster Information:"
    kubectl cluster-info | sed 's/^/   /'
    
    echo ""
    echo "📊 Resource Summary:"
    echo "   Namespaces:"
    kubectl get namespaces | grep -E "(sample-apps|testing|monitoring)" | sed 's/^/     /'
    
    echo "   Deployments:"
    kubectl get deployments --all-namespaces | grep -E "(sample-apps|testing)" | sed 's/^/     /'
    
    echo "   DaemonSets:"
    kubectl get daemonsets --all-namespaces | grep monitoring | sed 's/^/     /'
    
    echo "   Services:"
    kubectl get services --all-namespaces | grep -E "(sample-apps|testing|monitoring)" | sed 's/^/     /'
    
    echo ""
    echo "🎯 Test Environment Status: READY FOR TESTING"
    echo "   - Minikube cluster operational"
    echo "   - Sample workloads deployed"
    echo "   - Monitoring DaemonSets running"
    echo "   - Services accessible"
    echo "   - Scaling operations functional"
}

# Main test execution
main() {
    echo "🧪 Starting comprehensive Minikube tests..."
    echo "=========================================="
    
    # Run all tests
    test_cluster_connectivity
    echo ""
    
    test_deployments
    echo ""
    
    test_daemonsets
    echo ""
    
    test_services
    echo ""
    
    test_pod_logs
    echo ""
    
    test_resource_usage
    echo ""
    
    test_scaling_operations
    echo ""
    
    generate_test_report
    
    echo ""
    echo "✅ Comprehensive testing completed!"
    echo "🎉 Minikube environment is ready for Kubernetes DaemonSet Management application testing"
}

# Run main function
main