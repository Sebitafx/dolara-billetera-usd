import { getOpenApiSpec } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, '../../specs/002-mcp-dolara/contracts');
const targetFile = path.join(targetDir, 'openapi-canonica-usd.json');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const spec = getOpenApiSpec();
fs.writeFileSync(targetFile, JSON.stringify(spec, null, 2), 'utf-8');
console.log(`[OK] OpenAPI canónico exportado a ${targetFile}`);

