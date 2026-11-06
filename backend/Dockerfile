FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/tsconfig.json backend/vitest.config.ts ./
COPY backend/src ./src
COPY docs/openapi.yaml /app/docs/openapi.yaml
COPY specs/002-mcp-dolara/contracts /app/specs/002-mcp-dolara/contracts
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
