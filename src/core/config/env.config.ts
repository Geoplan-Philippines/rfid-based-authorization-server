import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().startsWith('postgresql://').min(1),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  JWT_SECRET: z.string().min(32),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z
    .string()
    .min(1)
    .refine(
      (v) => /^[^<>]+<[^\s@]+@[^\s@]+\.[^\s@]+>$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Must be an email or "Name <email>" format',
    ),
  RESEND_VERIFY_TEMPLATE_ID: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
