import http from 'k6/http';
import { check, sleep } from 'k6';

// Permite apuntar a AWS o a localhost mediante variable de entorno:
// -e TARGET_URL="http://54.167.69.62"
const BASE_URL = __ENV.TARGET_URL || 'http://54.167.69.62';

export const options = {
  vus: 3,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // Menos del 1% de fallos
    http_req_duration: ['p(95)<800'], // 95% de peticiones debajo de 800ms
  },
};

// Generador de UUID v4 compatible con k6
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function () {
  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health/ready`);
  check(healthRes, {
    'health status es 200': (r) => r.status === 200,
    'health reporta db up': (r) => {
      try {
        return JSON.parse(r.body).db === 'up';
      } catch {
        return false;
      }
    },
  });

  // 2. Tasa de cambio FX
  const fxRes = http.get(`${BASE_URL}/api/v1/fx/tasa?par=USD_PEN`);
  check(fxRes, {
    'fx status es 200': (r) => r.status === 200,
    'fx retorna USD_PEN': (r) => {
      try {
        return JSON.parse(r.body).par === 'USD_PEN';
      } catch {
        return false;
      }
    },
  });

  // 3. Crear Depósito USD
  const idempotencyKey = uuidv4();
  const payload = JSON.stringify({
    cliente_id: 'cliente-activo',
    monto: '25.00',
    metodo_origen: 'TRANSFERENCIA',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
  };

  const depRes = http.post(`${BASE_URL}/api/v1/depositos/usd`, payload, params);
  check(depRes, {
    'depósito status es 201': (r) => r.status === 201,
    'depósito estado COMPLETADO': (r) => {
      try {
        return JSON.parse(r.body).estado === 'COMPLETADO';
      } catch {
        return false;
      }
    },
    'moneda es USD': (r) => {
      try {
        return JSON.parse(r.body).moneda === 'USD';
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

