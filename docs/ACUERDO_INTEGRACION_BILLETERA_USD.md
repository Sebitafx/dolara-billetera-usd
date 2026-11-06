# Acuerdo de integración — Billetera Digital USD

Fecha de propuesta: 2026-11-06
Contrato relacionado: `docs/openapi.yaml`
Estado: **aprobado por el propietario el 2026-11-06; pendiente de implementación completa en producción**

## 0. Alcance aprobado y límite del producto

Este acuerdo se limita estrictamente a **Billetera Digital USD**:

- Identidad mínima necesaria para acceder y autorizar operaciones de la billetera.
- Saldo, ledger, depósitos, retiros y transferencias exclusivamente en USD.
- Historial, auditoría y estados operativos de la billetera.
- Equivalencia USD/PEN únicamente informativa; este servicio nunca acredita ni guarda PEN.
- Integraciones con Clientes y Saldos únicamente en lo necesario para validar y ejecutar estas operaciones.

Existe una billetera separada que trabaja en soles. Al integrar ambos proyectos se mantiene una
frontera estricta de contexto:

- Billetera Digital USD es la única propietaria y escritora del saldo/ledger USD.
- Billetera Digital PEN es la única propietaria y escritora del saldo/ledger PEN.
- La identidad del usuario puede compartirse, pero saldos, movimientos e idempotencia se separan por contexto y moneda.
- Todo comando, evento y movimiento debe declarar `moneda` y servicio/contexto emisor.
- Nunca se fusionan filas o movimientos solamente por `user_id`, ni se convierte un registro PEN en USD durante migraciones.
- Esta API rechaza escrituras monetarias PEN; una solicitud PEN debe dirigirse a la billetera de soles.
- `/fx/convertir` sigue siendo informativo. Una conversión real entre billeteras requeriría un contrato y una saga de liquidación independientes, fuera del alcance aprobado.

Quedan expresamente fuera de alcance:

- Saldos o ledger multimoneda.
- Compraventa o liquidación real de divisas.
- Criptoactivos, préstamos, inversiones y remesas.
- Emisión o procesamiento de tarjetas.
- Productos bancarios o datos de clientes no necesarios para la billetera USD.

Los controles de seguridad, calidad, auditoría, observabilidad y continuidad son requisitos
transversales del producto; no amplían su alcance funcional.

## 1. Decisiones aprobadas

### Depósitos y confirmación de Saldos

| Respuesta de Saldos | Estado local | Respuesta al canal | Regla |
|---|---|---|---|
| `COMPLETADO` con `movimiento_id` | `COMPLETADO` | `201 Created` | Único caso que confirma el abono. |
| `PENDIENTE` o `PROCESANDO` | `VALIDADO` | `202 Accepted` | Incluir `Location` y `Retry-After`; reconciliar posteriormente. |
| Rechazo funcional definitivo | `FALLIDO` | `422` con código funcional | No reintentar automáticamente salvo acuerdo específico. |
| HTTP 2xx con payload inválido o estado desconocido | `VALIDADO` | `502 Bad Gateway` con referencia consultable | El abono pudo ocurrir; reconciliar y nunca inferir `COMPLETADO`. |
| Timeout después de enviar el crédito | `VALIDADO` | `503 Service Unavailable` con referencia consultable | Resultado ambiguo; reconciliar usando el mismo `deposito_id`. |
| Dependencia indisponible antes de crear/enviar la operación | Sin depósito nuevo | `503 Service Unavailable` | El canal puede reintentar con la misma `Idempotency-Key`. |

La respuesta `202` usa el estado local `VALIDADO`; no se agrega `PROCESANDO` al dominio interno.
El cliente consulta `GET /api/v1/depositos/usd/{id}` hasta obtener un estado terminal.

### Canal frente a método de origen

Son campos distintos y ambos son obligatorios para nuevas operaciones:

- `canal`: `VENTANILLA | AGENTE | APP`.
- `metodo_origen`: `EFECTIVO | TRANSFERENCIA | TARJETA | OTRO`.

Política propuesta:

| Canal | Métodos admitidos inicialmente |
|---|---|
| `VENTANILLA` | `EFECTIVO` |
| `AGENTE` | `EFECTIVO` |
| `APP` | `TRANSFERENCIA`, `TARJETA`, `OTRO` |

