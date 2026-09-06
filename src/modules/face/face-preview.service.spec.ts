import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { env } from 'src/core/config/env.config';
import { FacePreviewService } from './face-preview.service';

const SECRET = 'test-secret-that-is-long-enough-000000';

describe('FacePreviewService', () => {
  const jwt = new JwtService({ secret: SECRET });
  const service = new FacePreviewService(jwt);

  // Enough of an express Response for everything up to the pipe. These tests
  // never let a real upstream connect, so the pipe itself is left to manual
  // verification, per the handoff.
  const response = () =>
    ({
      on: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
    }) as unknown as Response;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('issues a ticket that verifies as a preview ticket', async () => {
    const { ticket, expiresIn } = await service.issueTicket('user-1');

    expect(expiresIn).toBe(env.FACE_PREVIEW_TICKET_TTL_SECONDS);
    await expect(jwt.verifyAsync(ticket)).resolves.toMatchObject({
      sub: 'user-1',
      typ: 'face-preview',
    });
  });

  it('lets its own ticket through to the upstream call, with the api key attached', async () => {
    const { ticket } = await service.issueTicket('user-1');
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('upstream down'));

    // Reaching the upstream at all is the assertion: verification passed.
    await expect(service.streamVideo(ticket, response())).rejects.toThrow(ServiceUnavailableException);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${env.FACE_SERVICE_BASE_URL.replace(/\/$/, '')}`
      + `/api/v1/face/cameras/${encodeURIComponent(env.FACE_PREVIEW_CAMERA_ID)}/stream.mjpg`,
    );
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(env.FACE_SERVICE_API_KEY ?? '');
  });

  it('routes the detections stream to the SSE endpoint', async () => {
    const { ticket } = await service.issueTicket('user-1');
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('upstream down'));

    await expect(service.streamDetections(ticket, response())).rejects.toThrow(ServiceUnavailableException);

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${env.FACE_SERVICE_BASE_URL.replace(/\/$/, '')}`
      + `/api/v1/face/cameras/${encodeURIComponent(env.FACE_PREVIEW_CAMERA_ID)}/detections`,
    );
  });

  it('rejects a missing ticket', async () => {
    await expect(service.streamVideo(undefined, response())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed without the face-preview type', async () => {
    // A normal login JWT: right secret, wrong purpose. Accepting it would make
    // the short ticket TTL meaningless.
    const loginToken = await jwt.signAsync({ sub: 'user-1', email: 'a@b.c', role: 'ADMIN' });

    await expect(service.streamVideo(loginToken, response())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired ticket', async () => {
    const expired = await jwt.signAsync({ sub: 'user-1', typ: 'face-preview' }, { expiresIn: -10 });

    await expect(service.streamVideo(expired, response())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a ticket signed with a different secret', async () => {
    const foreign = new JwtService({ secret: 'a-completely-different-secret-000000' });
    const ticket = await foreign.signAsync({ sub: 'user-1', typ: 'face-preview' });

    await expect(service.streamVideo(ticket, response())).rejects.toThrow(UnauthorizedException);
  });

  it('404s on every route when the preview is disabled, rather than half-working', async () => {
    const ticket = await jwt.signAsync({ sub: 'user-1', typ: 'face-preview' });
    jest.replaceProperty(env, 'FACE_PREVIEW_ENABLED', false);

    await expect(service.issueTicket('user-1')).rejects.toThrow(NotFoundException);
    await expect(service.streamVideo(ticket, response())).rejects.toThrow(NotFoundException);
    await expect(service.streamDetections(ticket, response())).rejects.toThrow(NotFoundException);
  });
});
