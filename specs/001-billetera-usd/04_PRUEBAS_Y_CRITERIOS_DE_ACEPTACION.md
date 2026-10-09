# Estrategia de Pruebas y Criterios de Aceptación
## Microservicio de Depósitos USD

---

## 1. Objetivo

Demostrar que el servicio procesa depósitos USD correctamente, no duplica dinero y se comporta de manera controlada cuando fallan otros microservicios.

---

## 2. Pirámide de pruebas

```text
              E2E conjunto
           Contract / E2E API
        Integración PostgreSQL/HTTP
      Unitarias casos de uso
   Unitarias dominio / value objects
```

---

## 3. Pruebas unitarias de dominio

| ID | Escenario | Resultado esperado |
|---|---|---|
| UT-01 | Crear MoneyUsd con 100.00 | válido |
| UT-02 | Crear MoneyUsd con 0 | rechazo |
| UT-03 | Crear MoneyUsd con -1 | rechazo |
| UT-04 | Intentar moneda PEN | rechazo |
| UT-05 | PENDIENTE → VALIDADO | permitido |
| UT-06 | VALIDADO → COMPLETADO | permitido |
| UT-07 | COMPLETADO → PENDIENTE | rechazo |

---

## 4. Pruebas unitarias del caso de uso

Usar mocks de los puertos.

### UC-01 Depósito correcto

**Given** cliente y cuenta USD válidos.  
**And** BalancePort confirma crédito.  
**When** se solicita depósito de 150.50 USD.  
**Then** se guarda `COMPLETADO` y se retorna éxito.

### UC-02 Cliente inexistente

No debe crear crédito ni operación completada.

### UC-03 Cuenta solo PEN

Debe rechazar la operación antes de solicitar el crédito.

### UC-04 Servicio de saldo falla

Debe quedar `FALLIDO`; nunca `COMPLETADO`.

### UC-05 Idempotencia

Dos invocaciones con misma clave deben producir un único depósito.

### UC-06 Conflicto de idempotencia

Misma clave + distinto monto → `IDEMPOTENCY_CONFLICT`.

---

## 5. Integración con PostgreSQL

Validar:

- migraciones;
- restricciones;
- índices;
- unicidad de idempotencia;
- transacciones;
- escritura y lectura;
- rollback ante error local.

Caso de concurrencia:

Lanzar dos requests simultáneos con la misma `Idempotency-Key`; la base debe impedir dos filas.

---

## 6. Integración HTTP contra mocks

Mock Clientes:

- `200 ACTIVE USD`.
- `404`.
- `200 BLOCKED`.
- `500`.
- timeout > 3 s.

Mock Saldos:

- `200 APPLIED`.
- `409 referencia ya aplicada`, tratado idempotentemente.
- `500`.
- timeout.

---

## 7. Contract testing

Cada equipo debe verificar que los contratos reales conservan:

### Clientes

- estado del cliente;
- estado de cuenta;
- monedas habilitadas;
- códigos de error acordados.

### Saldos

- movimiento `CREDIT`;
- moneda;
- monto decimal;
- referencia idempotente;
- movimiento resultante.

Si el proveedor cambia nombres de campos, el adaptador puede traducirlos; si cambia la semántica, debe versionarse el contrato.

---

## 8. E2E del microservicio

Levantar:

- Depósitos USD.
- PostgreSQL.
- Mock Clientes.
- Mock Saldos.

Probar endpoints desde HTTP real.

### E2E-01

```text
POST válido -> 201 -> GET devuelve COMPLETADO
```

### E2E-02

```text
POST repetido -> no incrementa número de transacciones
```

### E2E-03

```text
Saldos timeout -> 503 + estado FALLIDO
```

---

## 9. E2E conjunto con la clase

Escenario mínimo de integración:

1. Crear/usar cliente activo.
2. Asegurar cuenta USD activa.
3. Consultar saldo inicial.
4. Depositar USD 100.00.
5. Obtener `deposito_id`.
6. Consultar saldo final.
7. Verificar incremento exactamente 100.00.
8. Repetir el mismo request con la misma Idempotency-Key.
9. Verificar que el saldo no vuelve a incrementarse.

---

## 10. Pruebas negativas obligatorias

- monto `0`;
- monto negativo;
- monto con más decimales de los permitidos;
- cliente inexistente;
- cliente bloqueado;
- cuenta inexistente;
- cuenta PEN;
- JSON incompleto;
- token inválido;
- Idempotency-Key faltante;
- Idempotency-Key conflictiva;
- Clientes no disponible;
- Saldos no disponible;
- PostgreSQL no disponible;
- request duplicado concurrente.

---

## 11. Criterios de aceptación

### CA-01

**Dado** un cliente activo con cuenta USD activa  
**Cuando** deposita 50.00 USD  
**Entonces** la operación finaliza `COMPLETADO` y el saldo se acredita una sola vez.

### CA-02

**Dado** un cliente con cuenta solo PEN  
**Cuando** intenta usar Depósitos USD  
**Entonces** el servicio rechaza la operación y no llama al servicio de saldos.

### CA-03

**Dado** un depósito ya procesado  
**Cuando** se repite la petición con la misma clave  
**Entonces** se devuelve el resultado original y no se crea un nuevo movimiento.

### CA-04

**Dado** que Saldos no responde  
**Cuando** se procesa un depósito  
**Entonces** no debe declararse `COMPLETADO`.

### CA-05

**Dado** un depósito completado  
**Cuando** otro servicio consulta su información  
**Entonces** debe hacerlo por API, no por conexión directa a la BD.

---

## 12. Quality Gate sugerido

Antes de integrar:

- Lint: 0 errores.
- Build: exitoso.
- Unit tests: 100 % verdes.
- Integration tests: 100 % verdes.
- Contract tests: verdes.
- Flujo E2E crítico: verde.
- Sin secretos en Git.
- Swagger actualizado.
- Docker build exitoso.

No se requiere perseguir un porcentaje de cobertura arbitrario; priorizar cobertura de reglas monetarias, estados, idempotencia y errores.