El canal no debe inferir silenciosamente el método. Si el equipo mantiene `APP → TRANSFERENCIA`
como única opción inicial, debe validarse explícitamente y ampliarse mediante una nueva versión.

### Estado operativo de la billetera

Estados propuestos: `ACTIVE | BLOCKED | CLOSED`.

- `ACTIVE`: permite operaciones autorizadas.
- `BLOCKED`: permite consultas de auditoría, pero rechaza créditos, débitos y transferencias.
- `CLOSED`: estado terminal; rechaza toda operación monetaria.
- En una transferencia se validan origen y destino antes de modificar saldos.
- Un rechazo por estado devuelve `422 WALLET_BLOCKED` o `422 WALLET_CLOSED` sin movimientos parciales.
- El servicio propietario de Billeteras es la fuente de verdad del estado.

### Autenticación y autorización

Usuarios web/móvil:

- OAuth 2.0 Authorization Code con PKCE `S256`.
- Cliente público sin `client_secret`.
- Access token para llamar a la API; el ID token no autoriza operaciones.
- Los endpoints PIN actuales quedan obsoletos y solo se mantienen durante la transición demo.

Servicios y canales backend:

- OAuth 2.0 Client Credentials.
- Un cliente confidencial por servicio o canal, nunca un secreto compartido global.
- Scopes mínimos por consumidor.
- El access token se cachea hasta 60 segundos antes de `exp`; no se solicita uno por transacción.
- Las credenciales se almacenan en AWS Secrets Manager y se rotan.

Validaciones obligatorias del access token:

- Firma mediante JWKS y algoritmo esperado.
- `iss` del User Pool autorizado.
- `client_id` o `aud` permitido.
- `token_use=access`.
- `exp`, `nbf` e `iat` coherentes.
- Scope requerido por operación.
- Autorización sobre el recurso: el usuario no puede operar una billetera ajena solo por tener scope.

Scopes propuestos para esta API:

- `billetera/depositos.read`
- `billetera/depositos.write`
- `billetera/wallets.read`
- `billetera/wallets.write`
- `billetera/transferencias.write`
- `billetera/fx.read`

Scopes salientes del microservicio:

- `clientes/read` para `CustomerAccountPort`.
- `saldos/credit` para `BalancePort`.

## 2. Respuestas HTTP acordadas

| Código | Uso |
|---|---|
| `200` | Consulta correcta o replay idempotente. |
| `201` | Operación creada y confirmada. |
| `202` | Operación aceptada, todavía no terminal. |
| `400` | Payload, headers o formato inválido. |
| `401` | Token ausente, inválido o expirado. |
| `403` | Token válido sin scope o sin acceso al recurso. |
| `404` | Recurso inexistente o no visible para el principal. |
| `409` | Conflicto de idempotencia o estado concurrente. |
| `422` | Regla de negocio: bloqueada, cerrada, fondos insuficientes, cuenta no habilitada. |
| `429` | Límite excedido; incluir `Retry-After`. |
| `502` | Dependencia respondió con contrato inválido o estado desconocido. |
| `503` | Dependencia temporalmente no disponible o timeout. |

## 3. Reglas técnicas obligatorias

- Mantener `Idempotency-Key` UUID v4 en depósitos y transferencias.
- Usar el mismo `deposito_id` como referencia idempotente ante Saldos.
- Un reintento nunca puede producir un segundo abono.
- Vincular la `Idempotency-Key` al principal autenticado, operación y hash del payload para impedir replays cruzados entre clientes.
- No reintentar errores funcionales 4xx; reintentar timeouts/5xx con backoff, jitter y límite.
- Validar respuestas de dependencias con esquema estricto antes de cambiar estados.
- Mantener transición monotónica: `PENDIENTE → VALIDADO → COMPLETADO | FALLIDO`.
- Ejecutar reconciliación de operaciones `VALIDADO` y alertar por antigüedad excesiva.
- Hacer la transición terminal y el registro de auditoría en una misma transacción; el reconciliador debe ser idempotente y tolerar ejecuciones concurrentes.
- Comprobar el estado de ambas billeteras dentro de la misma transacción y después de adquirir los bloqueos de fila.
- Aplicar circuit breaker a dependencias para evitar cascadas, sin convertir resultados ambiguos en fallos definitivos.
- Propagar `X-Correlation-Id` a Clientes y Saldos.
- Registrar auditoría sin PIN, tokens, secretos ni payloads financieros innecesarios.
- Aplicar rate limiting por principal, cliente y ruta; devolver `429` con `Retry-After`.
- Usar HTTPS y HSTS en producción; el HTTP por IP actual es solo temporal.
- En respuestas financieras sensibles usar `Cache-Control: no-store`; aplicar CSP, `frame-ancestors`, `nosniff` y una política CORS de orígenes explícitos.
- Cachear JWKS y refrescarlo ante un `kid` desconocido; permitir como máximo 60 segundos de desviación de reloj.

