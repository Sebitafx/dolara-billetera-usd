# Constitución del proyecto — Billetera en Dólares (ms-billetera-usd)

> Curso: Desarrollo de Aplicaciones para la Nube · Microservicio del sistema de pagos (equipo billetera USD).
> Moneda base: USD · Precisión: 2 decimales (NUMERIC, cero floats) · Metodología: Spec-Driven Development.
> Integración: REST independiente (sin gateway en v1) · Despliegue v1: local con Docker Compose.
> FX: exchangerate.host (`live`, source=USD) con caché 1h + fallback a última tasa guardada.

---

## C1

Todo endpoint público (`/api/*`, `/health`, `/docs`) requiere ≥1 test de integración (vitest + supertest) antes de darse por terminado.

## C2

Reglas de dinero (bug bloqueante si se violan): montos como `NUMERIC(12,2)` en Postgres, cero floats en todo el flujo; saldo nunca negativo; depósitos/retiros/transferencias en transacción SQL con `SELECT … FOR UPDATE` y orden de bloqueo fijo (menor `wallet_id` primero); transferencia sin fondos = `422` atómico (no debita nada); movimientos inmutables (nadie edita ni borra `movements`, solo inserta).

## C3

Ningún secreto commiteado (`FX_API_KEY`, credenciales Postgres): viven en `backend/.env` (no versionado) y se documentan en `backend/.env.example`; la key de FX existe solo en el backend, el frontend jamás la ve. Identidad demo v1 vía header `X-User-Id` (auth real JWT fuera de alcance, se deja hook). Violación = bloquear tarea y rotar secreto.

## C4

Migraciones SQL versionadas como única fuente de verdad del esquema; `seed.sql` reproducible para la demo (2 billeteras + movimientos de ejemplo). Nada de `CREATE TABLE` manual fuera de migraciones.

## C5

Contrato antes que código: ningún endpoint sin contrato previo en `plan.md` (método, path, params, request/response JSON con ejemplo, códigos de error) + Swagger UI servido en `/docs` (OpenAPI generado desde anotaciones).

## C6

Sin verde no se avanza: `docker compose up` y demo solo con `npm test` en verde; orden estricto de `tasks.md` (no saltar sin test verde previo).

## C7

Trazabilidad spec → plan → tasks → tests: cada tarea referencia `RF-*`, cada `RF-*` tiene ≥1 test; sin RF huérfanos ni tests sin RF.

## C8

Supuestos explícitos, no magia: moneda base USD; precisión 2 decimales con redondeo half-up; `FX_TTL_MIN=60`; `FX_TIMEOUT_MS=5000`; tasa PEN↔USD de exchangerate.host endpoint `live` (`source=USD`, `quotes.USDPEN`); si un supuesto cambia, se actualiza `spec.md` primero y luego `plan.md`.

## C9

Integración por puertos, no por URLs (contrato de la clase): Clientes/Cuentas y Saldos se consumen tras `CustomerAccountPort` y `BalancePort`; en Etapa A se usan fakes (`FakeCustomerAccountAdapter`, `FakeBalanceAdapter` con ledger local); al llegar los contratos reales solo cambian adaptadores/config, nunca el caso de uso.

## C10

Convenciones de la clase: base path `/api/v1`, dinero como string `"150.50"`, errores `{ status, code, message, correlation_id, timestamp }`, health `/health/live` + `/health/ready`, correlación `X-Correlation-Id`, puerto 3001 (DB host 5433).

## C11

Alcance híbrido: el core de la clase (depósitos USD con saldo externo, C9) no se mezcla con el módulo billetera local (saldo propio, retiros, transferencias demo). Tablas y endpoints separados (`depositos_usd` vs `wallets`/`billetera_movimientos`; `/api/v1/depositos/usd` vs `/api/v1/billetera/*`); el módulo local no forma parte del contrato de integración de la clase.
