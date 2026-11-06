# SDD + OpenAPI + MCP | Billetera Digital USD / Depósitos USD

Estado: paquete de **especificaciones para implementar**. No incluye un servidor ya desplegado y no prueba la API real de AWS porque no se dispone del código/repositorio ni del URL de ejecución en este paquete.

## Objetivo
Permitir que agentes de IA de dos equipos verifiquen la integración con el servicio de depósitos en USD sin dinero real, mediante un MCP remoto limitado a Sandbox. La billetera continuará llamando a los contratos REST convenidos y/o recibiendo eventos/webhooks si están realmente implementados.

## Contratos preexistentes
- `contracts/openapi-billetera-referencia.yaml`: archivo previo de billetera, **borrador**, incluido como referencia NO CANÓNICA. Define `/wallets/{walletId}`, `/wallets/{walletId}/balance`, `/internal/deposit-credits`, `/transactions/{transactionId}`, prefijo de servidor `/api/v1`.
- Advertencia: en su estado recibido, `Currency` solo permite `PEN`. No se debe apuntar un agente USD a él sin resolver primero el desacople.
- El diseño SDD anterior de *Depósitos USD* propone `POST /api/v1/depositos/usd` y endpoints de consulta. Estas rutas necesitan verificarse contra el OpenAPI del microservicio REAL desplegado antes de configurar el MCP.
- El OpenAPI canónico del microservicio desplegado debe identificarse y guardarse en el repositorio del usuario. NO se fabrica ni se sobrescribe aquí.

## Arquitectura objetivo

    Agentes IA equipo A/B -----> MCP (Streamable HTTP + Auth) ------> API Depósitos USD SANDBOX
                                                                       |       |
                                                                       |       +--> BD exclusiva de pruebas
                                                                       +--> simulador de proveedor externo
                                                                                  |
    Aplicación de billetera ---------------> REST/OpenAPI <------ integración con saldos de prueba

- MCP opera como **cliente** de la API REST y nunca accede a tablas de otros servicios.
- El Sandbox tiene endpoints simuladores o un adaptador de proveedor exclusivamente en modo sandbox; jamás se habilita esto en producción.
- Preferir sidecar TypeScript separado de NestJS de dominio para no contaminar capa hexagonal.

## Contenido
- `specs/001-mcp-sandbox-usd/spec.md` - alcance y criterios medibles
- `specs/001-mcp-sandbox-usd/plan.md` - diseño y secuencia de implementación
- `specs/001-mcp-sandbox-usd/tasks.md` - lista de tareas ejecutables para agentes
- `contracts/mcp-tools.md` - herramientas MCP, permisos y resultados
- `contracts/gap-openapi-usd.md` - diferencias del contrato conocido vs USD
- `tests/acceptance.md` - casos obligatorios y pruebas con dos equipos
- `deployment/security-and-ci.md` - despliegue AWS y GitHub Actions
- `prompts/AGENTE_IMPLEMENTADOR.md` - prompt para pegar al agente
- `contracts/openapi-billetera-referencia.yaml` - respaldo del borrador previo

## Iniciar Spec Kit en un repositorio existente
1. Crear rama o commit limpio de respaldo.
2. Instalar CLI: `uv tool install specify-cli` (requiere `uv`).
3. Desde la raíz del repositorio existente: `specify init --here --force --integration copilot` (sustituir `copilot` por la integración disponible). **Revisar el diff:** `--force` puede sobrescribir archivos gestionados por Spec Kit.
4. Entregar al agente el documento `prompts/AGENTE_IMPLEMENTADOR.md` y los archivos de este paquete.
5. Ejecutar en el chat del agente, en secuencia, las capacidades de Spec Kit que exponga: constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge. En Copilot suelen tener forma `/speckit-constitution`, `/speckit-specify`, etc.; otros agentes usan `/speckit.*` o `$speckit-*`.
6. No generar una nueva API arbitraria. El paso **C0** de tareas debe contrastar contratos con el código vivo y pedir revisión humana solo para cambios de contrato reales.

