"""Bounded, structured tracing for all HTTP requests in a statement job."""
import contextlib
import json
import os
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl
import requests

_lock = threading.Lock()
_record = lambda *args, **kwargs: None


def record(event, **fields):
    _record(event, **fields)


@contextlib.contextmanager
def trace_requests(market, symbol, directory=None):
    global _record
    root = Path(__file__).resolve().parents[5]
    directory = Path(directory) if directory else root / 'data' / 'logs'
    directory.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - timedelta(days=14).total_seconds()
    for path in directory.glob('upstream-requests-????-??-??-*.jsonl'):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass
    job_id = os.environ.get('AKSHARE_TRACE_ID') or uuid.uuid4().hex
    started = time.monotonic()

    def log(event, **fields):
        now = datetime.now().astimezone()
        entry = dict(timestamp=now.isoformat(), event=event, jobId=job_id,
                     pid=os.getpid(), market=market, symbol=symbol, **fields)
        try:
            with _lock, (directory / f'upstream-requests-{now:%Y-%m-%d}-{job_id}.jsonl').open('a', encoding='utf-8') as file:
                file.write(json.dumps(entry, ensure_ascii=False) + '\n')
        except OSError:
            pass  # Logging must not prevent financial data from being returned.

    original = requests.sessions.Session.request

    def request(session, method, url, **kwargs):
        request_id = uuid.uuid4().hex
        parts = urlsplit(url)
        params = dict(parse_qsl(parts.query))
        if isinstance(kwargs.get('params'), dict):
            params.update(kwargs['params'])
        # Only log diagnostic identifiers, never headers, credentials or bodies.
        params = {key: str(value)[:500] for key, value in params.items()
                  if key in {'code', 'scode', 'secid', 'dates', 'reportType', 'reportDateType', 'companyType',
                             'reportName', 'filter', 'pageNumber', 'pageSize'}}
        timeout = kwargs.get('timeout')
        if timeout is None:
            kwargs['timeout'] = (5, 15)
        elif isinstance(timeout, (int, float)):
            kwargs['timeout'] = (min(timeout, 5), min(timeout, 15))
        elif isinstance(timeout, tuple):
            kwargs['timeout'] = (min(timeout[0] or 5, 5), min(timeout[1] or 15, 15))
        details = dict(requestId=request_id, method=method.upper(),
                       endpoint=f'{parts.scheme}://{parts.netloc}{parts.path}', params=params)
        log('request_started', **details)
        start = time.monotonic()
        try:
            response = original(session, method, url, **kwargs)
            log('request_finished', **details, durationMs=round((time.monotonic()-start)*1000),
                status=response.status_code, bytes=len(response.content))
            return response
        except Exception as exc:
            log('request_failed', **details, durationMs=round((time.monotonic()-start)*1000),
                errorType=type(exc).__name__)
            raise

    log('job_started')
    _record = log
    requests.sessions.Session.request = request
    try:
        yield log
    except Exception as exc:
        log('job_failed', durationMs=round((time.monotonic()-started)*1000), errorType=type(exc).__name__)
        raise
    else:
        log('job_finished', durationMs=round((time.monotonic()-started)*1000))
    finally:
        requests.sessions.Session.request = original
        _record = lambda *args, **kwargs: None
