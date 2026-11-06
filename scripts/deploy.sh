#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "🚀 INICIANDO DESPLIEGUE DE BILLETERA DIGITAL USD EN KUBERNETES (K3S)"
echo "=================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOY_COMMIT="${DEPLOY_COMMIT:-$IMAGE_TAG}"

echo "📁 1. Usando el código fuente sincronizado en $PROJECT_DIR"

if [[ "${SKIP_IMAGE_BUILD:-false}" == "true" ]]; then
  echo "📦 2-3. Usando imágenes previamente importadas en k3s con etiqueta $IMAGE_TAG..."
else
  echo "🐳 2. Construyendo imágenes Docker..."
  docker build --platform linux/amd64 -t "billetera-usd-backend:$IMAGE_TAG" -f backend/Dockerfile .
  docker build --platform linux/amd64 -t "billetera-usd-frontend:$IMAGE_TAG" ./frontend

  echo "📦 3. Importando imágenes a containerd de k3s..."
  docker save "billetera-usd-backend:$IMAGE_TAG" | sudo k3s ctr images import -
  docker save "billetera-usd-frontend:$IMAGE_TAG" | sudo k3s ctr images import -
fi

echo "☸️  4. Aplicando manifiestos de Kubernetes..."
kubectl apply -k ./k8s

echo "🏷️  5. Fijando imágenes al release inmutable $IMAGE_TAG..."
kubectl set image deployment/ms-depositos-usd "ms-depositos-usd=billetera-usd-backend:$IMAGE_TAG"
kubectl set image deployment/mcp-sandbox "mcp-sandbox=billetera-usd-backend:$IMAGE_TAG"
kubectl set image deployment/web "web=billetera-usd-frontend:$IMAGE_TAG"
kubectl annotate deployment/ms-depositos-usd deployment.billetera-usd/commit="$DEPLOY_COMMIT" --overwrite
kubectl annotate deployment/mcp-sandbox deployment.billetera-usd/commit="$DEPLOY_COMMIT" --overwrite
kubectl annotate deployment/web deployment.billetera-usd/commit="$DEPLOY_COMMIT" --overwrite

echo "⏳ 6. Verificando estado de los despliegues..."
kubectl rollout status deployment/ms-depositos-usd --timeout=120s
kubectl rollout status deployment/mcp-sandbox --timeout=120s
kubectl rollout status deployment/web --timeout=120s

echo "✅ 7. Recursos activos en Kubernetes:"
kubectl get pods,svc,pvc,ingress

echo "=================================================="
echo "✨ DESPLIEGUE COMPLETADO CON ÉXITO"
echo "=================================================="
