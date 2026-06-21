export const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

// Upload guardrails for the plate image: cap the size and restrict to common image types.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const PLATE_LETTERS_FIRST = /(?<![A-Z])([A-Z]{2,3})[^A-Z0-9]*(\d{3,4})(?!\d)/g;
export const PLATE_DIGITS_FIRST = /(?<!\d)(\d{3,4})[^A-Z0-9]*([A-Z]{2,3})(?![A-Z])/g;
