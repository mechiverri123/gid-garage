// The warranty is 30 days and has one source of wording. These fail if a longer
// period, an automatic refund, or a second copy of the wording sneaks in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARRANTY_POLICY, WARRANTY_SHORT, WARRANTY_FAQ, WARRANTY_DISCLAIMER, OLDER_VEHICLES, DIAGNOSTIC_SHORT, warrantyEmailHtml } from '../shared/warranty-policy.js';
import { ESTIMATE_TERMS_CORE, ESTIMATE_TERMS_EXTENDED, estimateTermsFor } from '../shared/estimate-terms.js';
import { HOME_PAGE, AUTO_REPAIR } from '../shared/site-pages.js';

const everything = JSON.stringify({ WARRANTY_POLICY, WARRANTY_SHORT, WARRANTY_FAQ, WARRANTY_DISCLAIMER, OLDER_VEHICLES, DIAGNOSTIC_SHORT, core: ESTIMATE_TERMS_CORE, extended: ESTIMATE_TERMS_EXTENDED });

test('no warranty period other than 30 days', () => {
  // "18 years of age" is the signer's age, not a warranty period.
  const periods = (everything.match(/\b\d+[- ](?:day|month|year)s?\b/gi) ?? []).map(p => p.toLowerCase()).filter(p => p !== '18 years');
  assert.ok(periods.length > 0);
  for (const p of periods) assert.match(p, /^30[- ]days?$/);
  assert.doesNotMatch(everything, /lifetime|money.?back|satisfaction guarantee/i);
});

test('required limits are stated', () => {
  assert.match(everything, /does not include automatic refunds, replacement vehicles, towing, rental vehicles/);
  assert.match(WARRANTY_DISCLAIMER, /merchantability/);
  assert.equal(OLDER_VEHICLES.title, 'Older Vehicles and Pre-Existing Conditions');
  // Blanket excuses are out: responsibility for actual damage stays where the law requires.
  assert.match(JSON.stringify(WARRANTY_POLICY), /remain responsible for that damage where the law requires/);
  assert.match(JSON.stringify(OLDER_VEHICLES), /remain responsible for damage caused by our defective workmanship or negligence/);
});

test('another mechanic inspecting does not void it, and there is no fixed reporting deadline', () => {
  assert.match(JSON.stringify(WARRANTY_POLICY), /does not by itself void this warranty/);
  assert.doesNotMatch(everything, /within \d+ days/i);
  assert.doesNotMatch(ESTIMATE_TERMS_EXTENDED.join(' '), /Warranty is void/);
});

test('short statement reaches emails and the FAQ matches index.html', () => {
  assert.match(warrantyEmailHtml(), /terms#warranty/);
  assert.ok(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes(WARRANTY_FAQ));
  assert.ok(JSON.stringify([HOME_PAGE, AUTO_REPAIR]).includes(WARRANTY_FAQ));
});

test('estimates signed earlier keep their old warranty wording', () => {
  const old = estimateTermsFor({ customerAgreed: true, signedAt: '2026-11-07T00:20:00Z' });
  assert.ok(old.extended.some(t => t.startsWith('Parts carry manufacturer warranty.')));
  assert.equal(old.core.includes(WARRANTY_SHORT), false);
  const current = estimateTermsFor({ customerAgreed: true, signedAt: '2026-11-08T00:00:00Z' });
  assert.ok(current.core.includes(WARRANTY_SHORT));
  assert.equal(current.extended.some(t => t.startsWith('Parts carry manufacturer warranty.')), false);
});
