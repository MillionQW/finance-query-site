"""A-share segment observations from the same public source as stock_zygc_em.

Keep the source record and field names; 主营利润 is not operating profit.
The source's monetary convention is RMB yuan, ratios are fractions, periods
are calendar-year cumulative disclosures. No total is inferred from segments.
"""
import hashlib
import json
import math
from datetime import date, datetime, timezone
import requests
from .common import emit

PROVIDER = 'eastmoney-zygc'
ENDPOINT = 'https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax'
FIELDS = {
    'MAIN_BUSINESS_INCOME': ('收入', '亿元', 1e-8, '元'),
    'MAIN_BUSINESS_COST': ('成本', '亿元', 1e-8, '元'),
    'MAIN_BUSINESS_RPOFIT': ('主营利润', '亿元', 1e-8, '元'),
    'GROSS_RPOFIT_RATIO': ('毛利率', '%', 100, '小数比例'),
    'MBI_RATIO': ('收入占比（源披露）', '%', 100, '小数比例'),
}


def normalize_business(rows, symbol, fetched_at):
    exchange = 'SH' if symbol.startswith('6') else 'SZ' if symbol.startswith(('0', '3')) else 'BJ'
    url = f'https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/Index?type=web&code={exchange}{symbol}'
    observations = {}
    skipped = 0
    for raw in rows:
        try:
            end = str(raw['REPORT_DATE'])[:10]
            date.fromisoformat(end)
            classification = str(raw['MAINOP_TYPE'])
            dimension, label = {'1': ('业务', '按行业分类'), '2': ('产品', '按产品分类'), '3': ('地区', '按地区分类')}[classification]
            segment = str(raw['ITEM_NAME']).strip()
            if not segment or str(raw['SECURITY_CODE']).zfill(6) != symbol or end[5:] not in ('03-31', '06-30', '09-30', '12-31'):
                raise ValueError('Unknown period or identity')
        except (KeyError, ValueError, TypeError):
            skipped += 1
            continue
        for field, (metric, unit, scale, raw_unit) in FIELDS.items():
            value = raw.get(field)
            # None / blank / placeholders are never coerced to zero.
            if value is None or isinstance(value, bool) or str(value).strip() in ('', '-', '--'):
                continue
            try:
                numeric = float(value)
                if not math.isfinite(numeric) or abs(numeric * scale) > 1e15:
                    raise ValueError('Invalid magnitude')
            except (ValueError, TypeError):
                skipped += 1
                continue
            key = hashlib.sha256(json.dumps([symbol, end, classification, segment, field], ensure_ascii=False).encode()).hexdigest()
            record = dict(
                dimension=dimension, segment=segment, metric=metric, unit=unit, currency='CNY',
                basis=f'东财主营构成·{label}·年初累计', periodStart=f'{end[:4]}-01-01', periodEnd=end,
                value=numeric * scale, sourceText=f'东方财富主营构成 · {end}（二次整理）', sourceUrl=url,
                page='数据源未提供原报告页码', archived=False,
                note='金额按该A股接口人民币元口径换算为亿元；比例由小数转为百分数。期间按自然年年初累计；分部重分类、内部交易及追溯重述请核对原报告。主营利润保留源字段含义，不等同营业利润。',
                origin=dict(provider=PROVIDER, key=key, fetchedAt=fetched_at, rawField=field,
                            rawValue=value, rawUnit=raw_unit, rawRecord=raw, managed=True, missing=False),
            )
            if key in observations and observations[key]['value'] != record['value']:
                raise ValueError('同一分部期间存在冲突数值，停止导入以免误用')
            observations[key] = record
    return list(observations.values()), skipped


def handle_business(args):
    symbol = args.symbol.zfill(6)
    if args.market != 'a' or not symbol.isdigit() or len(symbol) != 6:
        raise ValueError('当前自动分业务数据仅支持A股')
    code = ('SH' if symbol.startswith('6') else 'SZ' if symbol.startswith(('0', '3')) else 'BJ') + symbol
    response = requests.get(ENDPOINT, params={'code': code}, timeout=(5, 25))
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get('zygcfx'), list):
        raise ValueError('主营构成接口结构异常')
    fetched_at = datetime.now(timezone.utc).isoformat()
    rows, skipped = normalize_business(payload['zygcfx'], symbol, fetched_at)
    if payload['zygcfx'] and not rows:
        raise ValueError('主营构成数据无法识别，原有记录保留')
    emit({'observations': rows, 'fetchedAt': fetched_at, 'sourceRows': len(payload['zygcfx']), 'skipped': skipped})
