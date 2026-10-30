#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "🚀 INICIANDO DESPLIEGUE DOLARA EN KUBERNETES (K3S)"
echo "=================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "📥 1. Actualizando código fuente desde Git..."
git fetch origin main || true
git reset --hard origin/main || true

echo "🐳 2. Construyendo imágenes Docker..."
docker build -t dolara-backend:latest ./backend
docker build -t dolara-frontend:latest ./frontend

echo "📦 3. Importando imágenes a containerd de k3s..."
docker save dolara-backend:latest | sudo k3s ctr images import -
docker save dolara-frontend:latest | sudo k3s ctr images import -

echo "☸️  4. Aplicando manifiestos de Kubernetes..."
kubectl apply -k ./k8s

echo "🔄 5. Reiniciando deployments..."
kubectl rollout restart deployment/ms-depositos-usd
kubectl rollout restart deployment/web

echo "⏳ 6. Verificando estado de los despliegues..."
kubectl rollout status deployment/ms-depositos-usd --timeout=120s
kubectl rollout status deployment/web --timeout=120s

echo "✅ 7. Recursos activos en Kubernetes:"
kubectl get pods,svc,pvc,ingress

echo "=================================================="
echo "✨ DESPLIEGUE COMPLETADO CON ÉXITO"
echo "=================================================="
