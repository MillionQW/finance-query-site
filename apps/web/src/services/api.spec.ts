import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCompanyInsight } from './company-insight';

test('legacy company insights get defaults for structured dossier fields', () => {
  const insight = normalizeCompanyInsight({
    market: 'a',
    symbol: '600519',
    note: '关注现金流',
    buyPointRange: '1300-1400',
    buyPointUpdatedAt: null,
    updatedAt: null
  });

  assert.deepEqual(insight, {
    market: 'a',
    symbol: '600519',
    note: '关注现金流',
    thesis: '',
    risks: '',
    catalysts: '',
    questions: '',
    buyPointRange: '1300-1400',
    buyPointUpdatedAt: null,
    updatedAt: null
  });
});
