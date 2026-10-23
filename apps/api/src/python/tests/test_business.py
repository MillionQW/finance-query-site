import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finance_bridge.business import normalize_business

ROW = dict(SECURITY_CODE='600519', REPORT_DATE='2025-06-30 00:00:00', MAINOP_TYPE='2', ITEM_NAME='产品A',
           MAIN_BUSINESS_INCOME=1200000000, MAIN_BUSINESS_COST=0, MAIN_BUSINESS_RPOFIT=None,
           GROSS_RPOFIT_RATIO=0.45, MBI_RATIO=0.6)

class BusinessTest(unittest.TestCase):
    def test_units_zero_missing_and_source_evidence(self):
        rows, skipped = normalize_business([ROW], '600519', '2026-01-01T00:00:00Z')
        metrics = {r['metric']: r for r in rows}
        self.assertEqual(skipped, 0)
        self.assertEqual(metrics['收入']['value'], 12)
        self.assertEqual(metrics['成本']['value'], 0)
        self.assertNotIn('主营利润', metrics)
        self.assertEqual(metrics['毛利率']['value'], 45)
        self.assertEqual(metrics['收入占比（源披露）']['value'], 60)
        self.assertEqual(metrics['收入']['periodStart'], '2025-01-01')
        self.assertEqual(metrics['收入']['origin']['rawRecord'], ROW)
        self.assertEqual(metrics['收入']['origin']['rawUnit'], '元')

    def test_identity_deduplication_and_conflicting_duplicates(self):
        first, _ = normalize_business([ROW, ROW], '600519', 'first')
        next_rows, _ = normalize_business([{**ROW, 'MAIN_BUSINESS_INCOME': 1300000000}], '600519', 'next')
        self.assertEqual(first[0]['origin']['key'], next_rows[0]['origin']['key'])
        with self.assertRaises(ValueError):
            normalize_business([ROW, {**ROW, 'MAIN_BUSINESS_INCOME': 1}], '600519', 'next')

    def test_wrong_company_unknown_category_invalid_dates_and_missing_values(self):
        for patch in [{'SECURITY_CODE': '000001'}, {'MAINOP_TYPE': '4'}, {'REPORT_DATE': '2025-02-30'}, {'REPORT_DATE': '2025-05-31'}]:
            rows, skipped = normalize_business([{**ROW, **patch}], '600519', 'now')
            self.assertEqual(rows, [])
            self.assertEqual(skipped, 1)
        rows, _ = normalize_business([{**ROW, 'MAIN_BUSINESS_INCOME': '--', 'MAIN_BUSINESS_COST': float('inf')}], '600519', 'now')
        self.assertNotIn('收入', [r['metric'] for r in rows])
        self.assertNotIn('成本', [r['metric'] for r in rows])

if __name__ == '__main__':
    unittest.main()
