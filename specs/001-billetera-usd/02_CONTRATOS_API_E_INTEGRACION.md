# Contratos API e Integración
## Microservicio de Depósitos USD

Este documento contiene los contratos que deben compartir los equipos antes de la integración final.

---

## 1. Convenciones generales

- Base path: `/api/v1`
- Formato: `application/json`
- Fechas: ISO-8601 en UTC.
- IDs: UUID cuando el sistema global lo permita.
- Moneda: ISO 4217, siempre `USD` en este microservicio.
- Dinero en contratos: cadena decimal con dos posiciones, por ejemplo `"150.50"`.
- Autenticación: `Authorization: Bearer <JWT>` cuando corresponda.
- Correlación: `X-Correlation-Id` opcional; si no llega, el servicio lo genera.
- Idempotencia: `Idempotency-Key` obligatorio para crear depósitos.

---

## 2. Crear depósito

### `POST /api/v1/depositos/usd`

### Headers

```http
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 8efb09d4-2cd1-4b85-ae67-741248833303
X-Correlation-Id: 321eb9db-aeba-492a-a069-bff43b4fdd74
```

### Request

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_destino_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "metodo_origen": "TRANSFERENCIA",
  "referencia_externa": "TRX-EXT-000123"
}
```

### Validaciones

- `cliente_id`: obligatorio.
- `cuenta_destino_id`: obligatorio si el dominio global distingue cuentas.
- `monto`: decimal > `0.00`, máximo dos decimales.
- `metodo_origen`: valor permitido.
- La moneda no viene del cliente o, si se decide incluirla, debe ser exactamente `USD`.
- `Idempotency-Key`: obligatorio y no vacío.

### `201 Created`

```json
{
  "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_destino_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "moneda": "USD",
  "estado": "COMPLETADO",
  "movimiento_saldo_id": "MOV-389011",
  "creado_en": "2026-10-06T19:55:00.000Z",
  "completado_en": "2026-10-06T19:55:00.340Z"
}
```

### Idempotencia repetida

Si la misma clave ya fue procesada con el mismo contenido, se devuelve el recurso ya existente, sin efectuar un segundo abono.

### Errores normalizados

```json
{
  "status": 422,
  "code": "USD_ACCOUNT_NOT_ENABLED",
  "message": "La cuenta destino no está habilitada para USD",
  "correlation_id": "321eb9db-aeba-492a-a069-bff43b4fdd74",
  "timestamp": "2026-10-06T19:55:00.100Z"
}
```

| HTTP | `code` | Significado |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido. |
| 400 | `INVALID_AMOUNT` | Monto cero, negativo o formato inválido. |
| 401 | `UNAUTHORIZED` | Token ausente/inválido. |
| 404 | `CUSTOMER_NOT_FOUND` | Cliente no existe. |
| 404 | `ACCOUNT_NOT_FOUND` | Cuenta destino no existe. |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma clave con datos diferentes. |
| 422 | `CUSTOMER_BLOCKED` | Cliente no puede operar. |
| 422 | `USD_ACCOUNT_NOT_ENABLED` | Cuenta no admite USD. |
| 503 | `CUSTOMER_SERVICE_UNAVAILABLE` | No se pudo validar cliente/cuenta. |
| 503 | `BALANCE_SERVICE_UNAVAILABLE` | No se pudo confirmar el abono. |
| 500 | `INTERNAL_ERROR` | Error no controlado. |

---

## 3. Consultar depósito

### `GET /api/v1/depositos/usd/{depositoId}`

`200 OK` devuelve el mismo modelo de respuesta del depósito.

`404 Not Found` si el ID no existe.

---

## 4. Historial de depósitos

### `GET /api/v1/depositos/usd?cliente_id={uuid}&page=1&limit=20`

### Respuesta

```json
{
  "items": [
    {
      "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
      "monto": "150.50",
      "moneda": "USD",
      "estado": "COMPLETADO",
      "creado_en": "2026-10-06T19:55:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

## 5. Contrato requerido al equipo Clientes / Cuentas

### Opción recomendada

`GET /api/v1/clientes/{clienteId}/cuentas/{accountId}/validacion-deposito?moneda=USD`

### Respuesta esperada

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cliente_existe": true,
  "cliente_estado": "ACTIVE",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "cuenta_estado": "ACTIVE",
  "monedas_habilitadas": ["USD"]
}
```

### Regla

Depósitos USD solo continúa si:

```text
cliente_existe == true
AND cliente_estado == ACTIVE
AND cuenta_estado == ACTIVE
AND USD ∈ monedas_habilitadas
```

### Si el equipo Clientes ya tiene otro endpoint

No es necesario obligarlo a copiar exactamente esta URL. El equipo de Depósitos USD implementará un `CustomerAccountHttpAdapter` que convierta el contrato real al modelo interno anterior.

Lo importante es acordar semántica y campos, no acoplar el dominio a la URL.

---

## 6. Contrato requerido al dueño del saldo

### Opción recomendada

`POST /api/v1/saldos/movimientos`

### Request emitido por Depósitos USD

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "tipo": "CREDIT",
  "monto": "150.50",
  "moneda": "USD",
  "referencia_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "referencia_tipo": "DEPOSITO_USD"
}
```

### Respuesta esperada

```json
{
  "movimiento_id": "MOV-389011",
  "estado": "APPLIED",
  "referencia_id": "68253825-30a4-4db2-8266-00cf37f1dd0c"
}
```

### Condición crítica

`referencia_id` debe ser única en el servicio de saldos. Si el request se repite, Saldos debe devolver el mismo movimiento y no acreditar nuevamente.

---

## 7. Si no existe MS Saldos

Si el equipo decidió que Clientes administra también el saldo:

- Se conserva `BalancePort`.
- `BalanceHttpAdapter` apunta al endpoint del equipo Clientes.
- No se modifica el caso de uso ni el controlador.

Ejemplo de URL alternativa:

```text
POST /api/v1/clientes/{clienteId}/cuentas/{accountId}/movimientos
```

---

## 8. Eventos opcionales

### Evento completado

Routing key sugerida:

```text
deposit.usd.completed.v1
```

Payload:

```json
{
  "event_id": "90d24be0-2258-4091-9945-a9bd92817159",
  "event_type": "deposit.usd.completed.v1",
  "occurred_at": "2026-10-06T19:55:00.340Z",
  "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "moneda": "USD"
}
```

Posibles consumidores: notificaciones, auditoría, reportes o analítica.

---

## 9. Compatibilidad con API Gateway

Ruta externa sugerida:

```text
/api/v1/depositos/usd/**  ->  ms-depositos-usd:3001
```

El Gateway puede encargarse de:

- autenticación JWT;
- rate limiting;
- CORS;
- logging de entrada;
- enrutamiento;
- propagación de `X-Correlation-Id`.

El Gateway no debe implementar reglas monetarias del depósito.

---

## 10. Contrato de integración que todos deben acordar

Antes del merge final, cada equipo debe entregar:

1. Nombre DNS/container de su servicio.
2. Puerto interno.
3. Base path de API.
4. Swagger/OpenAPI.
5. Códigos de error.
6. Formato de IDs.
7. Estados válidos.
8. Política de autenticación interna.
9. Timeout esperado.
10. Health endpoint.
11. Responsabilidad exacta sobre saldo/cuenta.
12. Estrategia de idempotencia.

