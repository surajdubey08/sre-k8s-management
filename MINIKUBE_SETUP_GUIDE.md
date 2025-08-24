# Minikube Setup Guide for Kubernetes DaemonSet Management

This guide provides comprehensive instructions for setting up a complete Minikube testing environment for the Kubernetes DaemonSet Management application.

## 🎯 Overview

The Minikube setup creates a complete testing environment with:
- **Minikube cluster** with essential addons
- **Sample workloads** for testing configuration management
- **Monitoring DaemonSets** including Datadog, Prometheus Node Exporter, and Fluentd
- **Comprehensive testing scenarios** for validation

## 📋 Prerequisites

Before starting, ensure you have the following installed:

### Required Tools
- **Docker**: Container runtime for Minikube
- **Minikube**: Local Kubernetes cluster
- **kubectl**: Kubernetes command-line tool

### Installation Commands

#### Ubuntu/Debian
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

#### macOS
```bash
# Install Docker Desktop from https://docker.com
# Or use Homebrew
brew install docker

# Install Minikube
brew install minikube

# Install kubectl
brew install kubectl
```

#### Windows
```powershell
# Install Docker Desktop from https://docker.com
# Install Minikube using Chocolatey
choco install minikube

# Install kubectl
choco install kubernetes-cli
```

## 🚀 Quick Setup

### Automated Setup (Recommended)

Run the complete setup with one command:

```bash
cd /app/scripts
./minikube_setup.sh && ./deploy_sample_workloads.sh && ./deploy_datadog_daemonset.sh
```

### Manual Step-by-Step Setup

#### 1. Setup Minikube Cluster
```bash
cd /app/scripts
./minikube_setup.sh
```

This script will:
- Start Minikube with optimal settings (4 CPUs, 8GB RAM)
- Enable essential addons (dashboard, metrics-server, ingress)
- Create necessary namespaces
- Verify cluster readiness

#### 2. Deploy Sample Workloads
```bash
./deploy_sample_workloads.sh
```

This deploys:
- **nginx-deployment**: Frontend web server (3 replicas)
- **redis-deployment**: Database service (1 replica)
- **nodejs-app**: Backend application (2 replicas)
- **test-scale-app**: Scalable test application (5 replicas)
- **resource-test-app**: Resource-constrained application

#### 3. Deploy Monitoring DaemonSets
```bash
./deploy_datadog_daemonset.sh
```

This deploys:
- **Datadog Agent DaemonSet**: Monitoring simulation
- **Prometheus Node Exporter DaemonSet**: Metrics collection
- **Fluentd Logging DaemonSet**: Log aggregation

All DaemonSets include proper RBAC, service accounts, and realistic configurations.

## 🧪 Testing & Validation

### Run Comprehensive Tests
```bash
./run_comprehensive_tests.sh
```

This tests:
- **Cluster connectivity**
- **Deployment health and scaling**
- **DaemonSet functionality**
- **Service accessibility**
- **Pod logs and monitoring**
- **Resource usage metrics**

### Manual Verification

#### Check Cluster Status
```bash
kubectl cluster-info
kubectl get nodes -o wide
```

#### Verify Deployments
```bash
kubectl get deployments --all-namespaces
kubectl get pods --all-namespaces
```

#### Check DaemonSets
```bash
kubectl get daemonsets -n monitoring
kubectl describe daemonset datadog-agent -n monitoring
```

#### Test Services
```bash
kubectl get services --all-namespaces
kubectl port-forward -n sample-apps service/nginx-service 8080:80
# Visit http://localhost:8080 in browser
```

## 📊 Monitoring & Observability

### DaemonSet Monitoring

The setup includes three monitoring DaemonSets that simulate real-world monitoring tools:

#### Datadog Agent Simulation
- **Purpose**: Application and infrastructure monitoring
- **Features**: Node monitoring, process tracking, log collection
- **Access logs**: `kubectl logs -l app=datadog-agent -n monitoring`

#### Prometheus Node Exporter
- **Purpose**: System metrics collection
- **Features**: CPU, memory, disk metrics
- **Access metrics**: `kubectl port-forward -n monitoring service/node-exporter-service 9100:9100`

#### Fluentd Logging
- **Purpose**: Log aggregation and forwarding
- **Features**: Container and system log collection
- **Access logs**: `kubectl logs -l app=fluentd-logging -n monitoring`

### Resource Monitoring
```bash
# Node resource usage
kubectl top nodes

# Pod resource usage
kubectl top pods -n monitoring
kubectl top pods -n sample-apps
```

## 🔧 Configuration Management Testing

### Test Configuration Updates

#### Scale Deployments
```bash
# Scale up
kubectl scale deployment nginx-deployment -n sample-apps --replicas=5

# Scale down
kubectl scale deployment nginx-deployment -n sample-apps --replicas=2

# Verify scaling
kubectl get deployment nginx-deployment -n sample-apps -w
```

#### Update Resource Limits
```bash
# Update resource limits
kubectl patch deployment nodejs-app -n sample-apps -p='{"spec":{"template":{"spec":{"containers":[{"name":"nodejs-app","resources":{"limits":{"cpu":"200m","memory":"256Mi"}}}]}}}}'

# Verify update
kubectl describe deployment nodejs-app -n sample-apps
```

