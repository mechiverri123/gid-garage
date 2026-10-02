// Uploaded files can never run as a web page on gidgarage.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadType, safeServeHeaders, UPLOAD_TYPES } from '../functions/_lib/safe-media.js';
import { onRequestPost as customerUpload } from '../functions/customer-upload-photo.js';
import { onRequestPost as adminUpload } from '../functions/admin-upload-photo.js';

test('upload types: photos/PDFs accepted, pages and scripts refused', () => {
  assert.equal(uploadType({ type: 'image/jpeg', name: 'a.jpg' }, UPLOAD_TYPES.image), 'image/jpeg');
  assert.equal(uploadType({ type: '', name: 'IMG_1.HEIC' }, UPLOAD_TYPES.image), 'image/heic');
  assert.equal(uploadType({ type: 'application/pdf', name: 'r.pdf' }, UPLOAD_TYPES.imageOrPdf), 'application/pdf');
  assert.equal(uploadType({ type: 'application/pdf', name: 'r.pdf' }, UPLOAD_TYPES.image), null);
  for (const t of ['text/html', 'image/svg+xml', 'application/javascript', 'text/xml']) assert.equal(uploadType({ type: t, name: 'x' }, UPLOAD_TYPES.imageOrPdf), null, t);
  assert.equal(uploadType({ type: 'text/html', name: 'x.jpg' }, UPLOAD_TYPES.image), null); // a declared type wins over the name
});

test('serving: media inline; anything else (old uploads too) downloads inert', () => {
  const img = safeServeHeaders('image/png', { 'Cache-Control': 'x' });
  assert.equal(img['Content-Type'], 'image/png');
  assert.equal(img['Content-Disposition'], undefined);
  assert.equal(img['X-Content-Type-Options'], 'nosniff');
  assert.match(img['Content-Security-Policy'], /sandbox/);
  assert.equal(img['Cache-Control'], 'x');
  for (const t of ['text/html', 'image/svg+xml', undefined, 'TEXT/HTML; charset=utf-8']) {
    const h = safeServeHeaders(t);
    assert.equal(h['Content-Type'], 'application/octet-stream', String(t));
    assert.equal(h['Content-Disposition'], 'attachment');
  }
});

test('public customer upload refuses an HTML file; admin upload needs a verified login', async () => {
  const put = [];
  const env = { GID_PHOTOS: { put: async (...a) => put.push(a) } };
  const form = (type, name) => { const f = new FormData(); f.append('file', new Blob(['<script>alert(1)</script>'], { type }), name); f.append('bookingId', 'GID-1'); return f; };
  const bad = await customerUpload({ request: new Request('https://x/customer-upload-photo', { method: 'POST', body: form('text/html', 'x.html') }), env });
  assert.equal(bad.status, 415);
  assert.equal(put.length, 0);
  const ok = await customerUpload({ request: new Request('https://x/customer-upload-photo', { method: 'POST', body: form('image/jpeg', 'p.jpg') }), env });
  assert.equal(ok.status, 200);
  assert.equal(put[0][2].httpMetadata.contentType, 'image/jpeg');
  const noLogin = await adminUpload({ request: new Request('https://x/admin-upload-photo', { method: 'POST', body: form('image/jpeg', 'p.jpg') }), env });
  assert.ok(noLogin.status === 401 || noLogin.status === 500, String(noLogin.status)); // 500 = Access not configured: fails closed
  assert.equal(put.length, 1);
});

test('public estimate/invoice lookup never sends the owner\'s internal fields', async () => {
  const { onRequestPost } = await import('../functions/api-customer.js');
  const row = { id: 'GID-1', fname: 'Jill', garage_notes: 'Rotors were rusted', invoice_amount: 300, parts_cost: 120, parts_receipts: '[{"url":"x"}]', admin_photos: '[]', stripe_customer_id: 'cus_123', signed_ip: '1.2.3.4', customer_id: 'c1' };
  const saved = globalThis.fetch;
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('business_settings') ? [{ tax_rate: 0.09 }] : [{ ...row }]), { status: 200 });
  try {
    const res = await onRequestPost({ request: new Request('https://x/api-customer', { method: 'POST', body: JSON.stringify({ action: 'get-job', id: 'GID-1' }) }), env: { SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_KEY: 'k' } });
    const job = await res.json();
    assert.equal(job.garage_notes, 'Rotors were rusted'); // shown to the customer as Technician Notes
    assert.equal(job.invoice_amount, 300);
    for (const k of ['parts_cost', 'parts_receipts', 'admin_photos', 'stripe_customer_id', 'signed_ip', 'customer_id']) assert.ok(!(k in job), k);
  } finally { globalThis.fetch = saved; }
});
