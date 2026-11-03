import 'dotenv/config';
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { migrate } from './db.js';
import { correlation, errorHandler } from './errors.js';
import { deposits } from './routes/deposits.js';
import { billetera } from './routes/billetera.js';
import { health } from './routes/health.js';
import { fx } from './routes/fx.js';
import { sandbox } from './routes/sandbox.js';

export function getOpenApiSpec() {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'DOLARA — Billetera en Dólares API (USD-only)',
        version: '2.0.0',
        description:
          'API canónica del microservicio Billetera USD y Depósitos USD. Incluye endpoints de operación financiera, consulta FX y Sandbox de integración para agentes de IA.',
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Entorno de Desarrollo / Sandbox Local',
        },
      ],
    },
    apis: ['./src/routes/*.ts', './dist/routes/*.js'],
  });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(correlation);

  app.use('/health', health);
  app.use('/api/v1/depositos/usd', deposits);
  app.use('/api/v1/billetera', billetera);
  app.use('/api/v1/fx', fx);
  app.use('/api/v1/sandbox', sandbox);

  const spec = getOpenApiSpec();
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/docs.json', (_req, res) => res.json(spec));
  app.get('/openapi.json', (_req, res) => res.json(spec));

  app.use(errorHandler);
  return app;
}

const PORT = Number(process.env.PORT ?? 3001);

if (process.env.VITEST !== 'true') {
  await migrate();
  const app = createApp();
  app.listen(PORT, () =>
    console.log(`DOLARA billetera-usd en :${PORT} (fakes=${process.env.USE_FAKES ?? 'true'})`)
  );
}
