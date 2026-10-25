import argparse
import io
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finance_bridge import statements as s
from finance_bridge.request_trace import trace_requests


class StatementStreamingTest(unittest.TestCase):
    def test_history_batches_run_concurrently_and_emit_fast_batch(self):
        release = threading.Event()
        batches = []
        def get_json(url, params):
            if 'DateAjax' in url:
                return {'data': [{'REPORT_DATE': f'{year}-12-31'} for year in range(2025, 2019, -1)]}
            if params['dates'].startswith('2025'):
                self.assertTrue(release.wait(3), 'Batch fetch was serial')
            return {'data': [{'REPORT_DATE': date, 'TOTAL_ASSETS': 100} for date in params['dates'].split(',')]}
        def on_batch(frame):
            batches.append(frame)
            release.set()
        with patch.object(s, 'eastmoney_get_json', side_effect=get_json):
            result = s.call_a_report('balance', 'SH600809', '4', None, on_batch)
        self.assertEqual(len(batches[0]), 1)
        self.assertEqual(len(result), 6)

    def test_fast_table_is_emitted_before_slow_table_finishes(self):
        released = threading.Event()
        final = []
        messages = []

        class Output(io.StringIO):
            def write(self, value):
                if value.startswith('{'):
                    message = json.loads(value)
                    messages.append(message)
                    if message['data']['tables'][0]['rows']:
                        released.set()
                return super().write(value)

        def report(key, symbol, company_type, listing, on_batch):
            if key != 'balance':
                self.assertTrue(released.wait(3), 'Slow tables blocked initial display')
            frame = s.pd.DataFrame([{'REPORT_DATE': '2025-12-31', 'TOTAL_ASSETS': 100, 'SECURITY_NAME_ABBR': '测试'}])
            on_batch(frame)
            return frame

        args = argparse.Namespace(market='a', symbol='600809', years=0, stream=True)
        with patch.object(s, 'extract_listing_year', return_value=1994), \
             patch.object(s, 'get_a_company_type', return_value='4'), \
             patch.object(s, 'call_a_report', side_effect=report), \
             patch.object(s, 'REAL_STDOUT', Output()), \
             patch.object(s, 'emit', side_effect=final.append):
            s._fetch_statements(args, lambda *a, **k: None)
        self.assertTrue(messages[0]['data']['loading'])
        self.assertTrue(messages[0]['data']['partial'])
        self.assertFalse(final[0]['loading'])
        self.assertFalse(final[0]['partial'])
        self.assertEqual(len(final[0]['tables']), 3)

    def test_failed_table_does_not_discard_successful_table(self):
        frame = s.pd.DataFrame([{'REPORT_DATE': '2025-12-31', 'TOTAL_ASSETS': 100}])
        def report(key, *args):
            if key != 'balance':
                raise TimeoutError('slow upstream')
            return frame
        final = []
        with patch.object(s, 'extract_listing_year', return_value=1994), \
             patch.object(s, 'get_a_company_type', return_value='4'), \
             patch.object(s, 'call_a_report', side_effect=report), \
             patch.object(s, 'emit', side_effect=final.append):
            s._fetch_statements(argparse.Namespace(market='a', symbol='600809', years=0), lambda *a, **k: None)
        self.assertTrue(final[0]['partial'])
        self.assertEqual(len(final[0]['fetchWarnings']), 2)
        self.assertTrue(final[0]['tables'][0]['rows'])

    def test_request_logs_include_duration_and_hide_credentials(self):
        response = s.requests.Response()
        response.status_code = 200
        response._content = b'{}'
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(s.requests.sessions.Session, 'request', return_value=response) as request:
                with trace_requests('a', '600809', folder):
                    s.requests.get('https://example.com/report?token=secret', params={'dates': '2025-12-31'}, headers={'Authorization': 'secret'})
            content = next(Path(folder).glob('*.jsonl')).read_text(encoding='utf-8')
            self.assertNotIn('secret', content)
            entries = [json.loads(line) for line in content.splitlines()]
            finished = next(row for row in entries if row['event'] == 'request_finished')
            self.assertIn('durationMs', finished)
            self.assertEqual(finished['params']['dates'], '2025-12-31')
            self.assertEqual(request.call_args.kwargs['timeout'], (5, 15))


if __name__ == '__main__':
    unittest.main()
