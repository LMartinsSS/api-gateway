# Pulse Gateway

> A small, production-minded API gateway built with Fastify, TypeScript and zero external infrastructure.

[![CI](https://github.com/OWNER/pulse-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/pulse-gateway/actions)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Pulse Gateway gives small service architectures a clean edge layer without bringing in a large platform. Routes are configured through the environment and receive sensible resilience, security and observability defaults.

## Highlights

- Dynamic HTTP routing through a single JSON environment variable
- Optional JWT protection per upstream service
- Fixed-window rate limiting and secure HTTP headers
- Circuit breaker and timeout isolation for every upstream
- Request ID propagation and structured Pino logs
- Prometheus-compatible metrics and Kubernetes-friendly health endpoints
- OpenAPI documentation at `/docs`
- Graceful shutdown, multi-stage Docker image and GitHub Actions CI
- Unit and integration tests with a real local upstream

## Architecture

```text
 Client
   │
   ▼
┌──────────────────────────────────────────────┐
│                 Pulse Gateway                │
│ JWT · Rate limit · Request ID · OpenAPI      │
│                                              │
│ /api/users/*   ─ Circuit breaker ─► Users    │
│ /api/catalog/* ─ Circuit breaker ─► Catalog  │
└──────────────────────────────────────────────┘
   │
   ├── /health/live · /health/ready
   └── /metrics · /docs
```

## Quick start

Requirements: Node.js 22+ and npm 10+.

```bash
cp .env.example .env
npm install
npm run dev
```

The gateway starts on `http://localhost:3000`. Its example routes expect services on ports `4001` and `4002`; replace them with your own URLs.

Configure routes using a JSON array:

```env
ROUTES=[{"prefix":"/api/users","upstream":"http://localhost:4001","auth":true},{"prefix":"/api/catalog","upstream":"http://localhost:4002","auth":false}]
```

A request to `GET /api/catalog/products?page=1` becomes `GET http://localhost:4002/products?page=1`.

### Authenticated requests

Routes with `"auth": true` require a signed bearer token. The gateway verifies the signature and expiration before forwarding the request.

```bash
curl http://localhost:3000/api/users/me \
  -H 'Authorization: Bearer YOUR_JWT'
```

For local testing, sign an HS256 token with the value of `JWT_SECRET`. Use a secret manager and a long random secret in production.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3000` | HTTP port |
| `LOG_LEVEL` | `info` | Pino log level |
| `JWT_SECRET` | development value | HS256 signing secret (minimum 32 chars) |
| `RATE_LIMIT_MAX` | `100` | Requests allowed per client each minute |
| `REQUEST_TIMEOUT_MS` | `5000` | Maximum upstream response time |
| `CIRCUIT_FAILURE_THRESHOLD` | `3` | Failures before opening a circuit |
| `CIRCUIT_RESET_MS` | `15000` | Delay before a recovery attempt |
| `ROUTES` | `[]` | JSON array of route definitions |

Configuration is validated on startup, so a malformed deployment fails early with a useful error.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/docs` | Interactive OpenAPI UI |
| `/health/live` | Process liveness |
| `/health/ready` | Gateway configuration and readiness |
| `/metrics` | Prometheus text exposition |

## Commands

```bash
npm run dev       # development server with reload
npm test          # unit and integration tests
npm run lint      # static analysis
npm run build     # compile TypeScript
npm run check     # all quality gates
docker compose up --build
```

## Production notes

This project intentionally stores rate-limit counters and metrics in memory to remain runnable without dependencies. For horizontal scaling, connect the rate limiter to Redis and export metrics through OpenTelemetry or a Prometheus client. TLS should terminate at your ingress or load balancer.

## License

[MIT](LICENSE)
