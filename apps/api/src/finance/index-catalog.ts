import { IndexMarket } from './index.types';

export interface IndexCatalogItem {
  market: IndexMarket;
  symbol: string;
  displaySymbol: string;
  name: string;
  category: string;
  historySymbol: string;
}

export const INDEX_CATALOG: IndexCatalogItem[] = [
  { market: 'cn', symbol: '000001', displaySymbol: '000001.SH', name: '上证指数', category: '核心宽基', historySymbol: 'sh000001' },
  { market: 'cn', symbol: '000300', displaySymbol: '000300.CSI', name: '沪深300', category: '核心宽基', historySymbol: 'csi000300' },
  { market: 'cn', symbol: '000905', displaySymbol: '000905.CSI', name: '中证500', category: '核心宽基', historySymbol: 'csi000905' },
  { market: 'cn', symbol: '000852', displaySymbol: '000852.CSI', name: '中证1000', category: '核心宽基', historySymbol: 'csi000852' },
  { market: 'cn', symbol: '000510', displaySymbol: '000510.CSI', name: '中证A500', category: '核心宽基', historySymbol: 'csi000510' },
  { market: 'cn', symbol: '399001', displaySymbol: '399001.SZ', name: '深证成指', category: '成长与科技', historySymbol: 'sz399001' },
  { market: 'cn', symbol: '399006', displaySymbol: '399006.SZ', name: '创业板指', category: '成长与科技', historySymbol: 'sz399006' },
  { market: 'cn', symbol: '000688', displaySymbol: '000688.SH', name: '科创50', category: '成长与科技', historySymbol: 'sh000688' },
  { market: 'bj', symbol: '899050', displaySymbol: '899050.BJ', name: '北证50', category: '北交所', historySymbol: 'bj899050' },
  { market: 'hk', symbol: 'HSI', displaySymbol: 'HSI.HK', name: '恒生指数', category: '港股', historySymbol: 'HSI' },
  { market: 'hk', symbol: 'HSTECH', displaySymbol: 'HSTECH.HK', name: '恒生科技指数', category: '港股', historySymbol: 'HSTECH' },
  { market: 'hk', symbol: 'HSCEI', displaySymbol: 'HSCEI.HK', name: '恒生中国企业指数', category: '港股', historySymbol: 'HSCEI' }
];

export function findIndex(market: string, symbol: string): IndexCatalogItem | undefined {
  return INDEX_CATALOG.find((item) => item.market === market && item.symbol.toUpperCase() === symbol.toUpperCase());
}
