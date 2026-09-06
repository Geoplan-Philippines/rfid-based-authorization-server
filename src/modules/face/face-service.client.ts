import { Injectable } from '@nestjs/common';

import { env } from 'src/core/config/env.config';
import { FaceServiceError, isFaceServiceErrorCode } from './errors/face-service.error';
import type {
  AnalyzedFace,
  FaceAnalyzeOptions,
  FaceAnalyzeResponse,
  FaceCaptureResponse,
  FaceServiceHealthResponse,
  FaceServiceImageInput,
  OpenFaceCaptureInput,
  OpenFaceCaptureResponse,
} from './types/face-service.types';

interface FaceServiceErrorEnvelope {
  code?: unknown;
  message?: unknown;
  requestId?: unknown;
  details?: unknown;
}

interface RequestOptions {
  authenticated: boolean;
}

@Injectable()
export class FaceServiceClient {
  private readonly baseUrl = env.FACE_SERVICE_BASE_URL.replace(/\/$/, '');

  async analyze(image: FaceServiceImageInput, options: FaceAnalyzeOptions = {}): Promise<FaceAnalyzeResponse> {
    const body = new FormData();
    body.set('image', new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType }), image.fileName);
    this.setBooleanFormField(body, 'include_embedding', options.includeEmbedding);
    this.setBooleanFormField(body, 'reject_multiple', options.rejectMultiple);
    this.setBooleanFormField(body, 'anti_spoofing', options.antiSpoofing);
    this.setBooleanFormField(body, 'return_aligned_crop', options.returnAlignedCrop);

    const response = await this.request<FaceAnalyzeResponse>('/api/v1/face/analyze', {
      method: 'POST',
      body,
    }, { authenticated: true });

    if (response.face) this.ensureFaceContract(response.face, options.includeEmbedding !== false);
    return response;
  }

  async openCapture(input: OpenFaceCaptureInput): Promise<OpenFaceCaptureResponse> {
    return this.request<OpenFaceCaptureResponse>('/api/v1/face/captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, { authenticated: true });
  }

  async getCapture(captureId: string): Promise<FaceCaptureResponse> {
    const response = await this.request<FaceCaptureResponse>(`/api/v1/face/captures/${encodeURIComponent(captureId)}`, {
      method: 'GET',
    }, { authenticated: true });

    for (const frame of response.frames ?? []) this.ensureFaceContract(frame.face, true);
    return response;
  }

  async health(): Promise<FaceServiceHealthResponse> {
    return this.request<FaceServiceHealthResponse>('/health', { method: 'GET' }, { authenticated: false });
  }

  private async request<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
    const attempts = env.FACE_SERVICE_RETRY_ATTEMPTS + 1;
    let lastError: FaceServiceError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.requestOnce<T>(path, init, options);
      } catch (error) {
        const faceServiceError = this.normalizeRequestError(error);
        lastError = faceServiceError;
        if (!faceServiceError.retryable || attempt === attempts) throw faceServiceError;
      }
    }

    throw lastError ?? new FaceServiceError({
      code: 'FACE_SERVICE_ERROR',
      message: 'Face service request failed',
    });
  }

  private async requestOnce<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.FACE_SERVICE_TIMEOUT_MS);
    const headers = new Headers(init.headers);

    if (options.authenticated && env.FACE_SERVICE_API_KEY) {
      headers.set('x-api-key', env.FACE_SERVICE_API_KEY);
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const payload = await this.readJson(response);

      if (!response.ok) throw this.mapErrorResponse(response.status, payload);
      return payload as T;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new FaceServiceError({
          code: 'FACE_SERVICE_TIMEOUT',
          message: `Face service request timed out after ${env.FACE_SERVICE_TIMEOUT_MS} ms`,
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new FaceServiceError({
        code: 'FACE_SERVICE_INVALID_RESPONSE',
        message: 'Face service returned an invalid JSON response',
        statusCode: response.status,
        cause: error,
      });
    }
  }

  private mapErrorResponse(statusCode: number, payload: unknown): FaceServiceError {
    const envelope = this.isRecord(payload) ? payload as FaceServiceErrorEnvelope : {};
    const upstreamCode = typeof envelope.code === 'string' ? envelope.code : undefined;
    const code = upstreamCode && isFaceServiceErrorCode(upstreamCode) ? upstreamCode : 'FACE_SERVICE_ERROR';

    return new FaceServiceError({
      code,
      message: typeof envelope.message === 'string' ? envelope.message : 'Face service request failed',
      statusCode,
      requestId: typeof envelope.requestId === 'string' ? envelope.requestId : undefined,
      details: envelope.details,
      upstreamCode,
    });
  }

  private normalizeRequestError(error: unknown): FaceServiceError {
    if (error instanceof FaceServiceError) return error;

    return new FaceServiceError({
      code: 'FACE_SERVICE_UNAVAILABLE',
      message: 'Face service is unavailable',
      cause: error,
    });
  }

  private ensureFaceContract(face: AnalyzedFace, embeddingRequired: boolean): void {
    const hasValidEmbedding = Array.isArray(face.embedding)
      && face.embedding.length === env.FACE_EMBEDDING_DIMENSIONS
      && face.embedding.every(Number.isFinite);

    if (embeddingRequired && !hasValidEmbedding) {
      throw this.invalidModelResponse('Face service returned an invalid embedding');
    }

    if (face.provider !== env.FACE_EMBEDDING_PROVIDER
      || face.model !== env.FACE_EMBEDDING_MODEL
      || face.dimensions !== env.FACE_EMBEDDING_DIMENSIONS) {
      throw this.invalidModelResponse('Face service model identity does not match the configured gallery');
    }
  }

  private invalidModelResponse(message: string): FaceServiceError {
    return new FaceServiceError({
      code: 'FACE_SERVICE_INVALID_RESPONSE',
      message,
    });
  }

  private setBooleanFormField(body: FormData, name: string, value: boolean | undefined): void {
    if (value !== undefined) body.set(name, String(value));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
