import sys
import unittest
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finance_bridge.business import normalize_business
from finance_bridge.business_hk import normalize_hk_business

ROW = dict(SECURITY_CODE='600519', REPORT_DATE='2025-06-30 00:00:00', MAINOP_TYPE='2', ITEM_NAME='产品A',
           MAIN_BUSINESS_INCOME=1200000000, MAIN_BUSINESS_COST=0, MAIN_BUSINESS_RPOFIT=None,
           GROSS_RPOFIT_RATIO=0.45, MBI_RATIO=0.6)

class BusinessTest(unittest.TestCase):
    def test_hk_fiscal_half_year_currency_and_display_units(self):
        end = datetime(2026, 9, 30, tzinfo=timezone(timedelta(hours=8)))
        payload = {
            'stock_info': {'stockCode': '09988', 'marketLabel': 'HK'},
            'financial': {'composition': {'8': {
                'currency': '美元',
                'date': '2027/H1',
                'screenDates': [{'showName': '2027/H1', 'date': int(end.timestamp()), 'statementType': 5}],
                'priceItem': [{'name': '业务A', 'mainOperIncome': '1,250万', 'ratio': '0.5%'}],
            }}},
        }
        html = '<script>window.__INITIAL_STATE__=' + json.dumps(payload) + '</script>'
        result = normalize_hk_business(html, '09988', 'https://example.com', 'now')
        revenue, ratio = result['observations']
        self.assertEqual(result['skipped'], 0)
        self.assertEqual((revenue['periodStart'], revenue['periodEnd']), ('2026-04-01', '2026-09-30'))
        self.assertEqual((revenue['currency'], revenue['value'], revenue['unit']), ('USD', 0.125, '亿元'))
        self.assertEqual(ratio['value'], 0.5)
        self.assertEqual(revenue['origin']['rawRecord']['mainOperIncome'], '1,250万')
        with self.assertRaises(ValueError):
            normalize_hk_business(html, '00700', 'https://example.com', 'now')

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
