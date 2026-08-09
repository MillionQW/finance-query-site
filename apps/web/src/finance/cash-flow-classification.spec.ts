import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CASH_FLOW_CLASSIFICATIONS,
  cashFlowClassificationByCode,
  classifyCashFlows
} from './cash-flow-classification';

test('cash-flow signs cover all eight enterprise classifications', () => {
  const inputs = [
    [1, 1, 1],
    [1, 1, -1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, -1, -1],
    [-1, -1, 1],
    [-1, 1, -1],
    [-1, 1, 1]
  ] as const;

  assert.equal(CASH_FLOW_CLASSIFICATIONS.length, 8);
  assert.deepEqual(
    inputs.map(([operating, investing, financing]) => classifyCashFlows(operating, investing, financing)?.code),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
  assert.equal(cashFlowClassificationByCode(7)?.companyType, '混吃等死型');
  assert.equal(cashFlowClassificationByCode(8)?.note, '亦可能是妖精型');
});

test('cash-flow classification requires three non-zero net amounts', () => {
  assert.equal(classifyCashFlows(null, 1, 1), null);
  assert.equal(classifyCashFlows(1, 0, -1), null);
});
