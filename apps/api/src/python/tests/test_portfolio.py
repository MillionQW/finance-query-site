import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finance_bridge.portfolio import year_return, parse_quote


class PortfolioTests(unittest.TestCase):
    def test_year_end_baseline_not_first_day(self):
        rows = [['2026-01-02', '0', '120'], ['2025-12-30', '0', '90'], ['2025-12-31', '0', '100']]
        value, date = year_return(150, '2026-10-23', rows, 2026)
        self.assertEqual(value, 50)
        self.assertEqual(date, '2025-12-31')

    def test_missing_new_listing_and_old_year(self):
        self.assertEqual(year_return(100, '2026-01-01', [['2026-01-01', 0, 90]], 2026), (None, None))
        self.assertEqual(year_return(100, '2025-12-31', [['2025-12-31', 0, 90]], 2026), (None, None))

    def test_quote_market_cap_and_identity(self):
        parts = [''] * 46
        parts[2], parts[3], parts[30], parts[45] = '00700', '386', '2026/10/23 16:08:14', '35097.609'
        text = 'v_hk00700="' + '~'.join(parts) + '";'
        self.assertEqual(parse_quote(text, 'hk00700', 'hk'), (386, 35097.609, '2026-10-23T16:08:14+08:00'))
        with self.assertRaises(ValueError):
            parse_quote(text, 'hk09988', 'hk')


if __name__ == '__main__':
    unittest.main()
