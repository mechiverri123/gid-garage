// Line quantities: amount stays the line total, old lines count as 1, labor qty = hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineQty, lineRate, withLine, lineText, jobLaborHours } from '../shared/line-items.js';

test('old lines (no qty) are 1 × their amount; edits keep amount = rate × qty', () => {
  const old = { id: 'a', label: 'Brake pads', amount: 89.5, type: 'parts' };
  assert.deepEqual([lineQty(old), lineRate(old)], [1, 89.5]);
  const two = withLine(old, { qty: 2 });
  assert.deepEqual([two.qty, two.rate, two.amount], [2, 89.5, 179]);
  const labor = withLine({ id: 'l', label: 'Labor', amount: 0, type: 'labor' }, { rate: 135 });
  assert.equal(withLine(labor, { qty: 2.5 }).amount, 337.5);
  assert.equal(withLine({ label: 'x', amount: 0, type: 'parts' }, { qty: 3, rate: 19.99 }).amount, 59.97); // no float drift
});

test('customer text shows a part count when qty is not 1; labor hours stay private', () => {
  assert.equal(lineText({ label: 'Brake pads', amount: 45, type: 'parts' }), 'Brake pads');
  assert.equal(lineText(withLine({ label: 'Labor', amount: 135, type: 'labor' }, { qty: 2.5 })), 'Labor'); // customer sees one labor price
  assert.equal(lineText(withLine({ label: 'Rotor', amount: 60, type: 'parts' }, { qty: 2 })), 'Rotor (×2 @ $60.00)');
});

test('job hours = qty of labor lines that have one; flat labor and parts carry none', () => {
  const items = [
    { label: 'Labor', amount: 270, type: 'labor', qty: 2, rate: 135 },
    { label: 'Diag labor', amount: 67.5, type: 'labor', qty: 0.5, rate: 135 },
    { label: 'Old flat labor', amount: 200, type: 'labor' },
    { label: 'Pads', amount: 90, type: 'parts', qty: 2, rate: 45 },
  ];
  assert.equal(jobLaborHours(items), 2.5);
  assert.equal(jobLaborHours(null), 0);
});
