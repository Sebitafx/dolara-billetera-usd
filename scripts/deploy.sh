#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "🚀 INICIANDO DESPLIEGUE DE BILLETERA DIGITAL USD EN KUBERNETES (K3S)"
echo "=================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "📁 1. Usando el código fuente sincronizado en $PROJECT_DIR"

if [[ "${SKIP_IMAGE_BUILD:-false}" == "true" ]]; then
  echo "📦 2-3. Usando imágenes previamente importadas en k3s..."
else
  echo "🐳 2. Construyendo imágenes Docker..."
  docker build -t billetera-usd-backend:latest -f backend/Dockerfile .
  docker build -t billetera-usd-frontend:latest ./frontend

  echo "📦 3. Importando imágenes a containerd de k3s..."
  docker save billetera-usd-backend:latest | sudo k3s ctr images import -
  docker save billetera-usd-frontend:latest | sudo k3s ctr images import -
fi

echo "☸️  4. Aplicando manifiestos de Kubernetes..."
kubectl apply -k ./k8s

echo "🔄 5. Reiniciando deployments..."
kubectl rollout restart deployment/ms-depositos-usd
kubectl rollout restart deployment/mcp-sandbox
kubectl rollout restart deployment/web

echo "⏳ 6. Verificando estado de los despliegues..."
kubectl rollout status deployment/ms-depositos-usd --timeout=120s
kubectl rollout status deployment/mcp-sandbox --timeout=120s
kubectl rollout status deployment/web --timeout=120s

echo "✅ 7. Recursos activos en Kubernetes:"
kubectl get pods,svc,pvc,ingress

echo "=================================================="
echo "✨ DESPLIEGUE COMPLETADO CON ÉXITO"
echo "=================================================="
