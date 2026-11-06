import { randomUUID } from 'crypto';

export interface SandboxClientConfig {
  baseUrl?: string;
  defaultTimeoutMs?: number;
}

export class SandboxHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: SandboxClientConfig) {
    this.baseUrl = (config?.baseUrl ?? process.env.SANDBOX_API_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
    this.timeoutMs = config?.defaultTimeoutMs ?? 5000;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<{ status: number; data: T }> {
    const correlationId = randomUUID();
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('X-Correlation-Id')) {
      headers.set('X-Correlation-Id', correlationId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const text = await response.text();
      let data: T;
      try {
        data = text ? (JSON.parse(text) as T) : ({} as T);
      } catch {
        data = text as unknown as T;
      }

      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  // --- API Métodos ---

  async getHealth() {
    return this.request<{ status: string; db: string; fakes: boolean }>('/health/ready', { method: 'GET' });
  }

  async getOpenApiSpec() {
    return this.request<Record<string, unknown>>('/docs.json', { method: 'GET' });
  }

  async crearDeposito(
    payload: {
      cliente_id: string;
      cuenta_destino_id?: string;
      monto: string;
      metodo_origen: string;
      referencia_externa?: string;
      moneda?: string;
    },
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? randomUUID();
    return this.request<Record<string, unknown>>('/api/v1/depositos/usd', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    });
  }

  async consultarDeposito(id: string) {
    return this.request<Record<string, unknown>>(`/api/v1/depositos/usd/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async crearBilletera(payload: { user_id: string; nombre?: string }) {
    return this.request<Record<string, unknown>>('/api/v1/billetera/wallets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async consultarSaldo(identificador: string) {
    // Si parece UUID va a /wallets/:id, sino a /wallets/by-user/:userId
    const esUuid = /^[0-9a-f-]{36}$/i.test(identificador);
    const path = esUuid
      ? `/api/v1/billetera/wallets/${encodeURIComponent(identificador)}`
      : `/api/v1/billetera/wallets/by-user/${encodeURIComponent(identificador)}`;
    return this.request<Record<string, unknown>>(path, { method: 'GET' });
  }

  async transferir(
    payload: { origen_id: string; destino_id: string; monto: string },
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? randomUUID();
    return this.request<Record<string, unknown>>('/api/v1/billetera/transferencias', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    });
  }

  async consultarTasaFx(par: string = 'USD_PEN') {
    return this.request<{ par: string; tasa: string; timestamp: string; stale: boolean }>(
      `/api/v1/fx/tasa?par=${encodeURIComponent(par)}`,
      { method: 'GET' },
    );
  }

  async convertirFx(payload: { monto: string; de: string; a: string }) {
    return this.request<Record<string, unknown>>('/api/v1/fx/convertir', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async resetSandbox() {
    return this.request<{ status: string; message: string; timestamp: string }>('/api/v1/sandbox/reset', {
      method: 'POST',
    });
  }

  async getScenarios() {
    return this.request<{ active: boolean; scenarios: Array<{ code: string; description: string; trigger: string; expected_status: number }> }>(
      '/api/v1/sandbox/scenarios',
      { method: 'GET' },
    );
  }
}

