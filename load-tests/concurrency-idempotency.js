import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://54.167.69.62';

export const options = {
  scenarios: {
    // 10 VUs ejecutando simultáneamente una ráfaga con la misma clave
    concurrent_race: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 1,
      maxDuration: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

// Clave única compartida por todas las VUs para forzar la colisión de concurrencia
const sharedIdempotencyKey = 'a0000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');

export default function () {
  const payload = JSON.stringify({
    cliente_id: 'cliente-activo',
    monto: '100.00',
    metodo_origen: 'TRANSFERENCIA',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': sharedIdempotencyKey,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/depositos/usd`, payload, params);

  check(res, {
    'código de respuesta es 200 o 201': (r) => r.status === 200 || r.status === 201,
    'estado es COMPLETADO': (r) => {
      try {
        return JSON.parse(r.body).estado === 'COMPLETADO';
      } catch {
        return false;
      }
    },
    'monto acreditado es 100.00': (r) => {
      try {
        return JSON.parse(r.body).monto === '100.00';
      } catch {
        return false;
      }
    },
  });
}
