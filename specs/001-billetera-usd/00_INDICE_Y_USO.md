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

6. **`06_ARQUITECTURA_Y_FLUJOS.md`**
   Mapa visual: contenedores, hexagonal, BD, 4 flujos de dinero, errores, pantallas SPA y trazabilidad RF→código→tests.

7. **`07_CASOS_DE_USO_Y_MODELO_DATOS.md`**
   Casos de usuario formales (BDD Gherkin), diagrama ERD completo con restricciones, diagramas de estados/secuencia y estándares de ingeniería (precisión monetaria, idempotencia RFC, seguridad).

8. **`spec.md` (v2), `plan.md`, `tasks.md`**
   QUÉ/POR QUÉ, CÓMO y desglose verificable DOLARA USD-only con changelog v1→v2.

> **Nota Plan A:** `SDD_COMPLETO_MICROSERVICIO_DEPOSITOS_USD.md` es histórico v1 congelado (no editar, no usar para implementar). Fuente vigente: `spec.md v2 + 06_ARQUITECTURA_Y_FLUJOS.md + 07_CASOS_DE_USO_Y_MODELO_DATOS.md`.

## Orden recomendado de lectura

```text
06 visual (5 min)
  ↓
07 Casos de Usuario y Modelo de Datos (ERD + Estándares)
  ↓
spec.md v2 (qué)
  ↓
02 Contratos
  ↓
plan.md + 01 SDD (cómo)
  ↓
04 Pruebas → 05 Integración
```

## Matriz Tecnológica: Stack, Por qué y Casos de Uso

| Tecnología | Rol en el Sistema | ¿Por qué se eligió? (Justificación / Trade-off) | ¿En qué casos se aplica? |
|---|---|---|---|
| **Node.js 24 LTS + TypeScript 5 (estricto)** | Runtime & Lenguaje | I/O asíncrono no bloqueante de alto rendimiento; soporte nativo de ESM; tipado estático riguroso que neutraliza errores de dominio financiero en tiempo de compilación. | Lógica de dominio pura (`MoneyUsd`, `Deposit`), casos de uso, interfaces de puertos y orquestación asíncrona. |
| **Express 4.21** | Framework Web HTTP | Arranque ultrarrápido (<100ms) y huella de memoria mínima (<40MB RAM). Descartado NestJS por sobrecarga de decoradores y acoplamiento; Express permite Arquitectura Hexagonal limpia. | Exposición de la API REST `/api/v1/*`, middlewares de correlación (`X-Correlation-Id`), captura centralizada de excepciones. |
| **PostgreSQL 16+ & Driver `pg`** | Base de Datos Relacional ACID | Soporte nativo de `NUMERIC(18,2)` para cálculo monetario exacto, restricciones CHECK a nivel de motor y transacciones pesimistas `SELECT ... FOR UPDATE`. El driver nativo `pg` permite control transaccional quirúrgico sin las abstracciones rígidas de un ORM. | Persistencia de billeteras (`wallets`), libro mayor inmutable (`billetera_movimientos`), depósitos auditados (`depositos_usd`). |
| **Zod 3.23** | Validación de Esquemas | Validación estricta en el borde (Fail-Fast en runtime) con tipado inferido estáticamente (`z.infer`). | Validación de montos positivos (≤2 decimales), alias de usuario, PIN numérico y rechazo inmediato de monedas no permitidas (`PEN` → 400). |
| **Aritmética Exacta (`money.ts`)** | Precisión Monetaria (Cero Floats) | Neutraliza los errores de redondeo del estándar IEEE-754 de punto flotante en JavaScript. Operaciones en centavos enteros (`BigInt` / enteros). | Todas las sumas, restas y comparaciones de saldos (`toCents`, `add`, `sub`, `gte`), redondeo half-up en conversiones FX. |
| **Vitest 2.1 & Supertest** | Testing Automatizado | Ejecución ultrarrápida con soporte ESM nativo sin transpiladores lentos tipo Babel o ts-jest. | Pruebas unitarias de dominio, pruebas de casos de uso con adaptadores en memoria, pruebas E2E contra PostgreSQL y pruebas de concurrencia e idempotencia. |
| **Angular 18+ (SPA DOLARA)** | Frontend Web Banca Móvil | Framework empresarial con Standalone Components, Signals para reactividad granular sin sobrecarga, inyección de dependencias limpia y Guards de enrutamiento. | Interfaz de usuario responsive (móvil y escritorio) para acceso demo, consulta de saldo, recargas con voucher, transferencias con buscador de alias e historial. |
| **Nginx & Docker Compose** | Infraestructura y Red | Nginx sirve assets estáticos con latencia mínima y actúa como reverse proxy a la API (`/api`). Docker Compose garantiza reproducibilidad en la red compartida `wallet-network`. | Despliegue local y en CI/CD con un comando, comunicación entre contenedores sin exponer puertos innecesarios al host. |
| **OpenAPI 3.x / Swagger UI** | Documentación de Contratos | Estándar de la industria para exponer contratos vivos en `/docs`. | Permite a otros equipos (Clientes, Saldos, Gateway) probar e integrar endpoints sin depender de colecciones manuales. |
| **RabbitMQ + Transactional Outbox** | Mensajería Asíncrona (Reservado) | Desacopla eventos evitando la pérdida de mensajes (el evento se persiste en la BD en la misma transacción que el depósito). | Publicación asíncrona de eventos `deposit.usd.completed.v1` hacia servicios de notificaciones, analítica y contabilidad. |

> Detalle exhaustivo, diagramas de arquitectura y justificaciones de diseño en [07_CASOS_DE_USO_Y_MODELO_DATOS.md](file:///d:/BilleteraDigital_Dolar/specs/001-billetera-usd/07_CASOS_DE_USO_Y_MODELO_DATOS.md).

La decisión más importante para facilitar el trabajo de toda la clase es mantener **Clientes/Cuentas** y **Saldos/Ledger** detrás de puertos/adaptadores. De esta forma el microservicio puede desarrollarse ahora con mocks y conectarse después a los endpoints definitivos de los otros equipos.
