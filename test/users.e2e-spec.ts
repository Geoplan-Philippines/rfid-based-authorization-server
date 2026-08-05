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

  it('GET /api/v1/users — returns a paginated envelope when authenticated', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ search: userEmail })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 10, total: expect.any(Number), lastPage: expect.any(Number) }),
    );

    const emails = res.body.data.map((user: { email: string }) => user.email);
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
      const emailTestUserEmail = `users-email-patch-e2e-${Date.now()}@example.com`;
      const newEmail = `${emailTestUserEmail.split('@')[0]}-patched@EXAMPLE.com`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Email',
          lastName: 'Patch',
          email: emailTestUserEmail,
          password: 'password123',
        })
        .expect(201);

      const emailTestUserId = (createRes.body.data ?? createRes.body).id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${emailTestUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: newEmail })
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.email).toBe(newEmail.toLowerCase());

      await prisma.user.deleteMany({
        where: { email: { in: [emailTestUserEmail, newEmail.toLowerCase()] } },
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

    it('403s when attempting to set role to SUPER_ADMIN', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'SUPER_ADMIN' })
        .expect(403);
    });

    it('409s when attempting to update an archived user', async () => {
      const archivedEmail = `users-patch-archived-e2e-${Date.now()}@example.com`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Already',
          lastName: 'Archived',
          email: archivedEmail,
          password: 'password123',
        })
        .expect(201);

      const archivedUserId = (createRes.body.data ?? createRes.body).id;

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${archivedUserId}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${archivedUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'ShouldNotApply' })
        .expect(409);

      await prisma.user.deleteMany({ where: { email: archivedEmail } });
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

    it('still returns the archived user from GET /api/v1/users/:id so it can be restored', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${archivableUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.id).toBe(archivableUserId);
      expect(body.isArchived).toBe(true);
    });

    it('includes the archived user only when includeArchived=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ search: archivableEmail, includeArchived: true })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const emails = (res.body.data ?? res.body).map((user: { email: string }) => user.email);
      expect(emails).toContain(archivableEmail);
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

  describe('role and self-mutation guards', () => {
    let operatorToken: string;
    let operatorId: string;
    const operatorEmail = `users-operator-e2e-${Date.now()}@example.com`;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Gate',
          lastName: 'Operator',
          email: operatorEmail,
          password: 'password123',
          role: 'OPERATOR',
        })
        .expect(201);

      operatorId = (createRes.body.data ?? createRes.body).id;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: operatorEmail, password: 'password123' })
        .expect(201);

      operatorToken = (loginRes.body.data ?? loginRes.body).accessToken;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: operatorEmail } });
    });

    it('403s every /users route for a non-SUPER_ADMIN', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/users/${operatorId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${operatorId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ firstName: 'Escalate' })
        .expect(403);
    });

    it('filters the list by role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ role: 'OPERATOR', limit: 50 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const roles = res.body.data.map((user: { role: string }) => user.role);
      expect(roles.every((role: string) => role === 'OPERATOR')).toBe(true);
    });

    it('403s when a SUPER_ADMIN archives their own account', async () => {
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const selfId = (meRes.body.data ?? meRes.body).id;

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${selfId}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${selfId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('400s when the update body carries no updatable field', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${operatorId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });
});
