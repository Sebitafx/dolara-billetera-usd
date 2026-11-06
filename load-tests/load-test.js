import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://54.167.69.62';

export const options = {
  stages: [
    { duration: '20s', target: 15 }, // Calentamiento gradual a 15 VUs
    { duration: '40s', target: 35 }, // Carga sostenida a 35 VUs
    { duration: '20s', target: 50 }, // Pico de carga moderada a 50 VUs
    { duration: '15s', target: 0 },  // Descenso y estabilización
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Menos de 1% de error
    http_req_duration: ['p(95)<600'],  // 95% de peticiones debajo de 600ms
    'http_req_duration{tipo:deposito}': ['p(95)<800'],
    'http_req_duration{tipo:lectura}': ['p(95)<300'],
  },
};

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function () {
  const rand = Math.random();

  if (rand < 0.40) {
    // 40% Consulta de tipo de cambio FX (Lectura rápida en memoria / BD)
    const fxRes = http.get(`${BASE_URL}/api/v1/fx/tasa?par=USD_PEN`, {
      tags: { tipo: 'lectura' },
    });
    check(fxRes, {
      'fx status 200': (r) => r.status === 200,
      'fx par USD_PEN': (r) => {
        try {
          return JSON.parse(r.body).par === 'USD_PEN';
        } catch {
          return false;
        }
      },
    });
  } else if (rand < 0.75) {
    // 35% Creación de Depósito USD (Escritura ACID con Idempotency-Key)
    const key = uuidv4();
    const payload = JSON.stringify({
      cliente_id: 'cliente-activo',
      monto: (10 + Math.floor(Math.random() * 100)).toFixed(2),
      metodo_origen: 'TRANSFERENCIA',
    });
    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      tags: { tipo: 'deposito' },
    };
    const depRes = http.post(`${BASE_URL}/api/v1/depositos/usd`, payload, params);
    check(depRes, {
      'deposito status 201': (r) => r.status === 201,
      'deposito COMPLETADO': (r) => {
        try {
          return JSON.parse(r.body).estado === 'COMPLETADO';
        } catch {
          return false;
        }
      },
      'deposito moneda USD': (r) => {
        try {
          return JSON.parse(r.body).moneda === 'USD';
        } catch {
          return false;
        }
      },
    });
  } else {
    // 25% Health check & Monitoreo de Infraestructura
    const healthRes = http.get(`${BASE_URL}/health/ready`, {
      tags: { tipo: 'lectura' },
    });
    check(healthRes, {
      'health status 200': (r) => r.status === 200,
      'db up': (r) => {
        try {
          return JSON.parse(r.body).db === 'up';
        } catch {
          return false;
        }
      },
    });
  }

  sleep(0.3 + Math.random() * 0.4); // Pausa realista entre transacciones (300ms a 700ms)
}
