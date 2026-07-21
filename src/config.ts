import { z } from 'zod';

const routeSchema = z.object({
  prefix: z.string().startsWith('/').refine((value) => !value.endsWith('/'), 'prefix must not end with /'),
  upstream: z.string().url(),
  auth: z.boolean().default(true)
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_RESET_MS: z.coerce.number().int().positive().default(15_000),
  ROUTES: z.string().default('[]').transform((raw, context) => {
    try {
      return z.array(routeSchema).parse(JSON.parse(raw));
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'ROUTES must be a valid JSON route array' });
      return z.NEVER;
    }
  })
});

export type GatewayConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return schema.parse(env);
}