## 4. Cambios de datos requeridos

- Agregar `depositos_usd.canal` con migración compatible y restricción de enum/check.
- Conservar `metodo_origen` como campo independiente.
- Agregar `wallets.estado`, inicialmente `ACTIVE` para registros existentes.
- Registrar fecha, motivo y actor de bloqueo/cierre en una tabla o bitácora de auditoría.
- Indexar depósitos por estado y fecha para el reconciliador.

## 5. Brechas actuales de implementación

- `BalanceHttpAdapter` acepta cualquier HTTP 2xx sin validar un estado de negocio.
- No existe respuesta `202` ni proceso reconciliador.
- La base de datos no almacena `canal` en depósitos.
- Las billeteras existentes no tienen estado operativo.
- No existe middleware OAuth/JWT ni verificación de scopes.
- La aplicación pública todavía opera por HTTP y el login demo usa PIN.

## 6. Datos de configuración que el equipo debe completar

- Dominio real de Cognito/OIDC; los dominios `.example` del OpenAPI son placeholders.
- User Pool ID, issuer y app client IDs permitidos por ambiente.
- Dueño y política de rotación de cada client secret.
- TTL definitivo de access tokens y margen de renovación.
- Tiempo de `Retry-After`, SLA máximo en `VALIDADO` y responsable del reconciliador.
- Proceso administrativo y responsables autorizados para bloquear/desbloquear billeteras.
- Licencia definitiva y URL pública de sus términos antes de distribuir el contrato externamente.

Decisiones ya cerradas:

- Política canal/método: VENTANILLA y AGENTE usan EFECTIVO; APP admite TRANSFERENCIA, TARJETA u OTRO explícito.
- El servicio Billeteras es la fuente de verdad del estado operativo.
- Una billetera `BLOCKED` o `CLOSED` no puede enviar ni recibir fondos.
- Para usuarios se devuelve `404` cuando el recurso no les pertenece, evitando enumeración; para clientes de servicio autenticados sin autorización se devuelve `403`.

## 7. Puertas de calidad obligatorias

- OpenAPI válido, referencias resueltas y pruebas de contrato para productores y consumidores.
- Pruebas unitarias, integración con PostgreSQL, E2E, concurrencia e idempotencia.
- Casos negativos de autorización, scopes, propiedad de recursos, tokens expirados y rotación JWKS.
- Análisis de dependencias, imágenes y secretos; cero vulnerabilidades críticas o altas sin excepción formal.
- Migraciones compatibles con datos existentes, respaldo previo, rollback y restauración verificada.
- Pruebas de carga sobre lecturas y escrituras críticas sin degradar consistencia financiera.
- Despliegue progresivo con readiness/liveness y rollback automático ante errores o latencia anormal.
- Métricas y alertas de errores 5xx, rechazos 401/403/429, operaciones `VALIDADO` envejecidas y fallos de reconciliación.
- Logs estructurados y auditoría inmutable, sin tokens, PIN, secretos ni datos sensibles innecesarios.
- Revisión manual de seguridad antes de retirar el modo demo y habilitar OAuth obligatorio.

## 8. Orden de implementación aprobado

1. Completar placeholders de ambiente sin alterar las decisiones aprobadas.
2. Crear migraciones compatibles y poblar valores existentes.
3. Validar estados reales de Saldos y soportar `202` + reconciliación.
4. Aplicar estado de billetera en cada operación monetaria.
5. Configurar OAuth, secretos, scopes y verificación JWT en modo observación.
6. Migrar la SPA a Authorization Code + PKCE.
7. Activar enforcement, rate limits, HTTPS y alertas.
8. Ejecutar pruebas de contrato, integración, concurrencia, seguridad y rollback.
9. Publicar el OpenAPI aprobado y retirar gradualmente los endpoints PIN.

El contrato está aprobado, pero no debe publicarse como **implementado/enforced** hasta cerrar
las brechas anteriores y superar todas las puertas de calidad.
