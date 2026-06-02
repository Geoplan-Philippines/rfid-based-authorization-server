export const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

export const PLATE_LETTERS_FIRST = /(?<![A-Z])([A-Z]{2,3})[^A-Z0-9]*(\d{3,4})(?!\d)/g;
export const PLATE_DIGITS_FIRST = /(?<!\d)(\d{3,4})[^A-Z0-9]*([A-Z]{2,3})(?![A-Z])/g;
