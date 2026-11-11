import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Mixed workload against the compose stack, through nginx:
 *   - browse: public catalog reads (the bulk of real traffic)
 *   - checkout: register -> login -> cart -> order -> payment -> capture
 *
 * Run it with `npm run test:load`. BASE_URL defaults to the nginx service on
 * the compose network; override it to hit a different entry point.
 */
const BASE_URL = __ENV.BASE_URL || 'http://nginx';
const PRODUCT_IDS = (__ENV.PRODUCT_IDS || '1,2,3')
    .split(',')
    .map((value) => Number(value.trim()));

const json = { 'Content-Type': 'application/json' };

// `SMOKE=1` (or `npm run test:load -- --smoke`) shrinks the run to a few
// seconds so the script itself can be validated.
const smoke = __ENV.SMOKE === '1';
const thinkTime = Number(__ENV.THINK_TIME ?? 1);
const profile = smoke
    ? { ramp: '2s', hold: '3s', down: '1s', browseVus: 1, checkoutVus: 1 }
    : { ramp: '20s', hold: '60s', down: '10s', browseVus: 40, checkoutVus: 10 };

export const options = {
    scenarios: {
        browse: {
            executor: 'ramping-vus',
            exec: 'browse',
            startVUs: 0,
            stages: [
                { duration: profile.ramp, target: profile.browseVus },
                { duration: profile.hold, target: profile.browseVus },
                { duration: profile.down, target: 0 },
            ],
            gracefulRampDown: '10s',
            tags: { workload: 'browse' },
        },
        checkout: {
            executor: 'ramping-vus',
            exec: 'checkout',
            startVUs: 0,
            stages: [
                { duration: profile.ramp, target: profile.checkoutVus },
                { duration: profile.hold, target: profile.checkoutVus },
                { duration: profile.down, target: 0 },
            ],
            gracefulRampDown: '10s',
            tags: { workload: 'checkout' },
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        'http_req_duration{workload:browse}': ['p(95)<1000'],
        'http_req_duration{workload:checkout}': ['p(95)<3000'],
    },
};

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export function browse() {
    const list = http.get(`${BASE_URL}/products?page=1&limit=10`, {
        tags: { name: 'GET /products' },
    });

    const listed = check(list, {
        'product list returns 200': (response) => response.status === 200,
        'product list is not empty': (response) =>
            response.json('data').length > 0,
    });

    if (listed) {
        const productId = pick(list.json('data')).id;
        const detail = http.get(`${BASE_URL}/products/${productId}`, {
            tags: { name: 'GET /products/:id' },
        });

        check(detail, {
            'product detail returns 200': (response) => response.status === 200,
        });
    }

    sleep(Math.random() * thinkTime);
}

export function checkout() {
    const unique = `${__VU}-${__ITER}-${Date.now()}`;
    const email = `loadtest+${unique}@example.com`;
    const password = 'password123';

    const register = http.post(
        `${BASE_URL}/users`,
        JSON.stringify({ email, password }),
        { headers: json, tags: { name: 'POST /users' } },
    );
    const registered = check(register, {
        'register returns 201': (response) => response.status === 201,
    });

    if (!registered) {
        sleep(thinkTime);
        return;
    }

    const login = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email, password }),
        { headers: json, tags: { name: 'POST /auth/login' } },
    );
    const loggedIn = check(login, {
        'login returns a token': (response) =>
            response.status === 201 && Boolean(response.json('access_token')),
    });

    if (!loggedIn) {
        sleep(thinkTime);
        return;
    }

    const authorization = `Bearer ${login.json('access_token')}`;
    const authJson = { ...json, Authorization: authorization };

    const cart = http.post(
        `${BASE_URL}/cart/items`,
        JSON.stringify({
            productId: pick(PRODUCT_IDS),
            quantity: 1 + (__ITER % 3),
        }),
        { headers: authJson, tags: { name: 'POST /cart/items' } },
    );
    check(cart, {
        'add to cart returns 201': (response) => response.status === 201,
    });

    const order = http.post(`${BASE_URL}/orders`, null, {
        headers: { Authorization: authorization },
        tags: { name: 'POST /orders' },
    });
    const ordered = check(order, {
        'order is created as pending': (response) =>
            response.status === 201 && response.json('status') === 'PENDING',
    });

    if (!ordered) {
        sleep(thinkTime);
        return;
    }

    const orderId = order.json('id');
    const payment = http.post(
        `${BASE_URL}/payments`,
        JSON.stringify({ orderId }),
        {
            headers: { ...authJson, 'Idempotency-Key': `loadtest-${unique}` },
            tags: { name: 'POST /payments' },
        },
    );
    const charged = check(payment, {
        'payment is created as pending': (response) =>
            response.status === 201 && response.json('status') === 'PENDING',
    });

    if (!charged) {
        sleep(thinkTime);
        return;
    }

    const paymentId = payment.json('id');
    const capture = http.post(
        `${BASE_URL}/payments/${paymentId}/capture`,
        null,
        {
            headers: { Authorization: authorization },
            tags: { name: 'POST /payments/:id/capture' },
        },
    );

    check(capture, {
        'payment is captured': (response) =>
            response.status === 200 && response.json('status') === 'COMPLETED',
    });

    sleep(thinkTime);
}

// `--vus`/`--duration` override the scenarios above; that run uses this
// function, which makes it a catalog-only stress test.
export default browse;