## Puertas de aceptación
- Todas las herramientas MCP invocan únicamente `SANDBOX_API_BASE_URL`, con allowlist; sin acceso ni secretos de producción.
- Cualquier intento de usar moneda PEN en el servicio de depósitos USD resulta rechazado según contrato definitivo.
- Repetir la misma operación una o diez veces no genera abonos múltiples.
- Reusar un identificador con payload contradictorio no acredita dinero.
- Ninguna operación sandbox invoca una pasarela real ni registra efectos de saldo productivo.
- La billetera consumidora supera test de contrato y escenario E2E con dos servicios.
- Se publican OpenAPI verificado, manual de conexión MCP, reporte de pruebas y URL de sandbox.

## Referencias técnicas
- Spec Kit: https://github.github.com/spec-kit/quickstart
- Adopción en repo existente: https://github.github.io/spec-kit/guides/existing-projects.html
- SDK MCP TypeScript v2: https://ts.sdk.modelcontextprotocol.io/v2/
- Protocolo MCP: https://modelcontextprotocol.io/


---

# Prompt maestro para agente de programación (ejecutar en repositorio real)

Eres un agente senior de Ingeniería de Software. Debes implementar por SDD la infraestructura de pruebas autónomas entre el microservicio de **Depósitos USD** de Billetera Digital y el equipo consumidor, usando un servidor MCP remoto y un Sandbox AWS existente o nuevo, sin transacciones reales. Todos los integrantes trabajan con agentes de IA.

## Contexto obligatorio
1. El backend ya está desplegado en AWS por GitHub Actions; NO recrees el proyecto ni sustituyas su arquitectura. Adáptate al lenguaje/framework/estructura realmente encontrados. Diseño previo: NestJS + TypeScript + PostgreSQL, hexagonal/Clean.
2. Existe `contracts/openapi-billetera-referencia.yaml` que es un BORRADOR del contrato de la billetera, con `Currency=[PEN]`. También existe SDD anterior de **Depósitos USD**. Estos archivos no son prueba de qué endpoints están actualmente desplegados.
3. Identifica el OpenAPI canónico de los endpoints reales y contrástalo con DTOs/controladores/código, prefijo de Gateway y el despliegue AWS. NO inventes rutas, modelos ni transacciones confirmadas.
4. Preserva: moneda USD exclusiva, centavos/decimal exacto, `Idempotency-Key`, `X-Correlation-ID`, estados consistentes, autenticación M2M y una sola fuente de verdad del saldo.
5. MCP es capa de automatización para agentes; la Billetera real consume REST/eventos, no MCP como mecanismo financiero de negocio.

## Orden obligatorio
Fase 0 Auditoría: inventario del código, diagramas de flujo, rutas desplegadas, OpenAPI y riesgos. Genera `contract-gap-resolved.md` con evidencias y asuntos por decidir.
Fase 1 Spec: produce/revisa `spec.md`, casos BDD, límites y decisiones. No implementar antes de que el contrato USD esté resuelto.
Fase 2 Plan: diseñar MCP separado en TS con SDK `@modelcontextprotocol/server` v2, Streamable HTTP HTTPS, Auth, cliente API REST, Sandbox con proveedor simulado por puertos de arquitectura hexagonal.
Fase 3 Tasks: ordenar tareas con dependencias y pruebas primero; mantener cambios aditivos y compatibles.
Fase 4 Implementación: crear sandbox aislado, DTO y autorización, MCP tools solo sobre API sandbox, trazabilidad, fixtures, y documentación de onboarding.
Fase 5 Tests: unit + OpenAPI contract + consumer/provider + E2E dos servicios + seguridad, concurrencia, no duplicidad, moneda incorrecta y reintentos.
Fase 6 Despliegue: GitHub Actions limitado a sandbox; logs seguros; no modificar producción; usar infraestructura existente si está disponible.
Fase 7 Convergencia: requisitos ↔ pruebas ↔ artefactos; reporte real. No afirmar funcionalidad no ejecutada.

