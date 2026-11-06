import 'dotenv/config';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { migrate } from './db.js';
import { correlation, errorHandler, notFound } from './errors.js';
import { deposits } from './routes/deposits.js';
import { billetera } from './routes/billetera.js';
import { health } from './routes/health.js';
import { fx } from './routes/fx.js';
import { sandbox } from './routes/sandbox.js';
import { getOpenApiSpec, openApiSource } from './openapi.js';

export { getOpenApiSpec } from './openapi.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlation);
  app.use(express.json({ limit: '256kb' }));

  app.use('/health', health);
  app.use('/api/v1/depositos/usd', deposits);
  app.use('/api/v1/billetera', billetera);
  app.use('/api/v1/fx', fx);
  app.use('/api/v1/sandbox', sandbox);

  const spec = getOpenApiSpec();
  app.get('/docs.json', (_req, res) => res.json(spec));
  app.get('/openapi.yaml', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="billetera-digital-usd-openapi.yaml"');
    res.type('application/yaml').send(openApiSource);
  });
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Billetera Digital USD · API' }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const PORT = Number(process.env.PORT ?? 3001);

if (process.env.VITEST !== 'true') {
  await migrate();
  const app = createApp();
  app.listen(PORT, () => console.log(`Billetera Digital USD API en :${PORT} (fakes=${process.env.USE_FAKES ?? 'true'})`));
}