#### Rolling Updates
```bash
# Update image version
kubectl set image deployment/nginx-deployment -n sample-apps nginx=nginx:1.22

# Watch rollout
kubectl rollout status deployment/nginx-deployment -n sample-apps

# Rollback if needed
kubectl rollout undo deployment/nginx-deployment -n sample-apps
```

## 🎛️ Application Integration

### Connect Your Application

Once the Minikube environment is ready, configure your Kubernetes DaemonSet Management application:

#### 1. Get Cluster Configuration
```bash
# Export kubeconfig
kubectl config view --raw > /tmp/kubeconfig.yaml

# Get cluster endpoint
kubectl cluster-info
```

#### 2. Update Application Configuration
```bash
# Set environment variables for your application
export KUBECONFIG=/tmp/kubeconfig.yaml
export KUBERNETES_CLUSTER_ENDPOINT=$(kubectl config view -o jsonpath='{.clusters[0].cluster.server}')
```

#### 3. Test Application Connectivity
```bash
# Test from your application
curl -k -H "Authorization: Bearer $(kubectl create token default)" \
  $KUBERNETES_CLUSTER_ENDPOINT/api/v1/namespaces/sample-apps/pods
```

## 🗑️ Cleanup & Maintenance

### Cleanup Options

#### Clean Test Resources Only
```bash
./cleanup_minikube.sh
# Select option 2 to keep cluster running
```

#### Reset Entire Cluster
```bash
./cleanup_minikube.sh
# Select option 3 to completely reset
```

#### Manual Cleanup
```bash
# Delete specific namespaces
kubectl delete namespace sample-apps testing monitoring

# Or reset everything
minikube delete
```

## 📈 Performance Testing Scenarios

### Scenario 1: DaemonSet Management
```bash
# Test DaemonSet operations
kubectl get daemonsets -n monitoring
kubectl describe daemonset datadog-agent -n monitoring
kubectl logs -l app=datadog-agent -n monitoring --tail=50
```

### Scenario 2: Multi-Namespace Operations
```bash
# Test cross-namespace operations
kubectl get deployments --all-namespaces
kubectl scale deployment nginx-deployment -n sample-apps --replicas=10
kubectl scale deployment test-scale-app -n testing --replicas=1
```

### Scenario 3: Configuration Drift Detection
```bash
# Simulate configuration drift
kubectl patch daemonset datadog-agent -n monitoring -p='{"spec":{"template":{"spec":{"containers":[{"name":"datadog-agent","env":[{"name":"DD_LOG_LEVEL","value":"DEBUG"}]}]}}}}'

# Verify changes
kubectl describe daemonset datadog-agent -n monitoring
```

### Scenario 4: Resource Monitoring
```bash
# Monitor resource usage during operations
watch 'kubectl top nodes && echo "---" && kubectl top pods -n monitoring'
```

## 🔍 Troubleshooting

### Common Issues

#### Minikube Won't Start
```bash
# Check Docker status
sudo systemctl status docker

# Restart Docker if needed
sudo systemctl restart docker

# Delete and recreate cluster
minikube delete && minikube start
```

#### Pods Stuck in Pending
```bash
# Check node resources
kubectl describe nodes
kubectl top nodes

# Check events
kubectl get events --all-namespaces --sort-by='.lastTimestamp'
```

#### DaemonSet Pods Not Scheduling
```bash
# Check node taints and tolerations
kubectl describe nodes | grep -A5 -B5 Taints

# Check DaemonSet status
kubectl describe daemonset datadog-agent -n monitoring
```

### Debug Commands
```bash
# Get cluster information
kubectl cluster-info dump

# Check system pods
kubectl get pods -n kube-system

# View pod logs
kubectl logs <pod-name> -n <namespace> --previous

# Describe resources for events
kubectl describe <resource-type> <resource-name> -n <namespace>
```

## 📚 Additional Resources

### Minikube Documentation
- [Minikube Official Documentation](https://minikube.sigs.k8s.io/docs/)
- [Kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)

### Kubernetes Learning Resources
- [Kubernetes Official Tutorials](https://kubernetes.io/docs/tutorials/)
- [DaemonSet Concepts](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)

### Monitoring & Observability
- [Datadog Kubernetes Monitoring](https://docs.datadoghq.com/agent/kubernetes/)
- [Prometheus Node Exporter](https://github.com/prometheus/node_exporter)
- [Fluentd Documentation](https://docs.fluentd.org/)

## ✅ Success Criteria

Your Minikube environment is ready when:
- ✅ Cluster is running and accessible
- ✅ All sample deployments are ready
- ✅ All DaemonSets are running on all nodes
- ✅ Services are accessible
- ✅ Metrics are available through kubectl top
- ✅ Resource scaling operations work
- ✅ Your application can connect to the cluster

## 🎉 Next Steps

With your Minikube environment ready:
1. **Test your application** against the cluster
2. **Validate DaemonSet management** features
3. **Test configuration updates** with real workloads
4. **Monitor performance** under different scenarios
5. **Practice incident response** with the monitoring setup

Happy testing! 🚀