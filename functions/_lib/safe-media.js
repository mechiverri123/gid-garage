// Uploaded files are served from gidgarage.com itself, so a file must never be
// able to run as a web page there (an uploaded .html / .svg would run with the
// owner's admin session). Uploads accept only real media types, and serving
// shows only known media inline: everything else downloads as an inert file,
// with nosniff and a sandboxing CSP either way. Tests: tests/safe-media.test.js

const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'];
const VIDEO = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'];
const PDF = ['application/pdf'];
export const UPLOAD_TYPES = { image: IMAGE, imageOrPdf: [...IMAGE, ...PDF], video: VIDEO };
const INLINE = new Set([...IMAGE, ...VIDEO, ...PDF]);

const base = t => String(t || '').split(';')[0].trim().toLowerCase();
// Browsers sometimes send no type for HEIC; trust the extension only for these.
const BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

// The stored content type for an upload, or null when it isn't allowed.
export function uploadType(file, allowed) {
  const t = base(file?.type) || BY_EXT[String(file?.name || '').split('.').pop().toLowerCase()] || '';
  return allowed.includes(t) ? t : null;
}

export function safeServeHeaders(storedType, extra = {}) {
  const t = base(storedType);
  const inline = INLINE.has(t);
  return {
    'Content-Type': inline ? t : 'application/octet-stream',
    ...(inline ? {} : { 'Content-Disposition': 'attachment' }),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    ...extra,
  };
}
