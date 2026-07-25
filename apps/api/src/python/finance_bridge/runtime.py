import argparse
import contextlib
import json
import math
import re
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlencode

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

REAL_STDOUT = sys.stdout

try:
    import akshare as ak
    import pandas as pd
    import requests
except Exception as exc:  # pragma: no cover - surfaced to NestJS
    print(
        json.dumps(
            {
                "ok": False,
                "error": {
                    "code": "AKSHARE_IMPORT_FAILED",
                    "message": "无法导入 AKShare，请先安装 Python 依赖。",
                    "detail": str(exc),
                },
            },
            ensure_ascii=False,
        )
    )
    sys.exit(0)
