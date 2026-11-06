# Estado de trabajo

- **Objetivo:** implementar el contrato aprobado de Billetera Digital USD, limitado estrictamente a operaciones y saldo USD, con equivalencia USD/PEN solo referencial.
- **Completado:** el propietario aprobó el OpenAPI 3.0.3 v1.2.0 y `docs/ACUERDO_INTEGRACION_BILLETERA_USD.md` el 2026-11-06. El alcance se cerró a identidad mínima, saldo/ledger USD, depósitos, retiros, transferencias, historial, estado de billeteras y equivalencia USD/PEN solo referencial. Se excluyeron explícitamente multimoneda, liquidación FX, cripto, préstamos, inversiones, tarjetas y remesas. Se registró la frontera con la billetera PEN: identidad compartible, pero ledgers, movimientos, idempotencia y escritura separados por contexto/moneda; esta API nunca escribe PEN. El contrato incluye 201/202/502/503, canal/método, estados `ACTIVE|BLOCKED|CLOSED`, OAuth PKCE/M2M, scopes, 401/403/429, reconciliación y puertas obligatorias de seguridad/calidad. Auditorías automáticas confirmaron seguridad transversal y ausencia de monedas fuera del ledger USD; Redocly lo valida correctamente.
- **Archivos modificados:** backend, frontend, `docs/openapi.yaml`, Docker/Compose, Kubernetes, CI/CD, README, `scripts/deploy.sh` y especificaciones relacionadas.
- **Completado en despliegue:** EC2 `i-01f182cf185fcd22f` (`BilleteraDigitalUSD-Prod`) y K3s continúan saludables. El release `billetera-digital-usd-fx-20261101-201559` se transfirió con SHA-256 verificados y se actualizó progresivamente sin recrear PostgreSQL ni el PVC. Backend y web nuevos están `Running` sin reinicios. La verificación pública devolvió la cotización real `USD_PEN=3.467246`, `PEN_USD=0.288413`, fuente `ExchangeRate-API`, `stale=false`; conversiones cruzadas e identidad respondieron correctamente. OpenAPI público reporta v1.1.0 y el YAML conserva descarga `billetera-digital-usd-openapi.yaml`.
- **Siguiente paso:** desplegar la revisión aprobada v1.2.0, verificar `/docs.json` y `/openapi.yaml`, y mantener el estado `approved-pending-implementation` hasta completar OAuth, migraciones y reconciliación.
- **Cambios previos preservados:** saltos de línea finales en `.github/workflows/deploy.yml`, `docs/openapi.yaml`, `k8s/*.yaml` y `scripts/deploy.sh`.

## Integración del sandbox MCP (2026-11-06)

- **Objetivo:** incorporar el commit `8affa7f` de `origin/main` a la rama de trabajo, conservando los cambios locales.
- **Completado:** merge local `d46ca1a`; cliente MCP ajustado a las rutas actuales; OpenAPI canónico servido desde el YAML local y exportable sin iniciar la API; reinicio limitado a registros `sandbox-`/`test-` y habilitado solo con `SANDBOX_MODE=true` fuera de producción; sidecar MCP añadido a Docker Compose.
- **Archivos modificados:** `backend/src/index.ts`, `backend/src/openapi.ts`, `backend/src/mcp/client.ts`, `backend/src/mcp/tools.ts`, `backend/src/routes/sandbox.ts`, `backend/src/adapters/fakes.ts`, `backend/tests/mcp.test.ts`, `backend/scripts/export-openapi.ts`, `backend/.env.example`, `backend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`, `specs/002-mcp-dolara/contracts/openapi-canonica-usd.json` y `docs/openapi.yaml`.
- **Verificación:** backend y frontend compilan; 51/51 pruebas backend pasan con PostgreSQL local; Docker construye API y sidecar; `/docs.json`, `/api/v1/sandbox/scenarios`, `/health` de MCP y conexión SSE responden localmente.
- **Siguiente paso:** revisar los cambios locales pendientes y el contrato propuesto v1.2.0 con el equipo antes de publicar o desplegar.

## Despliegue AWS del sandbox (2026-11-06)

- **Objetivo:** subir la integración del sandbox a la EC2 productiva sin publicar el contrato OAuth v1.2.0 aún propuesto.
- **Completado:** release `billetera-sandbox-20261106` transferido con SHA-256 verificado; imagen `billetera-usd-backend:sandbox-20261106` importada a containerd de K3s; API actualizada y sidecar MCP interno creado. OpenAPI público v1.1.1 incorpora las rutas del sandbox. La regla SSH temporal `190.43.149.147/32` se retiró al finalizar.
- **Verificación:** API y MCP `1/1` disponibles; PostgreSQL y web conservan sus pods anteriores; `/health/ready` listo, `/docs.json` v1.1.1, siete escenarios, tasa FX real sin stale y `/sandbox/reset` devuelve 403 en producción. El sidecar responde `/health` dentro del clúster.
- **Archivos modificados:** `k8s/mcp.yaml`, `k8s/kustomization.yaml`, `k8s/config.yaml`, `scripts/deploy.sh` y paquete de release temporal fuera del repositorio.
- **Siguiente paso:** acordar un entorno de sandbox separado y autenticado si los agentes externos necesitan invocar herramientas MCP o reiniciar datos de prueba desde Internet.

## Publicación inmutable y sincronización de OpenAPI (2026-11-06)

- **Causa identificada:** el commit con OpenAPI v1.2.0 estaba únicamente en `docs/actualizacion-specs`; el workflow solo observa `main`, no existía en la rama predeterminada y tampoco transfería el código del runner a EC2. Además, la instancia K3s no tiene Docker, por lo que no puede construir imágenes durante el despliegue remoto.
- **Corrección:** CI valida pruebas, builds y OpenAPI; construye imágenes Linux/AMD64 etiquetadas con el SHA, transfiere código e imágenes, las importa en K3s, fija cada Deployment al SHA y verifica públicamente salud y versión OpenAPI.
- **Siguiente paso:** publicar el pipeline corregido en `main`, ejecutar el despliegue y confirmar OpenAPI v1.2.0 en `http://54.167.69.62/docs/`.