## Guardrails
- Prohibido realizar depósitos reales o llamar API bancaria de producción.
- Prohibido añadir simuladores/usuarios ficticios a producción o publicar `internal/deposit-credits` al usuario final.
- Nunca modificar directamente la DB del sistema de Billetera ni generar dobles créditos.
- Antes de cambios de contrato incompatibles, marcar bloqueo y proponer migración/versionado.
- No colocar credenciales en el chat, código ni logs. Usar GitHub Environments/Secrets.
- Al terminar cada fase, entregar archivos cambiados, comandos ejecutados, pruebas pass/fail, pendientes y enlace al PR si existe.

## Criterio final de aceptación
Ambos equipos conectan sus agentes al MCP, realizan depósitos USD de prueba en AWS sandbox, consultan resultados y validan acreditación ficticia EXACTAMENTE UNA VEZ; no hay llamadas ni efectos en producción. El contrato REST y la seguridad de integración se cumplen en CI.

Lee primero y respeta todos los documentos bajo `specs/001-mcp-sandbox-usd/`, `contracts/`, `tests/`, `deployment/`.


---

# Informe inicial de gap: contrato de billetera vs Depósitos USD

**Origen:** `openapi-billetera-referencia.yaml` (documento anterior, versión `1.0.0-draft`, explícitamente plantilla). El microservicio desplegado en AWS NO ha sido inspeccionado desde aquí.

## Operaciones documentadas en el borrador
- `GET /api/v1/wallets/{walletId}` (`getWallet`) — usuario.
- `GET /api/v1/wallets/{walletId}/balance` (`getWalletBalance`) — usuario.
- `POST /api/v1/internal/deposit-credits` (`creditConfirmedDeposit`) — servicio a servicio con OAuth2 scope `deposits:credit`.
- `GET /api/v1/transactions/{transactionId}` (`getTransaction`) — usuario o servicio.

> Nota: el prefijo `/api/v1` procede de `servers.url`; los `paths` no lo incluyen. La ruta final depende de cómo se configure el servidor real.

## Incompatibilidades verificables en el archivo
1. `components.schemas.Currency.enum = [PEN]`, incluidos examples en PEN; para un sistema USD esto es incompatible.
2. El archivo describe la **Billetera** (receptor de crédito), no la API pública del proveedor **Depósitos USD**.
3. `POST /internal/deposit-credits` es una orden interna sensible: no debe exponerse ni llamarse libremente desde MCP; el agente solicita el depósito o su simulación al servicio autorizado.
4. `amountMinorUnits` como entero es razonable en contratos de Billetera; el SDD de depósitos anterior sugiere decimal exacto. Debe acordarse conversión y unidad de dinero en límite de integración.
5. Ejemplos/hostnames son ilustrativos; no se conocen dominios ni credenciales de AWS actuales.

## Decisiones que el agente debe corroborar
- Ruta y DTO REAL de `POST depósito USD`; no asumir `/api/v1/depositos/usd` aunque aparezca en SDD anterior.
- Fuente de verdad del saldo USD (billetera, ledger o cuentas) y si soporta USD en su OpenAPI vigente.
- Token de cliente vs token M2M, estados reales, callbacks/eventos, error 409 y estrategias de reintento.
- `Idempotency-Key` debe ser semánticamente consistente entre los equipos y no permitir doble crédito por `depositId`.

## Procedimiento
1. Inventariar rutas del código y versión desplegada.
2. Comparar con borrador, describir diferencias y acordarlas con equipo dueño.
3. Publicar OpenAPI canónico versionado; generar tests de proveedor/consumidor.
4. Solo después mapear tools MCP a `operationId` y autorizaciones.


---

# Tareas ordenadas para agentes — MCP Sandbox USD

