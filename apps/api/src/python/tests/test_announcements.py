import sys
import unittest
from pathlib import Path

PYTHON_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from finance_bridge.announcements import classify_announcement  # noqa: E402


class AnnouncementClassificationTest(unittest.TestCase):
    def test_collapses_routine_share_disclosures(self):
        result = classify_announcement("翌日披露报表 - 已发行股份变动及股份购回")
        self.assertEqual(result["category"], "例行披露")
        self.assertEqual(result["importance"], "routine")
        self.assertTrue(result["isRoutine"])

    def test_identifies_financing_and_risk_events(self):
        financing = classify_announcement("根据全球中期票据计划完成发行24.5亿美元票据")
        risk = classify_announcement("关于重大诉讼及资产减值风险提示的公告")
        self.assertEqual(financing["category"], "融资债务")
        self.assertEqual(financing["importance"], "high")
        self.assertEqual(risk["category"], "风险事项")
        self.assertEqual(risk["importance"], "high")


if __name__ == "__main__":
    unittest.main()
