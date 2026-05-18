import 'dotenv/config';

export const env = {
  // Basic App Settings
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  PORT: process.env.PORT,

  // Database Settings
  DATABASE_URL: process.env.DATABASE_URL,

  // Security Header Settings
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:4200'],

  // Resend Settings
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  RESEND_VERIFY_TEMPLATE_ID: process.env.RESEND_VERIFY_TEMPLATE_ID,

  // JWT Settings
  JWT_SECRET: process.env.JWT_SECRET,
}
