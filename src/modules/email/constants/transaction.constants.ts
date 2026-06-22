// A VERIFIED event is a normal, successful entry — everything else (mismatch, denied, manual
// override, error, unknown tag) needs human review, so it triggers an alert email.
export const ALERT_FALLBACK = 'N/A';

// Brand palette + glyphs reused across the timeline steps. Resend has no template logic, so the
// service decides each step's colour/icon and injects them as plain variables — the template HTML
// (and therefore its design) stays untouched.
export const STATUS_COLOR = {
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  grey: '#94a3b8',
  muted: '#64748b',
} as const;

export const STATUS_ICON = {
  check: '✓', // ✓
  cross: '✗', // ✗
  bang: '!',
  dash: '–', // –
} as const;
