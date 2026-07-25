import sys
import unittest
from pathlib import Path

import pandas as pd

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from finance_bridge.periods import (  # noqa: E402
    build_ttm_highlights,
    merge_report_periods,
    normalize_period_report_dataframe,
)


class PeriodAnalysisTest(unittest.TestCase):
    def test_normalizes_reporting_periods_without_collapsing_them_to_years(self):
        frame = pd.DataFrame(
            [
                {
                    "REPORT_DATE": "2025-09-30",
                    "TOTAL_OPERATE_INCOME": 90,
                    "NETPROFIT": 18,
                },
                {
                    "REPORT_DATE": "2024-12-31",
                    "TOTAL_OPERATE_INCOME": 100,
                    "NETPROFIT": 20,
                },
                {
                    "REPORT_DATE": "2024-09-30",
                    "TOTAL_OPERATE_INCOME": 70,
                    "NETPROFIT": 14,
                },
            ]
        )

        table = normalize_period_report_dataframe(
            frame, "income", "利润表", periods_limit=20
        )

        self.assertEqual(
            table["periods"],
            ["2025-09-30", "2024-12-31", "2024-09-30"],
        )
        revenue = next(
            row for row in table["rows"] if row["sourceItem"] == "TOTAL_OPERATE_INCOME"
        )
        self.assertEqual(revenue["values"]["2025-09-30"], 90)

    def test_builds_ttm_from_current_ytd_prior_annual_and_prior_ytd(self):
        frame = pd.DataFrame(
            [
                {"REPORT_DATE": "2025-09-30", "TOTAL_OPERATE_INCOME": 90},
                {"REPORT_DATE": "2024-12-31", "TOTAL_OPERATE_INCOME": 100},
                {"REPORT_DATE": "2024-09-30", "TOTAL_OPERATE_INCOME": 70},
            ]
        )
        table = normalize_period_report_dataframe(
            frame, "income", "利润表", periods_limit=20
        )
        empty = {"type": "balance", "title": "资产负债表", "periods": [], "rows": []}
        cashflow = {"type": "cashflow", "title": "现金流量表", "periods": [], "rows": []}
        period_meta = merge_report_periods(
            [empty, table, cashflow], ["2024-12-31"], 20
        )
        periods = [period["key"] for period in period_meta]

        ttm = build_ttm_highlights(
            [empty, table, cashflow], periods, ["2024-12-31"]
        )
        revenue = next(series for series in ttm if series["key"] == "revenue")
        latest = next(
            point for point in revenue["points"] if point["period"] == "2025-09-30"
        )

        self.assertEqual(latest["value"], 120)
        self.assertEqual(period_meta[0]["priorYearKey"], "2024-09-30")


if __name__ == "__main__":
    unittest.main()
