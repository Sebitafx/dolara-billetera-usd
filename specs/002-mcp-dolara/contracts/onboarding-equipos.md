# Guía de Onboarding: Sandbox MCP DOLARA (Billetera USD)

Bienvenido a la integración con el microservicio **DOLARA — Billetera Digital USD**.

Esta guía permite a los equipos de **Clientes, Saldos/Ledger, Depósitos PEN, Retiros y Gateway** conectar sus agentes de Inteligencia Artificial (Antigravity, Cursor, Claude Desktop, Roo Code, etc.) a nuestro **Servidor MCP Sandbox** para consultar contratos vivos, simular transacciones financieras y validar casos de error de forma autónoma sin dinero real.

---

## 1. Arquitectura de Integración

```
[Tu Agente de IA] 
       │ (JSON-RPC MCP stdio/SSE)
       ▼
[Servidor MCP DOLARA (Sidecar)] 
       │ (HTTP REST + Headers Canónicos)
       ▼
[API Sandbox DOLARA] ───► Local: http://localhost:3001
                     └───► AWS Sandbox: http://54.167.69.62
```

* **El Servidor MCP es un cliente HTTP de la API REST:** No accede directamente a bases de datos ni manipula saldos reales.
* **Moneda Estricta:** DOLARA opera exclusivamente en **USD**. Cualquier solicitud con moneda `PEN` es rechazada con HTTP 400 (`VALIDATION_ERROR`).
* **Idempotencia Garantizada:** Todo depósito requiere `Idempotency-Key` (formato UUID v4). Reintentar la misma clave no genera abonos múltiples.
* **Despliegue Sandbox Activo:** El microservicio ya se encuentra disponible públicamente en AWS en `http://54.167.69.62` con acceso web en `/acceso`.

---

## 2. Puesta en Marcha Rápida (1 Minuto)

### Opción A: Conectarse directamente al Sandbox de AWS (¡Sin instalar base de datos!)
Puedes ejecutar el servidor MCP apuntando directamente a la instancia desplegada en AWS:
```bash
cd backend
$env:SANDBOX_API_BASE_URL="http://54.167.69.62"
npm run mcp:stdio
```

### Opción B: Conectarse a tu entorno Local
Si prefieres correr el microservicio en tu máquina:
```bash
docker compose up -d db
cd backend
npm run dev
# En otra terminal:
npm run mcp:stdio
```

---

## 3. Configuración en tu Asistente de IA

Copia la configuración correspondiente desde [`mcp-config.example.json`](mcp-config.example.json):

### Para Antigravity / Cursor (Apuntando a AWS):
Agrega a tu configuración de MCP (`mcpServers`):
```json
{
  "mcpServers": {
    "dolara-billetera-usd-sandbox": {
      "command": "node",
      "args": [
        "<RUTA_ABSOLUTA>/ms-billetera-usd/backend/dist/mcp/index.js",
        "--transport",
        "stdio"
      ],
      "env": {
        "SANDBOX_API_BASE_URL": "http://54.167.69.62"
      }
    }
  }
}
```

---

## 4. Catálogo de Recursos y Herramientas

### 📚 Recursos Disponibles (`Resources`)

* `openapi://spec`: Especificación OpenAPI 3.0 viva en formato JSON.
* `contracts://gap-resuelto`: Documento formal con las reglas de negocio, precisión monetaria e idempotencia.
* `status://health`: Estado en tiempo real del servicio y sus adaptadores.

### 🛠️ Herramientas Disponibles (`Tools`)

| Herramienta | Parámetros Principales | Descripción |
|---|---|---|
| `depositos_crear_usd` | `cliente_id`, `monto`, `metodo_origen`, `idempotency_key` | Crea o reintenta un depósito auditado en USD (Key UUID v4). |
| `depositos_consultar` | `deposito_id` | Consulta la trazabilidad de un abono. |
| `billetera_crear_cuenta` | `user_id` (alias), `nombre` | Crea un usuario demo en sandbox con balance inicial $0.00. |
| `billetera_consultar_saldo` | `identificador` (UUID o alias) | Obtiene saldo actual en USD y metadata de billetera. |
| `billetera_transferir` | `origen_id`, `destino_id`, `monto` | Ejecuta transferencia P2P atómica e idempotente. |
| `fx_consultar_tasa` | `par` (default: `USD_PEN`) | Obtiene tasa de cambio referencial en tiempo real. |
| `sandbox_simular_escenario` | `escenario` | Simula fallos deliberados (`MONEDA_INVALIDA_PEN`, `CLIENTE_BLOQUEADO`, `USD_ACCOUNT_NOT_ENABLED`, `SALDO_INSUFICIENTE`, `IDEMPOTENCY_CONFLICT`). |
| `sandbox_reset_estado` | *(ninguno)* | Limpia los fixtures de prueba para reiniciar el sandbox. |

---

## 5. Ejemplos de Prompts para tu Agente de IA

Puedes pedirle directamente a tu agente de IA interactuar con DOLARA:

1. **Inspección de Contrato:**
   > *"Lee el recurso `openapi://spec` del MCP de DOLARA y muéstrame los headers obligatorios para hacer un depósito."*

2. **Prueba de Idempotencia en AWS Sandbox:**
   > *"Ejecuta la herramienta `depositos_crear_usd` con cliente 'cliente-activo', monto '50.00' y un UUID v4. Luego vuelve a ejecutarla con la misma clave y confírmame que el estado sea replay y no haya doble abono."*

3. **Verificación de Rechazo de PEN:**
   > *"Usa `sandbox_simular_escenario` con el escenario 'MONEDA_INVALIDA_PEN' y confirma que el microservicio responde con código 400 y mensaje 'billetera USD-only: moneda debe ser USD'."*

4. **Autogeneración de Cliente HTTP:**
   > *"Basándote en el recurso `openapi://spec` de DOLARA, genera una clase cliente en TypeScript/NestJS con Axios que incluya tipado estricto, generación de correlation ID y captura de error 422 `USD_ACCOUNT_NOT_ENABLED`."*
