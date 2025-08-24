#!/bin/bash

# Cleanup Minikube Environment Script
# This script provides options to clean up the Minikube testing environment

set -e

echo "🧹 Minikube Environment Cleanup Script"
echo "======================================"

# Function to show current cluster status
show_cluster_status() {
    echo "📊 Current Cluster Status:"
    
    if minikube status &> /dev/null; then
        echo "✅ Minikube is running"
        
        echo "   Deployments:"
        kubectl get deployments --all-namespaces | grep -E "(sample-apps|testing)" | sed 's/^/     /' || echo "     None found"
        
        echo "   DaemonSets:"
        kubectl get daemonsets --all-namespaces | grep monitoring | sed 's/^/     /' || echo "     None found"
        
        echo "   Namespaces:"
        kubectl get namespaces | grep -E "(sample-apps|testing|monitoring)" | sed 's/^/     /' || echo "     None found"
    else
        echo "❌ Minikube is not running"
    fi
}

# Function to clean up test resources only
cleanup_test_resources() {
    echo "🗑️ Cleaning up test resources..."
    
    # Delete test namespaces (this will delete all resources within them)
    local namespaces=("sample-apps" "testing" "monitoring")
    
    for ns in "${namespaces[@]}"; do
        if kubectl get namespace "$ns" &> /dev/null; then
            echo "   Deleting namespace: $ns"
            kubectl delete namespace "$ns" --ignore-not-found=true
        fi
    done
    
    # Wait for namespaces to be fully deleted
    echo "⏳ Waiting for namespace cleanup..."
    for ns in "${namespaces[@]}"; do
        kubectl wait --for=delete namespace/"$ns" --timeout=120s &> /dev/null || true
    done
    
    echo "✅ Test resources cleaned up"
}

# Function to reset minikube cluster
reset_minikube_cluster() {
    echo "🔄 Resetting Minikube cluster..."
    
    if minikube status &> /dev/null; then
        echo "   Stopping Minikube..."
        minikube stop
    fi
    
    echo "   Deleting Minikube cluster..."
    minikube delete
    
    echo "✅ Minikube cluster reset"
}

# Function to show cleanup options
show_cleanup_options() {
    echo ""
    echo "🛠️ Cleanup Options:"
    echo "1. Show current status only"
    echo "2. Clean up test resources (keep cluster running)"
    echo "3. Reset entire Minikube cluster"
    echo "4. Exit without changes"
    echo ""
}

# Main cleanup function
main() {
    show_cluster_status
    show_cleanup_options
    
    read -p "Select an option (1-4): " choice
    
    case $choice in
        1)
            echo "📋 Status shown above. No changes made."
            ;;
        2)
            read -p "⚠️ This will delete all test namespaces and resources. Continue? (y/N): " confirm
            if [[ $confirm =~ ^[Yy]$ ]]; then
                cleanup_test_resources
                echo "✅ Test resources cleaned up. Minikube cluster is still running."
            else
                echo "❌ Cleanup cancelled."
            fi
            ;;
        3)
            read -p "⚠️ This will completely delete the Minikube cluster. Continue? (y/N): " confirm
            if [[ $confirm =~ ^[Yy]$ ]]; then
                reset_minikube_cluster
                echo "✅ Minikube cluster completely reset."
            else
                echo "❌ Reset cancelled."
            fi
            ;;
        4)
            echo "👋 Exiting without changes."
            ;;
        *)
            echo "❌ Invalid option. Exiting."
            exit 1
            ;;
    esac
}

# Check if minikube is available
if ! command -v minikube &> /dev/null; then
    echo "❌ Minikube is not installed or not in PATH"
    exit 1
fi

# Run main function
main