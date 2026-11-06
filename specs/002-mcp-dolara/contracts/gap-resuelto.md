# Cierre de Brechas (Gap Analysis Resuelto) — Contrato Canónico USD

**Referencia Inicial:** Borrador `openapi-billetera-referencia.yaml` (v1.0.0-draft con `Currency: [PEN]`).
**Contrato Canónico Definitivo:** `openapi-canonica-usd.json` (DOLARA USD-only v2.0.0).

---

## 1. Resolución de Incompatibilidades

### A. Moneda del Sistema
* **Borrador previo:** `components.schemas.Currency.enum = [PEN]`.
* **Resolución Canónica:** DOLARA es un microservicio **100% en Dólares (USD-only)** con restricción de integridad `CHECK (moneda = 'USD')`.
  * Cualquier payload con `moneda: "PEN"` es rechazado en el borde con **HTTP 400 `VALIDATION_ERROR`**.
  * No se permite conversión implícita de saldo. Las conversiones FX en `/api/v1/fx/convertir` son estrictamente referenciales e informativas.

### B. Mapeo de Operaciones (Billetera vs Depósitos USD)
* **Borrador previo:** Definía endpoints de billetera receptora genérica (`/wallets/{walletId}/balance`, `/internal/deposit-credits`).
* **Resolución Canónica:**
  1. `/api/v1/depositos/usd` (POST): Creación de depósito auditado con `Idempotency-Key` obligatoria.
  2. `/api/v1/depositos/usd/{id}` (GET): Consulta de trazabilidad del depósito.
  3. `/api/v1/billetera/wallets` (POST / GET): Gestión de saldo propio DOLARA.
  4. `/api/v1/billetera/transferencias` (POST): Transferencias P2P atómicas entre usuarios (soporta UUID y alias legibles).
  5. `/api/v1/fx/tasa` (GET) y `/api/v1/fx/convertir` (POST): Consulta de tasa cambiaria referencial.
  6. `/api/v1/sandbox/reset` (POST) y `/api/v1/sandbox/scenarios` (GET): Herramientas exclusivas para pruebas de agentes.

### C. Precisión Monetaria
* **Borrador previo:** `amountMinorUnits` en enteros.
* **Resolución Canónica:** String decimal con 2 dígitos (`"150.50"`) en HTTP / JSON, persistido como `NUMERIC(18,2)` en PostgreSQL. Todas las operaciones internas de cálculo se realizan en centavos enteros (`BigInt` / enteros) mediante `money.ts` para eliminar errores IEEE-754 de punto flotante.

### D. Idempotencia y Códigos de Error
* **Idempotency-Key:** Header obligatorio para depósitos y transferencias.
* **Misma clave + mismo payload:** Respuesta idempotente `200/201` con el recurso original y `replay: true` (sin doble abono ni doble débito).
* **Misma clave + distinto payload:** Rechazo inmediato con **HTTP 409 `IDEMPOTENCY_CONFLICT`** y 0 mutaciones.

---

## 2. Matriz de Códigos de Error Normalizados

Todos los errores retornan la estructura estándar:
```json
{
  "status": 422,
  "code": "USD_ACCOUNT_NOT_ENABLED",
  "message": "La cuenta destino no está habilitada para USD",
  "correlation_id": "c1f8a8...",
  "timestamp": "2026-11-03T20:00:00.000Z"
}
```

| HTTP Status | Código de Error | Significado de Dominio |
|---|---|---|
| **400** | `VALIDATION_ERROR` | Payload mal formado, moneda PEN rechazada o alias inválido. |
| **400** | `INVALID_AMOUNT` | Monto <= 0.00 o más de dos decimales. |
| **401** | `PIN_INCORRECTO` / `UNAUTHORIZED` | Credenciales o PIN demo incorrecto. |
| **404** | `NOT_FOUND` | Billetera, depósito o usuario no encontrado. |
| **409** | `IDEMPOTENCY_CONFLICT` | Misma clave de idempotencia enviada con datos contradictorios. |
| **422** | `CUSTOMER_BLOCKED` | Cliente bloqueado en MS Clientes. |
| **422** | `USD_ACCOUNT_NOT_ENABLED` | El cliente no tiene cuenta habilitada en dólares. |
| **422** | `SALDO_INSUFICIENTE` | Saldo menor al monto de débito o transferencia. |
| **503** | `BALANCE_SERVICE_UNAVAILABLE` | Falla transitoria en el abono (simulable en sandbox). |

