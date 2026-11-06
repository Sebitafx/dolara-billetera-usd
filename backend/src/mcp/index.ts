import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { SandboxHttpClient } from './client.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

export function createMcpServer(apiUrl?: string) {
  const server = new McpServer({
    name: 'dolara-billetera-usd-sandbox',
    version: '2.0.0',
  });

  const client = new SandboxHttpClient({ baseUrl: apiUrl });

  registerResources(server, client);
  registerTools(server, client);

  return { server, client };
}

async function run() {
  const args = process.argv.slice(2);
  const transportType = args.includes('--transport')
    ? args[args.indexOf('--transport') + 1]
    : process.env.MCP_TRANSPORT ?? 'stdio';

  const { server } = createMcpServer();

  if (transportType === 'http' || transportType === 'sse') {
    const port = Number(process.env.MCP_PORT ?? (args.includes('--port') ? args[args.indexOf('--port') + 1] : 3005));
    const app = express();
    let transport: SSEServerTransport | null = null;

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', mcp: 'dolara-billetera-usd-sandbox', transport: 'sse' });
    });

    app.get('/sse', async (_req, res) => {
      console.log('[MCP SSE] Nueva conexión de cliente iniciada');
      transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      if (!transport) {
        return res.status(400).json({ error: 'No active SSE connection found' });
      }
      await transport.handlePostMessage(req, res);
    });

    app.listen(port, () => {
      console.log(`[MCP Server] Servidor MCP en ejecución (Transporte SSE HTTP) en puerto :${port}`);
      console.log(`[MCP Server] Endpoint SSE: http://localhost:${port}/sse`);
    });
  } else {
    // Modo estándar stdio para Antigravity, Cursor, Claude Desktop y VS Code
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Notificar en stderr para no contaminar stdout del protocolo JSON-RPC
    console.error('[MCP Server] Servidor DOLARA Sandbox conectado mediante stdio');
  }
}

if (process.env.VITEST !== 'true' && !process.env.DO_NOT_RUN_MCP) {
  run().catch((err) => {
    console.error('[MCP Server Error]', err);
    process.exit(1);
  });
}

