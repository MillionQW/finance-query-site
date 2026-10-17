import assert from 'node:assert/strict';
import test from 'node:test';
import { isBuyPointDue } from './company-insight';

test('buy point reminder starts exactly six calendar months after setting', () => {
  const saved = new Date(2026, 0, 17, 12).toISOString();
  const due = new Date(2026, 6, 17, 12).getTime();
  assert.equal(isBuyPointDue('85–95 元', saved, due - 1), false);
  assert.equal(isBuyPointDue('85–95 元', saved, due), true);
  assert.equal(isBuyPointDue('', saved, due), false);
  assert.equal(isBuyPointDue('85–95 元', null, due), false);
  assert.equal(isBuyPointDue('85–95 元', 'invalid', due), false);
});

test('six months from August 31 is clamped to the last day of February', () => {
  const saved = new Date(2025, 7, 31, 12).toISOString();
  const due = new Date(2026, 1, 28, 12).getTime();
  assert.equal(isBuyPointDue('85–95 元', saved, due - 1), false);
  assert.equal(isBuyPointDue('85–95 元', saved, due), true);
});