> NO marcar completada sin adjuntar evidencia de PR/archivo/prueba. El proyecto existente y el OpenAPI real son la fuente de verdad; el archivo de referencia adjunto es borrador.

## Fase C: Descubrimiento de contrato
- [ ] C01 localizar OpenAPI vigente y URL del backend desplegado; extraer rutas reales y seguridad.
- [ ] C02 comparar esquemas/DTOs: `openapi-billetera-referencia.yaml` vs implementación de Depósitos USD.
- [ ] C03 registrar incompatibilidad `Currency: [PEN]` y proponer adaptación USD con revisión del dueño de Billetera.
- [ ] C04 decidir rutas/estados/eventos reales; generar `contracts/gap-resuelto.md`.
- [ ] C05 establecer contrato canónico versionado y validación automática.

## Fase S: Sandbox estricto
- [ ] S01 diseñar configuración por ambiente y bloqueo de invocaciones productivas desde sandbox.
- [ ] S02 crear BD aislada, esquema y migraciones para fixtures de prueba.
- [ ] S03 implementar adaptador de fuente de fondos simulada en el puerto existente sin tocar dominio.
- [ ] S04 permitir escenarios `SUCCESS`, `FAILED`, `PENDING`, `TIMEOUT` solo cuando autorizados en sandbox.
- [ ] S05 implementar namespace por equipo/run y limpieza con TTL auditado.
- [ ] S06 integrar con saldo/ledger de prueba mediante su API o contrato pactado.

## Fase M: Servidor MCP
- [ ] M01 crear módulo/proyecto Node+TS con SDK MCP v2 y validación Zod.
- [ ] M02 implementar cliente HTTP de API sandbox con TLS, timeout, retries seguros y correlation ID.
- [ ] M03 implementar tools acordadas a partir de `operationId` reales; read-only por defecto.
- [ ] M04 aplicar RBAC/scopes por equipo y credenciales por entorno.
- [ ] M05 limitar destino HTTP por allowlist y bloquear SSRF, redacciones de logs, rate limits y tamaños.
- [ ] M06 publicar MCP por Streamable HTTP/HTTPS y probar descubrimiento remoto desde agentes A/B.

## Fase T: Contract/E2E tests
- [ ] T01 generar tests DTO/schema desde OpenAPI canónico.
- [ ] T02 probar USD con monto válido, zero/negative, moneda PEN, wallet bloqueada.
- [ ] T03 probar 1 primer depósito vs 10 reintentos con mismo ID/key; verificar solo un crédito.
- [ ] T04 probar misma idempotency key con payload distinto y mismo depositId con nueva key: 409 y sin cambio de saldo.
- [ ] T05 probar `SUCCESS/FAILED/PENDING/TIMEOUT`, reintentos, carrera/concurrencia y pérdida de webhook si existe.
- [ ] T06 probar autorización insuficiente y llamadas hacia destinos de producción bloqueadas.
- [ ] T07 ejecutar validación end-to-end desde la billetera del Equipo B, no solo sobre mocks.
- [ ] T08 publicar matriz de evidencia e identificar pruebas bloqueadas por contratos no acordados.

## Fase D: GitHub Actions/AWS
- [ ] D01 agregar CI independiente con lint, typecheck, unit, contract, integration, security.
- [ ] D02 crear despliegue exclusivo Sandbox con secrets e IAM restringidos.
- [ ] D03 instalar proxy HTTPS, Auth MCP, logs y health/readiness.
- [ ] D04 generar documentación de onboarding + lista de herramientas + ejemplos sanitizados.
- [ ] D05 hacer PR; no exponer datos de producción ni desplegar simulador en prod.

## Cierre
- [ ] A01 requisito↔prueba↔evidencia enlazados.
- [ ] A02 revisión conjunta equipo A/B, aprobación de responsable de contratos.
- [ ] A03 pruebas corridas contra AWS Sandbox y resultados guardados.
