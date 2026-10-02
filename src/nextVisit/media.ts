// Next-visit check media + offline queue.
// Same upload rules as job photos/videos: photos are compressed to a 1600px
// JPEG (0.8) and go through /customer-upload-photo (customer-viewable, since
// they appear on the invoice); videos go through /customer-upload-video (80MB
// cap). With no signal, the file and the latest checklist wait in IndexedDB /
// localStorage and upload automatically when the connection returns.

export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Compression failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image failed to load')); };
    img.src = url;
  });
}

export async function uploadMedia(jobId: string, blob: Blob, name: string, kind: 'photo' | 'video'): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append('file', blob, name);
  fd.append('bookingId', jobId);
  const res = await fetch(kind === 'video' ? '/customer-upload-video' : '/customer-upload-photo', { method: 'POST', body: fd });
  if (!res.ok) throw new Error((await res.text()) || `Upload failed (${res.status})`);
  return res.json();
}

// ---- offline queue (IndexedDB: files can be large) -------------------------------------------------

export interface QueuedMedia { qid: string; jobId: string; itemId: string; kind: 'photo' | 'video'; name: string; blob: Blob; takenAt: string }
const DB = 'gid-next-visit'; const STORE = 'media';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'qid' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export const queueMedia = (m: QueuedMedia) => tx('readwrite', s => s.put(m));
export const unqueueMedia = (qid: string) => tx('readwrite', s => s.delete(qid));
export async function queuedFor(jobId: string): Promise<QueuedMedia[]> {
  try { return ((await tx('readonly', s => s.getAll())) as QueuedMedia[]).filter(m => m.jobId === jobId); } catch { return []; }
}

// The latest unsaved checklist per job (small JSON).
const PKEY = (jobId: string) => `gid-nv-pending:${jobId}`;
export function savePending(jobId: string, nv: unknown) { try { localStorage.setItem(PKEY(jobId), JSON.stringify(nv)); } catch { /* private mode */ } }
export function readPending<T>(jobId: string): T | null { try { const s = localStorage.getItem(PKEY(jobId)); return s ? JSON.parse(s) as T : null; } catch { return null; } }
export function clearPending(jobId: string) { try { localStorage.removeItem(PKEY(jobId)); } catch { /* ignore */ } }

export const isNetworkError = (e: unknown) => !navigator.onLine || e instanceof TypeError;
