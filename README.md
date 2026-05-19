# Backend Core Development Kit

> Internal use — **Geoplan Philippines**

NestJS template with PostgreSQL (Prisma) + Passport.js JWT auth. Cloneable starting point for dashboard-type projects.

## What's Included

- NestJS 11 + TypeScript
- **PostgreSQL** via Prisma ORM (`@prisma/adapter-pg`)
- **JWT auth** via Passport.js (`passport-jwt`)
- Basic security: `helmet`, CORS allowlist, rate limiting via `@nestjs/throttler`
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted)
- Global response interceptor (`src/common/interceptors`)
- Global HTTP exception filter (`src/common/filters`)
- Health checks via `@nestjs/terminus` (includes DB ping)
- API prefix: `api/v1`
- bun as package manager

## What's NOT Included

- No social/OAuth login
- No magic link / passwordless
- No payment integration
- No business modules

## When To Use This Template

Use when:
- Small-scale internal dashboard (1–5 concurrent users)
- Simple email/password auth is sufficient
- No social login or advanced session management needed

Use the Postgres + Better Auth template instead when OAuth, magic links, or richer session management are needed.

## Quick Start

```bash
git clone -b nestjs-postgres-passport https://github.com/Geoplan-Philippines/backend-boilerplate <project-name>
cd <project-name>
bun install
cp .env.example .env
# fill in DATABASE_URL and JWT_SECRET in .env
bunx prisma migrate dev
bun run start:dev
```

Server: `http://localhost:8000/api/v1`

Verify setup — hit the health check:

```bash
curl http://localhost:8000/api/v1/health
```

Healthy response: `{ "status": "ok", ... }`.

## Environment

See `.env.example`:
- `NODE_ENV`, `PORT`
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret for signing JWT tokens
- `JWT_EXPIRES_IN` — token expiry (e.g. `7d`)
- `CORS_ALLOWED_ORIGINS` (comma-separated)

## Scripts

See `scripts` in `package.json`. Run with `bun run <name>`.

## Folder Structure

```
src/
  common/
    filters/         # global exception filters
    interceptors/    # global response interceptor
    responses/       # response shapes
  core/
    auth/            # Passport JWT strategy, auth module, guards
    database/        # PrismaService
    health/          # health checks (includes DB ping)
    security/        # security helpers
  modules/           # feature modules
  app.module.ts
  main.ts
prisma/
  schema.prisma      # DB schema
  migrations/        # migration history
```

## Workflow

1. Clone repo
2. Rename in `package.json`
3. Define your schema in `prisma/schema.prisma`
4. Run `bunx prisma migrate dev`
5. Build features under `src/modules`

---

Maintained by Geoplan Philippines. Internal use only.
