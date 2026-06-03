import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  const email = `auth-e2e-${Date.now()}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();

    prisma = app.get(PrismaService);

    await prisma.user.create({
      data: {
        firstName: 'Auth',
        lastName: 'E2E',
        email,
        password: await bcrypt.hash(password, 10),
        role: 'ADMIN',
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);

    const body = loginRes.body.data ?? loginRes.body;
    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /api/v1/auth/login — logs in with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);

    const body = res.body.data ?? res.body;

    expect(body.accessToken).toBeDefined();
    expect(body.email).toBe(email);

  });

  it('POST /api/v1/auth/login — 401 on invalid password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrongpassword' })
      .expect(401);
  });

  it('GET /api/v1/auth/me — returns authenticated user info', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;

    expect(body.email).toBe(email);
    expect(body.password).toBeUndefined();
  });

  it('GET /api/v1/auth/me — 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
  });

  it('POST /api/v1/auth/login — 401 on invalid email format', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'invalid-email',
        password: 'password123',
      })
      .expect(401);
  });
});