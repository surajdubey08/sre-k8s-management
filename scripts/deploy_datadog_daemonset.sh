#!/bin/bash

# Deploy Datadog DaemonSet and Monitoring Tools
# This script deploys monitoring tools including Datadog DaemonSet simulation

set -e

echo "🚀 Deploying monitoring tools and Datadog DaemonSet simulation..."

# Create monitoring namespace if it doesn't exist
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Create Datadog DaemonSet simulation (using a generic monitoring container)
echo "📊 Creating Datadog DaemonSet simulation..."

cat > /tmp/datadog-daemonset.yaml << EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: datadog-agent
  namespace: monitoring
  labels:
    app: datadog-agent
    component: monitoring
spec:
  selector:
    matchLabels:
      app: datadog-agent
  template:
    metadata:
      labels:
        app: datadog-agent
    spec:
      serviceAccountName: datadog-agent
      containers:
      - name: datadog-agent
        image: alpine:3.16
        command:
        - /bin/sh
        - -c
        - |
          echo "Datadog Agent simulation starting..."
          echo "Node: \$NODE_NAME"
          echo "Namespace: \$POD_NAMESPACE"
          while true; do
            echo "\$(date): Monitoring node \$NODE_NAME"
            sleep 60
          done
        env:
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: DD_API_KEY
          value: "mock-datadog-api-key-for-simulation"
        - name: DD_SITE
          value: "datadoghq.com"
        - name: DD_LOGS_ENABLED
          value: "true"
        - name: DD_APM_ENABLED
          value: "true"
        - name: DD_PROCESS_AGENT_ENABLED
          value: "true"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        volumeMounts:
        - name: proc
          mountPath: /host/proc
          readOnly: true
        - name: sys
          mountPath: /host/sys
          readOnly: true
        - name: var-run
          mountPath: /var/run
          readOnly: true
      volumes:
      - name: proc
        hostPath:
          path: /proc
      - name: sys
        hostPath:
          path: /sys
      - name: var-run
        hostPath:
          path: /var/run
      hostNetwork: true
      hostPID: true
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: datadog-agent
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: datadog-agent
rules:
- apiGroups: [""]
  resources: ["nodes", "nodes/metrics", "nodes/spec", "nodes/proxy", "nodes/stats"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["pods", "services", "endpoints"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "daemonsets", "statefulsets"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: datadog-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: datadog-agent
subjects:
- kind: ServiceAccount
  name: datadog-agent
  namespace: monitoring
EOF

# Deploy Datadog DaemonSet
echo "📦 Deploying Datadog DaemonSet simulation..."
kubectl apply -f /tmp/datadog-daemonset.yaml

# Create Prometheus simulation DaemonSet
echo "📊 Creating Prometheus Node Exporter DaemonSet..."

cat > /tmp/node-exporter-daemonset.yaml << EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
    component: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      containers:
      - name: node-exporter
        image: alpine:3.16
        command:
        - /bin/sh
        - -c
        - |
          echo "Node Exporter simulation starting on node \$NODE_NAME"
          while true; do
            echo "\$(date): Exporting metrics from node \$NODE_NAME"
            echo "  - CPU usage: \$(( RANDOM % 100 ))%"
            echo "  - Memory usage: \$(( RANDOM % 100 ))%"
            echo "  - Disk usage: \$(( RANDOM % 100 ))%"
            sleep 30
          done
        env:
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        ports:
        - containerPort: 9100
          name: metrics
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
        volumeMounts:
        - name: proc
          mountPath: /host/proc
          readOnly: true
        - name: sys
          mountPath: /host/sys
          readOnly: true
      volumes:
      - name: proc
        hostPath:
          path: /proc
      - name: sys
        hostPath:
          path: /sys
      hostNetwork: true
      hostPID: true
---
apiVersion: v1
kind: Service
metadata:
  name: node-exporter-service
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  selector:
    app: node-exporter
  ports:
  - port: 9100
    targetPort: 9100
    name: metrics
EOF

# Deploy Node Exporter DaemonSet
echo "📦 Deploying Node Exporter DaemonSet..."
kubectl apply -f /tmp/node-exporter-daemonset.yaml

# Create Fluentd logging DaemonSet
echo "📝 Creating Fluentd logging DaemonSet..."

cat > /tmp/fluentd-daemonset.yaml << EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd-logging
  namespace: monitoring
  labels:
    app: fluentd-logging
    component: logging
spec:
  selector:
    matchLabels:
      app: fluentd-logging
  template:
    metadata:
      labels:
        app: fluentd-logging
    spec:
      containers:
      - name: fluentd
        image: alpine:3.16
        command:
        - /bin/sh
        - -c
        - |
          echo "Fluentd logging agent starting on node \$NODE_NAME"
          while true; do
            echo "\$(date): Collecting logs from node \$NODE_NAME"
            echo "  - Processing application logs"
            echo "  - Processing system logs"
            echo "  - Forwarding to central logging system"
            sleep 45
          done
        env:
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        resources:
          requests:
            memory: "100Mi"
            cpu: "50m"
          limits:
            memory: "200Mi"
            cpu: "100m"
        volumeMounts:
        - name: var-log
          mountPath: /var/log
          readOnly: true
        - name: var-lib-docker
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: var-log
        hostPath:
          path: /var/log
      - name: var-lib-docker
        hostPath:
          path: /var/lib/docker/containers
      hostNetwork: true
EOF

# Deploy Fluentd DaemonSet
echo "📦 Deploying Fluentd logging DaemonSet..."
kubectl apply -f /tmp/fluentd-daemonset.yaml

# Wait for all DaemonSets to be ready
echo "⏳ Waiting for monitoring DaemonSets to be ready..."

# Wait for Datadog DaemonSet
kubectl wait --for=condition=ready pod -l app=datadog-agent -n monitoring --timeout=300s

# Wait for Node Exporter DaemonSet
kubectl wait --for=condition=ready pod -l app=node-exporter -n monitoring --timeout=300s

# Wait for Fluentd DaemonSet
kubectl wait --for=condition=ready pod -l app=fluentd-logging -n monitoring --timeout=300s

echo "✅ Monitoring tools deployed successfully!"
echo "📊 DaemonSet Status:"
kubectl get daemonsets -n monitoring -o wide
echo ""
echo "🔍 Pod Status in monitoring namespace:"
kubectl get pods -n monitoring -o wide
echo ""
echo "📋 All DaemonSets across cluster:"
kubectl get daemonsets --all-namespaces