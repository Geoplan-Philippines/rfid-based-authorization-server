import { Truck } from "@prisma/client";

export interface OcrSpaceParsedResult {
  ParsedText: string;
  ErrorMessage?: string;
  FileParseExitCode?: number;
}

export interface OcrSpaceResponse {
  ParsedResults: OcrSpaceParsedResult[] | null;
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
}


export interface PlateRecognitionResult {
  plateNumber: string | null;
  candidates: string[];
  rawText: string;
}

export interface PlateVerificationResult extends PlateRecognitionResult {
  registered: boolean;
  truck: Truck | null;
}

export interface UploadedImageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
