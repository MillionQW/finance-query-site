"""Normalize the latest disclosures embedded in Futu's public HK revenue page."""
import hashlib
import json
import re
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

import requests

PROVIDER = 'futu-hk-revenue'
SOURCE = '富途收入构成'
GROUPS = {'1': '产品', '4': '地区', '8': '业务'}
CURRENCIES = {
    '人民币': 'CNY', '港元': 'HKD', '港币': 'HKD', '美元': 'USD',
    '新加坡元': 'SGD', '新元': 'SGD', '欧元': 'EUR', '英镑': 'GBP',
    '日元': 'JPY', '澳元': 'AUD', '加元': 'CAD', '澳门元': 'MOP',
}
REPORT_MONTHS = {7: 12, 5: 6, 1: 3, 6: 9}
AMOUNT_SCALES = {'万亿': 1e4, '亿': 1, '万': 1e-4, '千': 1e-5, '': 1e-8}
DISPLAY_NUMBER = re.compile(r'(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(万亿|亿|万|千|%)?')


def report_period(group):
    label = group['date']
    report, = (item for item in group['screenDates'] if item['showName'] == label)
    end = datetime.fromtimestamp(report['date'], timezone(timedelta(hours=8))).date()
    months = REPORT_MONTHS[report['statementType']]
    if end.day != monthrange(end.year, end.month)[1]:
        raise ValueError('无法确认非月末报告的起始日')
    year, month = divmod(end.year * 12 + end.month - months, 12)
    return date(year, month + 1, 1).isoformat(), end.isoformat()


def normalize_hk_business(html, symbol, url, fetched_at):
    state = re.search(r'<script>\s*window\.__INITIAL_STATE__\s*=\s*', html)
    if not state:
        raise ValueError('富途收入构成页面结构异常')
    payload, _ = json.JSONDecoder().raw_decode(html, state.end())
    stock = payload['stock_info']
    if stock['stockCode'] != symbol or stock['marketLabel'] != 'HK':
        raise ValueError('富途收入构成证券代码不匹配')
    composition = payload['financial']['composition']
    if not isinstance(composition, dict) or not composition.keys() & GROUPS.keys():
        raise ValueError('富途收入构成分类无法识别')

    observations = {}
    source_rows = skipped = 0
    for group_id, dimension in GROUPS.items():
        if group_id not in composition:
            continue
        group = composition[group_id]
        items = group['priceItem']
        if not isinstance(items, list):
            raise ValueError('富途收入构成明细结构异常')
        source_rows += len(items)
        if not items:
            continue
        try:
            start, end = report_period(group)
        except (KeyError, ValueError, TypeError, OverflowError, OSError):
            skipped += len(items)
            continue
        currency_name = group['currency']
        currency = CURRENCIES.get(currency_name, '')
        if not currency and re.fullmatch(r'[A-Z]{3}', currency_name):
            currency = currency_name
        for item in items:
            segment = item['name'].strip()
            if not segment or segment == '--' or len(segment) > 100:
                skipped += 1
                continue
            for field, metric, unit in (
                ('mainOperIncome', '收入', '亿元'), ('ratio', '收入占比（源披露）', '%'),
            ):
                raw = item.get(field)
                if raw in (None, '', '-', '--'):
                    continue
                match = DISPLAY_NUMBER.fullmatch(str(raw).strip())
                scales = AMOUNT_SCALES if unit == '亿元' else {'%': 1}
                if not match or (match[2] or '') not in scales or (unit == '亿元' and not currency):
                    skipped += 1
                    continue
                raw_unit = match[2] or '元'
                value = float(match[1].replace(',', '')) * scales[match[2] or '']
                if abs(value) > 1e15:
                    skipped += 1
                    continue
                key = hashlib.sha256(json.dumps([symbol, start, end, group_id, segment, field], ensure_ascii=False).encode()).hexdigest()
                record = dict(
                    dimension=dimension, segment=segment, metric=metric, unit=unit, currency=currency,
                    basis=f'{SOURCE}·{dimension}·财年累计', periodStart=start, periodEnd=end, value=value,
                    sourceText=f'{SOURCE} · {group["date"]}（二次整理）', sourceUrl=url,
                    page='数据源未提供原报告页码', archived=False,
                    note='按来源显示精度记录；收入使用报告原币，期间按财年累计。分部重分类及追溯重述请核对原报告。',
                    origin=dict(provider=PROVIDER, key=key, fetchedAt=fetched_at, rawField=field,
                                rawValue=match[1], rawUnit=raw_unit, rawRecord={**item, 'currency': currency_name,
                                'reportPeriod': group['date'], 'classification': group_id}, managed=True, missing=False),
                )
                if key in observations and observations[key]['value'] != value:
                    raise ValueError('同一港股分部期间存在冲突数值')
                observations[key] = record
    if source_rows and not observations:
        raise ValueError('富途收入构成明细无法识别')
    return dict(observations=list(observations.values()), fetchedAt=fetched_at, sourceRows=source_rows, skipped=skipped)


def fetch_hk_business(symbol):
    symbol = symbol.zfill(5)
    if not re.fullmatch(r'[0-9]{5}', symbol):
        raise ValueError('无效的港股代码')
    url = f'https://www.futunn.com/stock/{symbol}-HK/financials-revenue'
    response = requests.get(url, timeout=(5, 25))
    response.raise_for_status()
    return normalize_hk_business(response.text, symbol, url, datetime.now(timezone.utc).isoformat())
