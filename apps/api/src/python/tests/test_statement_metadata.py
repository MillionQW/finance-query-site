import sys
import unittest
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finance_bridge.statement_metadata import statement_metadata
from finance_bridge.periods import normalize_period_report_dataframe

class StatementMetadataTest(unittest.TestCase):
    def test_hk_listing_does_not_imply_hkd(self):
        self.assertIsNone(statement_metadata('hk', [])['reportingCurrency'])
        result = statement_metadata('hk', [pd.DataFrame({'CURRENCY': ['人民币']})])
        self.assertEqual(result['reportingCurrency'], 'CNY')
        self.assertIsNone(result['amountScale'])

    def test_conflicting_currencies_are_not_silently_combined(self):
        result = statement_metadata('hk', [pd.DataFrame({'CURRENCY': ['CNY', 'HKD']})])
        self.assertIsNone(result['reportingCurrency'])
        self.assertIn('差异', result['currencyNote'])

    def test_report_start_dates_survive_normalization(self):
        frame = pd.DataFrame([{'REPORT_DATE': '2025-03-31', 'START_DATE': '2024-04-01', 'STD_ITEM_NAME': '营业收入', 'AMOUNT': 100}])
        table = normalize_period_report_dataframe(frame, 'income', '利润表', 20)
        self.assertEqual(table['periodStarts'], {'2025-03-31': '2024-04-01'})

if __name__ == '__main__':
    unittest.main()
