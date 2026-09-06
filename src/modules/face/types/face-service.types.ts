export interface FaceServiceImageInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface FaceAnalyzeOptions {
  includeEmbedding?: boolean;
  rejectMultiple?: boolean;
  antiSpoofing?: boolean;
  returnAlignedCrop?: boolean;
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  leftEye: [number, number];
  rightEye: [number, number];
  nose: [number, number];
  mouthLeft: [number, number];
  mouthRight: [number, number];
}

export interface FacePose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FaceQuality {
  score: number;
  sharpness: number;
  brightness: number;
  contrast: number;
  clippedPixelRatio: number;
  occluded: boolean;
}

export interface FaceLiveness {
  isReal: boolean;
  score: number;
  model: string;
}

export interface AnalyzedFace {
  boundingBox: FaceBoundingBox;
  landmarks: FaceLandmarks;
  interPupillaryDistancePx: number;
  pose: FacePose;
  quality: FaceQuality;
  liveness: FaceLiveness | null;
  embedding: number[] | null;
  provider: string;
  model: string;
  dimensions: number;
  alignedCropBase64: string | null;
}

export interface FaceAnalyzeResponse {
  requestId: string;
  faceCount: number;
  face: AnalyzedFace | null;
  timings: {
    detectMs: number;
    livenessMs: number;
    embedMs: number;
    totalMs: number;
  };
}

export interface OpenFaceCaptureInput {
  cameraId: string;
  requiredFrames?: number;
  timeoutMs?: number;
  lookbackMs?: number;
  minQualityScore?: number;
  antiSpoofing?: boolean;
  returnCrops?: boolean;
  sampleFps?: number;
}

export interface OpenFaceCaptureResponse {
  captureId: string;
  cameraId: string;
  status: 'PENDING';
  expiresAt: string;
}

export type FaceCaptureStatus = 'PENDING' | 'COMPLETE' | 'TIMEOUT' | 'FAILED';

export interface FaceCaptureFrame {
  capturedAt: string;
  sharpnessRank: number;
  face: AnalyzedFace;
  /** The 112x112 aligned model input. Not fit to show a person. */
  cropBase64: string | null;
  /**
   * Head-and-shoulders crop at source resolution, for the reviewer's eyes.
   * Optional: an older face service will not send it.
   */
  snapshotBase64?: string | null;
}

export interface FaceCaptureResponse {
  captureId: string;
  cameraId?: string;
  status: FaceCaptureStatus;
  source?: 'DEVICE' | 'PUSH' | 'RTSP' | 'SNAPSHOT_CGI';
  framesScanned: number;
  framesWithFace: number;
  framesAccepted: number;
  elapsedMs?: number;
  framesRejected?: {
    lowQuality: number;
    spoof: number;
    multipleFaces: number;
  };
  frames?: FaceCaptureFrame[];
  timings?: {
    totalMs: number;
    inferenceMs: number;
  };
}

export interface FaceServiceCameraHealth {
  cameraId: string;
  connected: boolean;
  lastFrameAgoMs: number | null;
  lastFrameMeanLuma: number | null;
  deliveringBlackFrames: boolean;
  bufferedFrames: number;
  reconnects: number;
  source: 'DEVICE' | 'PUSH' | 'RTSP' | 'SNAPSHOT_CGI';
}

export interface FaceServiceHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  modelsLoaded: {
    arcface: boolean;
    detector: string | null;
    antispoof: boolean;
  };
  cameras: FaceServiceCameraHealth[];
  activeCaptureSessions: number;
  uptimeSeconds: number;
  version: string;
}
