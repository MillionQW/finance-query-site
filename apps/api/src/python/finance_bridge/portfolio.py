"""Bounded single-security quotes, prior year close and official HKD/CNY midpoint.

Tencent history endpoint follows AKShare stock_hist_tx.py. Price returns are
explicitly unadjusted, excluding dividends; missing baselines stay missing.
"""
from datetime import datetime, timedelta, timezone
from io import StringIO
import re
import pandas as pd
import requests
from .common import emit, numeric_or_none

SHANGHAI = timezone(timedelta(hours=8))


def year_return(price, quote_date, rows, year):
    if not price or str(quote_date)[:4] != str(year):
        return None, None
    # Never substitute the first trading day of the current year or IPO price.
    valid = [(str(r[0]), numeric_or_none(r[2])) for r in rows if len(r) > 2
             and f"{year - 1}-12-01" <= str(r[0]) <= f"{year - 1}-12-31"]
    valid = sorted((d, v) for d, v in valid if v is not None and v > 0)
    if not valid:
        return None, None
    date, base = valid[-1]
    return (price / base - 1) * 100, date


def parse_quote(text, ticker, market):
    match = re.search(r'v_' + re.escape(ticker) + r'="([^"]*)"', text)
    parts = match.group(1).split('~') if match else []
    if len(parts) < 46 or parts[2] != ticker[2:]:
        raise ValueError('行情返回缺少对应证券')
    price = numeric_or_none(parts[3])
    if price is None or price <= 0:
        raise ValueError('行情价格无效')
    raw_date = parts[30]
    date = datetime.strptime(raw_date, '%Y/%m/%d %H:%M:%S' if '/' in raw_date else '%Y%m%d%H%M%S')
    cap = numeric_or_none(parts[45]) if market != 'index' else None
    return price, cap if cap and cap > 0 else None, date.replace(tzinfo=SHANGHAI).isoformat()


def fetch_stock(market, symbol, now):
    ticker = ('hk' if market == 'hk' else 'sh' if market == 'index' or symbol.startswith('6')
              else 'bj' if symbol.startswith(('4', '8', '9')) else 'sz') + symbol
    response = requests.get('https://qt.gtimg.cn/q=' + ticker, timeout=10)
    response.raise_for_status()
    response.encoding = 'gbk'
    price, cap, quote_at = parse_quote(response.text, ticker, market)
    ytd, base_date, warning = None, None, None
    try:
        response = requests.get('https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
            params={'param': f'{ticker},day,{now.year - 1}-12-01,{now.year - 1}-12-31,40,'}, timeout=12)
        response.raise_for_status()
        rows = response.json()['data'][ticker].get('day', [])
        ytd, base_date = year_return(price, quote_at, rows, now.year)
        if ytd is None:
            warning = '缺少上年末收盘价或本年度行情，年内涨幅暂不可用'
    except Exception:
        warning = '上年末收盘价获取失败，年内涨幅暂不可用'
    return {'price': price, 'marketCap': cap, 'currency': 'HKD' if market == 'hk' else 'CNY',
        'quoteAt': quote_at, 'year': now.year, 'ytd': ytd, 'baseDate': base_date,
        'source': '腾讯证券 qt.gtimg.cn / 腾讯不复权日线', 'warning': warning}


def fetch_fx(now):
    response = requests.post('https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do',
        data={'startDate': (now - timedelta(days=15)).date().isoformat(),
              'endDate': now.date().isoformat(), 'queryYN': 'true'}, timeout=15)
    response.raise_for_status()
    response.encoding = 'utf-8'
    frame = pd.read_html(StringIO(response.text))[-1]
    column = next(c for c in frame.columns if '港元' in str(c))
    frame['日期'] = pd.to_datetime(frame['日期'], errors='coerce')
    frame = frame.dropna(subset=['日期']).sort_values('日期')
    row = frame.iloc[-1]
    rate = numeric_or_none(row[column])
    if not rate or rate <= 0:
        raise ValueError('港币汇率缺失')
    return {'price': rate / 100, 'marketCap': None, 'currency': 'CNY',
        'quoteAt': row['日期'].date().isoformat(), 'year': now.year, 'ytd': None, 'baseDate': None,
        'source': '国家外汇管理局：人民币汇率中间价（100港元折人民币）', 'warning': None}


def handle_portfolio_market(args):
    now = datetime.now(SHANGHAI)
    value = fetch_fx(now) if args.market == 'fx' else fetch_stock(args.market, args.symbol, now)
    value['fetchedAt'] = datetime.now(timezone.utc).isoformat()
    emit(value)
