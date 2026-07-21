import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('gateway', () => {
  it('reports liveness and exposes request ids', async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('proxies public routes and preserves query strings', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify({ path: new URL(input.toString()).pathname + new URL(input.toString()).search }), {
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await buildApp(loadConfig({
      NODE_ENV: 'test', LOG_LEVEL: 'silent', ROUTES: JSON.stringify([{ prefix: '/api/demo', upstream: 'http://demo.internal', auth: false }])
    }));
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/demo/items?page=2' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ path: '/items?page=2' });
  });

  it('protects private routes with JWT', async () => {
    const app = await buildApp(loadConfig({
      NODE_ENV: 'test', LOG_LEVEL: 'silent', ROUTES: JSON.stringify([{ prefix: '/api/private', upstream: 'http://private.internal', auth: true }])
    }));
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/private/profile' });
    expect(response.statusCode).toBe(401);
  });
});
