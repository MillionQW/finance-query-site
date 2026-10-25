import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finance_bridge import search


class SearchIsolationTest(unittest.TestCase):
    def test_selected_source_does_not_request_other_exchanges(self):
        sz = search.pd.DataFrame({"A股代码": [707], "A股简称": ["双环科技"]})
        with patch.object(search.ak, "stock_info_sz_name_code", return_value=sz), \
             patch.object(search.ak, "stock_info_sh_name_code") as sh, \
             patch.object(search.ak, "stock_info_bj_name_code") as bj:
            self.assertEqual(search.search_a_shares("双环", source="sz")[0]["symbol"], "000707")
        sh.assert_not_called()
        bj.assert_not_called()

    def test_beijing_failure_preserves_shenzhen_result(self):
        sz = search.pd.DataFrame({"A股代码": [707], "A股简称": ["双环科技"]})
        sh = search.pd.DataFrame({"证券代码": ["600000"], "证券简称": ["浦发银行"]})
        with patch.object(search.ak, "stock_info_sz_name_code", return_value=sz), \
             patch.object(search.ak, "stock_info_sh_name_code", return_value=sh), \
             patch.object(search.ak, "stock_info_bj_name_code", side_effect=TimeoutError("timeout")):
            result = search.search_a_shares("双环科技")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["symbol"], "000707")

    def test_other_exchange_failures_preserve_beijing_result(self):
        bj = search.pd.DataFrame({"证券代码": ["920001"], "证券简称": ["测试股票"]})
        with patch.object(search.ak, "stock_info_sz_name_code", side_effect=TimeoutError), \
             patch.object(search.ak, "stock_info_sh_name_code", side_effect=TimeoutError), \
             patch.object(search.ak, "stock_info_bj_name_code", return_value=bj):
            self.assertEqual(search.search_a_shares("测试")[0]["symbol"], "920001")

    def test_all_sources_failing_reports_error(self):
        with patch.object(search.ak, "stock_info_sz_name_code", side_effect=TimeoutError), \
             patch.object(search.ak, "stock_info_sh_name_code", side_effect=TimeoutError), \
             patch.object(search.ak, "stock_info_bj_name_code", side_effect=TimeoutError):
            with self.assertRaisesRegex(RuntimeError, "全部 A 股数据源获取失败"):
                search.search_a_shares("双环科技")


if __name__ == "__main__":
    unittest.main()
