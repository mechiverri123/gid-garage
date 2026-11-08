// A signed estimate must show the wording in force when it was signed, so nobody
// appears to have agreed to a clause added after their signature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTIMATE_TERMS_CORE, PPI_TERMS, estimateTermsFor } from '../shared/estimate-terms.js';

const signed = signedAt => ({ customerAgreed: true, signedAt });
const hasMedia = terms => terms.core.some(t => t.startsWith('PHOTOS, VIDEO, AND AUDIO'));
const hasTos = terms => terms.core.some(t => t.includes('gidgarage.com/terms'));

test('unsigned estimates get the current terms', () => {
  assert.deepEqual(estimateTermsFor({ customerAgreed: false, signedAt: null }).core, ESTIMATE_TERMS_CORE);
  assert.equal(hasMedia(estimateTermsFor(null)), true);
});

test('signed estimates keep the version in force at signing', () => {
  const v1 = estimateTermsFor(signed('2026-09-17T20:00:00Z'));
  assert.equal(hasTos(v1), false);
  assert.equal(hasMedia(v1), false);

  const v2 = estimateTermsFor(signed('2026-11-05T20:00:00Z'));
  assert.equal(hasTos(v2), true);
  assert.equal(hasMedia(v2), false);

  const v3 = estimateTermsFor(signed('2026-11-08T20:00:00Z'));
  assert.equal(hasTos(v3), true);
  assert.equal(hasMedia(v3), true);
});

test('a signed job with no timestamp never claims later consent', () => {
  assert.equal(hasMedia(estimateTermsFor(signed(null))), false);
  assert.equal(hasTos(estimateTermsFor(signed(null))), false);
});

test('only a pre-purchase inspection gets the inspection terms, and the buyer signs them', () => {
  const ppi = estimateTermsFor({ service: 'ppi', customerAgreed: false });
  assert.deepEqual(ppi.core.slice(0, PPI_TERMS.length), PPI_TERMS);
  assert.ok(ppi.all.includes(PPI_TERMS[1]));
  assert.equal(estimateTermsFor({ service: 'oil', customerAgreed: false }).core.includes(PPI_TERMS[0]), false);
});
