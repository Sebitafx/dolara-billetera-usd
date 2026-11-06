import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const openApiPath = fileURLToPath(new URL('../../docs/openapi.yaml', import.meta.url));
export const openApiSource = readFileSync(openApiPath, 'utf8');
const openApiDocument = parse(openApiSource) as Record<string, unknown>;

export function getOpenApiSpec(): Record<string, unknown> {
  return openApiDocument;
}
