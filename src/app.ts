import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { CircuitBreaker } from './circuit-breaker.js';
import { type GatewayConfig } from './config.js';
import { Metrics } from './metrics.js';

const skippedRequestHeaders = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const skippedResponseHeaders = new Set(['connection', 'content-length', 'transfer-encoding', 'content-encoding']);

function proxyHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (!skippedRequestHeaders.has(name) && value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  headers.set('x-request-id', request.id);
  headers.set('x-forwarded-for', request.ip);
  headers.set('x-forwarded-proto', request.protocol);
  return headers;
}

export async function buildApp(config: GatewayConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    disableRequestLogging: false
  });
  const metrics = new Metrics();

  await app.register(helmet);
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Pulse Gateway', version: '1.0.0', description: 'Resilient edge gateway for HTTP services' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
    }
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request, reply) => {
    (request as FastifyRequest & { startedAt: number }).startedAt = performance.now();
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = (request as FastifyRequest & { startedAt?: number }).startedAt ?? performance.now();
    metrics.record(reply.statusCode, performance.now() - startedAt);
  });

  app.get('/health/live', { schema: { tags: ['Operations'] } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { tags: ['Operations'] } }, async () => ({
    status: 'ready',
    services: config.ROUTES.map(({ prefix, upstream }) => ({ prefix, upstream }))
  }));
  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('text/plain; version=0.0.4').send(metrics.render());
  });

  for (const route of config.ROUTES) {
    const breaker = new CircuitBreaker(config.CIRCUIT_FAILURE_THRESHOLD, config.CIRCUIT_RESET_MS);
    app.all(`${route.prefix}/*`, {
      schema: {
        tags: ['Proxy'],
        security: route.auth ? [{ bearerAuth: [] }] : [],
        params: { type: 'object', properties: { '*': { type: 'string' } } }
      },
      ...(route.auth ? { preHandler: async (request: FastifyRequest) => request.jwtVerify() } : {})
    }, async (request, reply) => {
      if (!breaker.canRequest()) {
        return reply.code(503).send({ error: 'Service Unavailable', message: 'Upstream circuit is open', requestId: request.id });
      }

      const suffix = (request.params as { '*': string })['*'];
      const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
      const target = `${route.upstream}/${suffix}${query}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

      try {
        const hasBody = !['GET', 'HEAD'].includes(request.method);
        const response = await fetch(target, {
          method: request.method,
          headers: proxyHeaders(request),
          ...(hasBody && request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          signal: controller.signal
        });
        if (response.status >= 500) breaker.fail(); else breaker.succeed();
        response.headers.forEach((value, name) => {
          if (!skippedResponseHeaders.has(name)) reply.header(name, value);
        });
        const body = Buffer.from(await response.arrayBuffer());
        return reply.code(response.status).send(body);
      } catch (error) {
        breaker.fail();
        request.log.warn({ err: error, upstream: route.upstream }, 'upstream request failed');
        return reply.code(502).send({ error: 'Bad Gateway', message: 'Upstream request failed', requestId: request.id });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  app.setNotFoundHandler(async (request, reply) => reply.code(404).send({
    error: 'Not Found', message: `No route for ${request.method} ${request.url}`, requestId: request.id
  }));
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'request failed');
    return reply.code(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : error.name,
      message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      requestId: request.id
    });
  });

  return app;
}
