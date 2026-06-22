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

    const createdUserRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'User',
        lastName: 'E2E',
        email: userEmail,
        password: 'password123',
      })
      .expect(201);

    const createdUserBody = createdUserRes.body.data ?? createdUserRes.body;
    createdUserId = createdUserBody.id;
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

  it('beforeAll setup created test user', async () => {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    expect(user).toBeDefined();
    expect(user?.id).toBe(createdUserId);
    expect(user?.email).toBe(userEmail);
  });

  it('POST /api/v1/users — 409 on duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
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
      .set('Authorization', `Bearer ${accessToken}`)
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

    const emails = body.map((user: { email: string }) => user.email);
    expect(emails).toContain(userEmail);
  });

  it('GET /api/v1/users — 401 without token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
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
    await request(app.getHttpServer()).get(`/api/v1/users/${createdUserId}`).expect(401);
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
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Missing',
      })
      .expect(400);
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('updates allowed fields and returns the user without a password', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      const body = res.body.data ?? res.body;

      expect(body.id).toBe(createdUserId);
      expect(body.firstName).toBe('Updated');
      expect(body.password).toBeUndefined();
    });

    it('normalizes a newly patched email', async () => {
      const newEmail = `${userEmail.split('@')[0]}-patched@EXAMPLE.com`;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: newEmail })
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.email).toBe(newEmail.toLowerCase());

      await prisma.user.update({
        where: { id: createdUserId },
        data: { email: userEmail },
      });
    });

    it('hashes a newly patched password', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: 'newpassword456' })
        .expect(200);

      const userRow = await prisma.user.findUnique({ where: { id: createdUserId } });
      expect(userRow?.password).not.toBe('newpassword456');

      const matches = await bcrypt.compare('newpassword456', userRow!.password);
      expect(matches).toBe(true);
    });

    it('409s when patched email collides with another user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: adminEmail })
        .expect(409);
    });

    it('400s on invalid email format', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('404s for unknown UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Ghost' })
        .expect(404);
    });

    it('400s for invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Ghost' })
        .expect(400);
    });

    it('401s without a token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .send({ firstName: 'NoAuth' })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/users/:id/archive', () => {
    let archivableUserId: string;
    const archivableEmail = `users-archive-e2e-${Date.now()}@example.com`;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Archive',
          lastName: 'Me',
          email: archivableEmail,
          password: 'password123',
        })
        .expect(201);

      const body = res.body.data ?? res.body;
      archivableUserId = body.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: archivableEmail } });
    });

    it('401s without a token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${archivableUserId}/archive`)
        .expect(401);
    });

    it('404s for unknown UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/00000000-0000-0000-0000-000000000000/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('400s for invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('archives the user and does not hard delete the row', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${archivableUserId}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.id).toBe(archivableUserId);
      expect(body.isArchived).toBe(true);

      const row = await prisma.user.findUnique({ where: { id: archivableUserId } });
      expect(row).not.toBeNull();
      expect(row?.isArchived).toBe(true);
    });

    it('excludes the archived user from GET /api/v1/users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body.data ?? res.body;
      const emails = body.map((user: { email: string }) => user.email);
      expect(emails).not.toContain(archivableEmail);
    });

    it('excludes the archived user from GET /api/v1/users/:id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/${archivableUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('rejects login for the archived user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: archivableEmail,
          password: 'password123',
        })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/users/:id/unarchive', () => {
    let unarchivableUserId: string;
    const unarchivableEmail = `users-unarchive-e2e-${Date.now()}@example.com`;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Unarchive',
          lastName: 'Me',
          email: unarchivableEmail,
          password: 'password123',
        })
        .expect(201);

      const body = res.body.data ?? res.body;
      unarchivableUserId = body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${unarchivableUserId}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: unarchivableEmail } });
    });

    it('401s without a token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${unarchivableUserId}/unarchive`)
        .expect(401);
    });

    it('404s for unknown UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/00000000-0000-0000-0000-000000000000/unarchive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('400s for invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/unarchive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('restores the user and makes it visible again', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${unarchivableUserId}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.id).toBe(unarchivableUserId);
      expect(body.isArchived).toBe(false);

      await request(app.getHttpServer())
        .get(`/api/v1/users/${unarchivableUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('allows login again after unarchiving', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: unarchivableEmail,
          password: 'password123',
        })
        .expect(201);

      const body = res.body.data ?? res.body;
      expect(body.accessToken).toBeDefined();
    });
  });
});
