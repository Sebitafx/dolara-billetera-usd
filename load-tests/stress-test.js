import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://54.167.69.62';

export const options = {
  stages: [
    { duration: '15s', target: 20 },  // Rampa a 20 VUs
    { duration: '30s', target: 60 },  // Carga pesada a 60 VUs
    { duration: '30s', target: 120 }, // Estrés extremo a 120 VUs (Breaking point test)
    { duration: '15s', target: 0 },   // Enfriamiento
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],    // En estrés se tolera hasta 5% de errores
    http_req_duration: ['p(95)<1500'], // 95% debajo de 1.5s
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

  if (rand < 0.5) {
    // 50% Lectura rápida
    const res = http.get(`${BASE_URL}/api/v1/fx/tasa?par=USD_PEN`);
    check(res, { 'status is 200': (r) => r.status === 200 });
  } else {
    // 50% Escritura transaccional
    const key = uuidv4();
    const payload = JSON.stringify({
      cliente_id: 'cliente-activo',
      monto: '15.00',
      metodo_origen: 'TRANSFERENCIA',
    });
    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
    };
    const res = http.post(`${BASE_URL}/api/v1/depositos/usd`, payload, params);
    check(res, { 'status is 201': (r) => r.status === 201 });
  }

  sleep(0.1 + Math.random() * 0.2); // Peticiones muy agresivas (100ms - 300ms)
}

