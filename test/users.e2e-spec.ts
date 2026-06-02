import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let createdUserId: string;

  const adminEmail = `users-admin-e2e-${Date.now()}@example.com`;
  const adminPassword = 'password123';
  const userEmail = `users-e2e-${Date.now()}@example.com`;

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
        firstName: 'Users',
        lastName: 'Admin',
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 10),
        role: 'SUPER_ADMIN',
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: adminEmail,
        password: adminPassword,
      })
      .expect(201);

    const body = loginRes.body.data ?? loginRes.body;
    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [adminEmail, userEmail],
        },
      },
    });

    await prisma.$disconnect();
    await app.close();

  });

  it('POST /api/v1/users — creates a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        firstName: 'User',
        lastName: 'E2E',
        email: userEmail,
        password: 'password123',
      })
      .expect(201);

    const body = res.body.data ?? res.body;

      expect(body.id).toBeDefined();
      expect(body.email).toBe(userEmail);
      expect(body.password).toBeUndefined();

    createdUserId = body.id;
  });

  it('POST /api/v1/users — 409 on duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        firstName: 'Duplicate',
        lastName: 'User',
        email: userEmail,
        password: 'password123',
      })
      .expect(409);
  });

  it('POST /api/v1/users — 400 on invalid email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        firstName: 'Invalid',
        lastName: 'Email',
        email: 'not-an-email',
        password: 'password123',
      })
      .expect(400);
  });

  it('GET /api/v1/users — returns users when authenticated', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;

      expect(Array.isArray(body)).toBe(true);
      expect(body.some((user: any) => user.email === userEmail)).toBe(true);
  });

  it('GET /api/v1/users — 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .expect(401);
  });

  it('GET /api/v1/users/:id — returns user by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;

      expect(body.id).toBe(createdUserId);
      expect(body.email).toBe(userEmail);
      expect(body.password).toBeUndefined();
  });

  it('GET /api/v1/users/:id — 401 without token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/${createdUserId}`)
      .expect(401);
  });

  it('GET /api/v1/users/:id — 404 for unknown UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('GET /api/v1/users/:id — 400 for invalid UUID', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('POST /api/v1/users — 400 on missing required fields', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/users')
    .send({
      firstName: 'Missing',
    })
      .expect(400);
  });
});