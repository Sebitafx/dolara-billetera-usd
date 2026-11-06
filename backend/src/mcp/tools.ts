import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SandboxHttpClient } from './client.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

export function registerTools(server: McpServer, client: SandboxHttpClient) {
  // Tool 1: Crear depósito USD
  server.tool(
    'depositos_crear_usd',
    'Crea un depósito auditado en dólares (USD-only) contra el microservicio. Admite Idempotency-Key obligatoria para evitar abonos duplicados.',
    {
      cliente_id: z.string().describe('ID o alias del cliente destinatario (ej. "cliente-activo", "demo-01" o "sandbox-user")'),
      monto: z.string().regex(/^\d+\.\d{2}$/, 'Formato monetario debe ser decimal con 2 posiciones, ej: "150.50"').describe('Monto a depositar en dólares (USD)'),
      metodo_origen: z.enum(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA', 'OTRO']).default('TRANSFERENCIA').describe('Método de abono'),
      cuenta_destino_id: z.string().optional().describe('ID de cuenta externa si aplica'),
      referencia_externa: z.string().optional().describe('Número de comprobante externo o voucher'),
      idempotency_key: z.string().optional().describe('Clave de idempotencia única. Si se omite, se genera un UUID v4 automático'),
    },
    async ({ cliente_id, monto, metodo_origen, cuenta_destino_id, referencia_externa, idempotency_key }) => {
      const key = idempotency_key || randomUUID();
      const res = await client.crearDeposito(
        {
          cliente_id,
          monto,
          metodo_origen,
          cuenta_destino_id,
          referencia_externa: referencia_externa ?? `SANDBOX-REF-${Date.now()}`,
          moneda: 'USD',
        },
        key,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                http_status: res.status,
                idempotency_key_used: key,
                response: res.data,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Tool 2: Consultar depósito por ID
  server.tool(
    'depositos_consultar',
    'Consulta la trazabilidad y estado de un depósito previamente procesado.',
    {
      deposito_id: z.string().uuid().describe('UUID del depósito a consultar'),
    },
    async ({ deposito_id }) => {
      const res = await client.consultarDeposito(deposito_id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, response: res.data }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 3: Crear billetera de pruebas en Sandbox
  server.tool(
    'billetera_crear_cuenta',
    'Crea una billetera USD en el entorno Sandbox para un usuario o alias de prueba.',
    {
      user_id: z.string().min(3).max(50).describe('Alias único para el usuario demo (ej. "sandbox-alice")'),
      nombre: z.string().optional().describe('Nombre descriptivo del usuario'),
    },
    async ({ user_id, nombre }) => {
      const res = await client.crearBilletera({ user_id, nombre });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, response: res.data }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 4: Consultar saldo en USD
  server.tool(
    'billetera_consultar_saldo',
    'Consulta el balance disponible en USD y estado de una billetera por UUID o alias de usuario.',
    {
      identificador: z.string().describe('UUID de la billetera o alias de usuario (ej. "demo-01", "sandbox-alice")'),
    },
    async ({ identificador }) => {
      const res = await client.consultarSaldo(identificador);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, response: res.data }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 5: Transferir dólares entre billeteras
  server.tool(
    'billetera_transferir',
    'Ejecuta una transferencia atómica P2P en dólares entre dos billeteras (por alias o UUID). Maneja idempotencia para evitar transferencias dobles.',
    {
      origen_id: z.string().describe('Alias o UUID de la billetera de origen con fondos suficientes'),
      destino_id: z.string().describe('Alias o UUID de la billetera de destino'),
      monto: z.string().regex(/^\d+\.\d{2}$/, 'Formato debe ser decimal con 2 decimales, ej: "25.00"').describe('Monto a transferir en USD'),
      idempotency_key: z.string().optional().describe('Clave de idempotencia única opcional'),
    },
    async ({ origen_id, destino_id, monto, idempotency_key }) => {
      const key = idempotency_key || randomUUID();
      const res = await client.transferir({ origen_id, destino_id, monto }, key);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, idempotency_key_used: key, response: res.data }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 6: Consultar tasa de cambio FX
  server.tool(
    'fx_consultar_tasa',
    'Consulta la tasa de cambio vigente USD/PEN provista como valor referencial.',
    {
      par: z.string().default('USD_PEN').describe('Par de divisas (actualmente USD_PEN)'),
    },
    async ({ par }) => {
      const res = await client.consultarTasaFx(par);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, response: res.data }, null, 2),
          },
        ],
      };
    },
  );

  // Tool 7: Simular escenarios de prueba y error de integración
  server.tool(
    'sandbox_simular_escenario',
    'Simula deliberadamente escenarios de error y de borde para verificar la robustez del manejo de errores en el microservicio consumidor.',
    {
      escenario: z.enum([
        'MONEDA_INVALIDA_PEN',
        'CLIENTE_BLOQUEADO',
        'USD_ACCOUNT_NOT_ENABLED',
        'SALDO_INSUFICIENTE',
        'IDEMPOTENCY_CONFLICT',
      ]).describe('Escenario de prueba a ejecutar'),
    },
    async ({ escenario }) => {
      let resultado: Record<string, unknown> = {};

      switch (escenario) {
        case 'MONEDA_INVALIDA_PEN': {
          // Intento deliberado de enviar PEN a un servicio USD-only
          const res = await client.crearDeposito({
            cliente_id: 'cliente-activo',
            monto: '50.00',
            metodo_origen: 'TRANSFERENCIA',
            moneda: 'PEN',
          });
          resultado = {
            descripcion: 'Verificación de rechazo estricto de moneda PEN (billetera USD-only)',
            esperado: 400,
            obtenido_status: res.status,
            correcto: res.status === 400,
            detalle: res.data,
          };
          break;
        }

        case 'CLIENTE_BLOQUEADO': {
          const res = await client.crearDeposito({
            cliente_id: 'cliente-bloqueado',
            monto: '100.00',
            metodo_origen: 'TRANSFERENCIA',
          });
          resultado = {
            descripcion: 'Verificación de rechazo por cliente bloqueado en MS Clientes',
            esperado: 422,
            obtenido_status: res.status,
            correcto: res.status === 422,
            detalle: res.data,
          };
          break;
        }

        case 'USD_ACCOUNT_NOT_ENABLED': {
          const res = await client.crearDeposito({
            cliente_id: 'cliente-pen',
            monto: '100.00',
            metodo_origen: 'TRANSFERENCIA',
          });
          resultado = {
            descripcion: 'Verificación de rechazo por cliente sin cuenta habilitada en dólares',
            esperado: 422,
            obtenido_status: res.status,
            correcto: res.status === 422,
            detalle: res.data,
          };
          break;
        }

        case 'SALDO_INSUFICIENTE': {
          // Intentar transferir desde una cuenta que no tiene tanto saldo
          const res = await client.transferir({
            origen_id: 'demo-01',
            destino_id: 'cliente-activo',
            monto: '9999999.00',
          });
          resultado = {
            descripcion: 'Verificación de rechazo atómico por saldo insuficiente',
            esperado: 422,
            obtenido_status: res.status,
            correcto: res.status === 422,
            detalle: res.data,
          };
          break;
        }

        case 'IDEMPOTENCY_CONFLICT': {
          const key = randomUUID();
          // Primera llamada con $10.00
          await client.crearDeposito(
            { cliente_id: 'cliente-activo', monto: '10.00', metodo_origen: 'TRANSFERENCIA' },
            key,
          );
          // Segunda llamada con misma key pero $20.00
          const res = await client.crearDeposito(
            { cliente_id: 'cliente-activo', monto: '20.00', metodo_origen: 'TRANSFERENCIA' },
            key,
          );
          resultado = {
            descripcion: 'Verificación de conflicto 409 al reusar misma clave con payload alterado',
            esperado: 409,
            obtenido_status: res.status,
            correcto: res.status === 409,
            detalle: res.data,
          };
          break;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultado, null, 2),
          },
        ],
      };
    },
  );

  // Tool 8: Limpiar datos del Sandbox
  server.tool(
    'sandbox_reset_estado',
    'Limpia registros de prueba con prefijo sandbox- o test- cuando SANDBOX_MODE está habilitado fuera de producción.',
    {},
    async () => {
      const res = await client.resetSandbox();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ http_status: res.status, response: res.data }, null, 2),
          },
        ],
      };
    },
  );
}
