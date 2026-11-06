import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SandboxHttpClient } from './client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerResources(server: McpServer, client: SandboxHttpClient) {
  // Recurso 1: Especificación OpenAPI 3.0 Canónica en JSON
  server.resource(
    'openapi-spec',
    'openapi://spec',
    { mimeType: 'application/json', description: 'Especificación canónica OpenAPI 3.0 viva de Billetera USD (DOLARA)' },
    async (uri) => {
      try {
        const { data, status } = await client.getOpenApiSpec();
        if (status === 200 && data) {
          return {
            contents: [
              {
                uri: uri.href,
                text: JSON.stringify(data, null, 2),
                mimeType: 'application/json',
              },
            ],
          };
        }
      } catch {
        // Fallback a archivo exportado
      }

      const filePath = path.resolve(__dirname, '../../../specs/002-mcp-dolara/contracts/openapi-canonica-usd.json');
      const content = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf-8')
        : JSON.stringify({ error: 'OpenAPI spec file not found' });

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
            mimeType: 'application/json',
          },
        ],
      };
    },
  );

  // Recurso 2: Gap Analysis Resuelto y Reglas de Dominio USD
  server.resource(
    'gap-resuelto',
    'contracts://gap-resuelto',
    { mimeType: 'text/markdown', description: 'Cierre de brechas: Moneda USD vs PEN, Idempotencia y Manejo de Errores' },
    async (uri) => {
      const filePath = path.resolve(__dirname, '../../../specs/002-mcp-dolara/contracts/gap-resuelto.md');
      const content = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf-8')
        : '# Gap Resuelto\nInformación de contratos canónicos USD.';

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
            mimeType: 'text/markdown',
          },
        ],
      };
    },
  );

  // Recurso 3: Estado de Salud y Fakes del Microservicio
  server.resource(
    'service-health',
    'status://health',
    { mimeType: 'application/json', description: 'Estado en tiempo real de la base de datos y adaptadores fake del Sandbox' },
    async (uri) => {
      let healthData: Record<string, unknown>;
      try {
        const res = await client.getHealth();
        healthData = { http_status: res.status, ...res.data };
      } catch (err) {
        healthData = { error: 'No se pudo conectar a la API Sandbox', detail: String(err) };
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(healthData, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );
}

