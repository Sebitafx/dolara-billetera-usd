# Documentación técnica — DOLARA Billetera USD-only (v2)

Esta carpeta contiene la especificación de **DOLARA — billetera 100% en dólares** (evolución del microservicio Depósitos USD).

## Archivos

1. **`01_SDD_MICROSERVICIO_DEPOSITOS_USD.md`**
   Documento principal. Define alcance, arquitectura, dominio, persistencia, flujo, idempotencia, seguridad, observabilidad y decisiones técnicas.

2. **`02_CONTRATOS_API_E_INTEGRACION.md`**
   Contratos que deben acordarse con Frontend/Gateway, Clientes/Cuentas y Saldos/Ledger.

3. **`03_PLAN_IMPLEMENTACION_PASO_A_PASO.md`**
   Orden de construcción desde cero hasta la integración conjunta.

4. **`04_PRUEBAS_Y_CRITERIOS_DE_ACEPTACION.md`**
   Estrategia de pruebas unitarias, integración, contratos, E2E e idempotencia.

5. **`05_INTEGRACION_DESPLIEGUE_Y_OPERACION.md`**
   Docker, red compartida, Gateway, CI/CD, integración con PEN/Retiros y operación.

6. **`06_ARQUITECTURA_Y_FLUJOS.md`** ← empieza aquí si tienes 5 min
   Mapa visual: contenedores, hexagonal, BD, 4 flujos de dinero, errores, pantallas SPA y trazabilidad RF→código→tests.

7. **`spec.md` (v2), `plan.md`, `tasks.md`**
   QUÉ/POR QUÉ, CÓMO y desglose verificable DOLARA USD-only con changelog v1→v2.

> **Nota Plan A:** `SDD_COMPLETO_MICROSERVICIO_DEPOSITOS_USD.md` es histórico v1 congelado (no editar, no usar para implementar). Fuente vigente: `spec.md v2 + 06_ARQUITECTURA_Y_FLUJOS.md`.

## Orden recomendado de lectura

```text
06 visual (5 min)
  ↓
spec.md v2 (qué)
  ↓
02 Contratos
  ↓
plan.md + 01 SDD (cómo)
  ↓
04 Pruebas → 05 Integración
```

## Decisión tecnológica principal

```text
Node.js 24 LTS
TypeScript estricto
Express (equipo descartó NestJS, plan.md §8)
PostgreSQL 16
REST + OpenAPI (/docs)
Docker Compose
RabbitMQ opcional mediante Transactional Outbox (reservado)
Angular 18 SPA DOLARA
```

La decisión más importante para facilitar el trabajo de toda la clase es mantener **Clientes/Cuentas** y **Saldos/Ledger** detrás de puertos/adaptadores. De esta forma el microservicio puede desarrollarse ahora con mocks y conectarse después a los endpoints definitivos de los otros equipos.
