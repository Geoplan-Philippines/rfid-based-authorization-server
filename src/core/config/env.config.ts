import 'dotenv/config';
import { z } from 'zod';

export const booleanFromEnvironment = (defaultValue: boolean) => z.preprocess((value) => {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}, z.boolean());

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
  RESEND_EAGLE_CEMENT_TEMPLATE_ID: z.string().min(1),
  // Comma-separated reviewer addresses that receive the auto-sent alert when a transaction
  // finishes with a non-VERIFIED result. Empty means auto-alerting is disabled.
  TRANSACTION_ALERT_RECIPIENTS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((e) => e.trim()).filter(Boolean)),
  OCR_SPACE_API_KEY: z.string().min(1),

  // --- Face recognition — service -------------------------------------------
  FACE_RECOGNITION_ENABLED: booleanFromEnvironment(false),
  FACE_ENFORCEMENT_MODE: z.enum(['OFF', 'SHADOW', 'ACTIVE']).default('SHADOW'),
  FACE_SERVICE_BASE_URL: z.string().min(1).default('http://127.0.0.1:8001'),
  // Required only when FACE_RECOGNITION_ENABLED=true — enforced below.
  FACE_SERVICE_API_KEY: z.string().min(1).optional(),
  FACE_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  FACE_SERVICE_RETRY_ATTEMPTS: z.coerce.number().int().min(0).default(1),

  // --- Face recognition — live operator preview -------------------------------
  // Proxies the face service's MJPEG + detections SSE to the browser. Short TTL
  // because the ticket travels in the query string, where <img src> and
  // EventSource can actually carry it.
  FACE_PREVIEW_ENABLED: booleanFromEnvironment(true),
  FACE_PREVIEW_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  FACE_PREVIEW_CAMERA_ID: z.string().min(1).default('GATE-IN-FACE'),

  // --- Face recognition — model pinning ---------------------------------------
  // Changing either invalidates every stored embedding (re-enrollment of 2 000+ drivers).
  FACE_EMBEDDING_PROVIDER: z.enum(['DEEPFACE', 'INSIGHTFACE']).default('DEEPFACE'),
  FACE_EMBEDDING_MODEL: z.enum(['ARCFACE', 'FACENET512', 'SFACE']).default('ARCFACE'),
  FACE_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(512),

  // --- Face recognition — matching thresholds (cosine distance) --------------
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(2).default(0.45),
  FACE_MATCH_MARGIN: z.coerce.number().min(0).max(2).default(0.08),
  FACE_LOW_CONFIDENCE_BAND: z.coerce.number().min(0).max(2).default(0.08),
  FACE_MIN_QUALITY_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  FACE_MIN_LIVENESS_SCORE: z.coerce.number().min(0).max(1).default(0.6),
  FACE_LIVENESS_ENABLED: booleanFromEnvironment(true),
  FACE_LIVENESS_DISABLE_IN_IR: booleanFromEnvironment(true),

  // --- Face recognition — gate capture window ---------------------------------
  FACE_GATE_CAMERA_ID: z.string().min(1).default('GATE-IN-FACE'),
  FACE_GATE_FRAME_COUNT: z.coerce.number().int().positive().default(5),
  FACE_GATE_MIN_VOTES: z.coerce.number().int().positive().default(3),
  FACE_GATE_CAPTURE_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  FACE_GATE_LOOKBACK_MS: z.coerce.number().int().min(0).default(1000),
  FACE_GATE_SAMPLE_FPS: z.coerce.number().int().positive().default(5),
  FACE_GATE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  // Default false = current behaviour: a valid tag auto-opens the barrier even on a face
  // mismatch. Set true ONLY once accuracy justifies it.
  FACE_BLOCK_BARRIER_ON_MISMATCH: booleanFromEnvironment(false),

  // --- Face recognition — enrollment ------------------------------------------
  FACE_ENROLLMENT_ANGLES: z
    .string()
    .default('FRONT,DOWN,LEFT,RIGHT')
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean)),
  FACE_ENROLLMENT_ENFORCE_ORDER: booleanFromEnvironment(true),
  FACE_ENROLLMENT_RANDOMIZE_ORDER: booleanFromEnvironment(false),
  FACE_ENROLLMENT_STEP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  FACE_ENROLLMENT_MIN_IPD_PX: z.coerce.number().int().positive().default(90),
  FACE_ENROLLMENT_MIN_SHARPNESS: z.coerce.number().positive().default(120),
  FACE_ENROLLMENT_MIN_BRIGHTNESS: z.coerce.number().min(0).max(255).default(60),
  FACE_ENROLLMENT_MAX_BRIGHTNESS: z.coerce.number().min(0).max(255).default(200),
  FACE_ENROLLMENT_MAX_CLIPPED_PIXEL_RATIO: z.coerce.number().min(0).max(1).default(0.05),
  FACE_ENROLLMENT_MIN_QUALITY_SCORE: z.coerce.number().min(0).max(1).default(0.6),
  FACE_ENROLLMENT_MIN_LIVENESS_SCORE: z.coerce.number().min(0).max(1).default(0.7),
  FACE_ENROLLMENT_DUPLICATE_THRESHOLD: z.coerce.number().min(0).max(2).default(0.4),
  FACE_ENROLLMENT_COHERENCE_THRESHOLD: z.coerce.number().min(0).max(2).default(0.7),
  // Deferred per scope decision (RA 10173). Columns exist; flip to true to enforce.
  FACE_ENROLLMENT_CONSENT_REQUIRED: booleanFromEnvironment(false),

  // --- Face recognition — storage & retention ---------------------------------
  MAX_FACE_UPLOAD_BYTES: z.coerce.number().int().positive().default(4_194_304),
  FACE_SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  FACE_ENROLLMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  FACE_PURGE_CRON: z.string().min(1).default('0 3 * * *'),

  // --- Face recognition — alerts -----------------------------------------------
  // Suppress the non-VERIFIED alert email when the ONLY problem is a face mismatch. Mandatory
  // while enrolling 2 000+ drivers incrementally — see D6.
  FACE_SUPPRESS_MISMATCH_ALERTS: booleanFromEnvironment(true),
}).superRefine((data, ctx) => {
  if (data.FACE_RECOGNITION_ENABLED && !data.FACE_SERVICE_API_KEY) {
    ctx.addIssue('FACE_SERVICE_API_KEY is required when FACE_RECOGNITION_ENABLED=true');
  }
  if (data.FACE_ENROLLMENT_MIN_BRIGHTNESS >= data.FACE_ENROLLMENT_MAX_BRIGHTNESS) {
    ctx.addIssue({
      code: 'custom',
      path: ['FACE_ENROLLMENT_MAX_BRIGHTNESS'],
      message: 'FACE_ENROLLMENT_MAX_BRIGHTNESS must be greater than FACE_ENROLLMENT_MIN_BRIGHTNESS',
      input: data.FACE_ENROLLMENT_MAX_BRIGHTNESS,
    });
  }

  const configuredAngles = data.FACE_ENROLLMENT_ANGLES;
  const allowedAngles = new Set(['FRONT', 'DOWN', 'LEFT', 'RIGHT']);
  if (configuredAngles.length !== allowedAngles.size
    || new Set(configuredAngles).size !== allowedAngles.size
    || configuredAngles.some((angle) => !allowedAngles.has(angle))) {
    ctx.addIssue({
      code: 'custom',
      path: ['FACE_ENROLLMENT_ANGLES'],
      message: 'FACE_ENROLLMENT_ANGLES must contain FRONT, DOWN, LEFT, and RIGHT exactly once',
      input: configuredAngles,
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
