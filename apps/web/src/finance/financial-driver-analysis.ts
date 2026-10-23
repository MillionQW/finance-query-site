import type { FinancialStatements, StatementTable } from '../types/finance';
import { freeCashFlowDetails } from './financial-metric-calculation-helpers';
import {
  ACCOUNTS_PAYABLE_ALIASES,
  EQUITY_ALIASES,
  INVENTORY_ALIASES,
  NET_PROFIT_ALIASES,
  OPERATING_CASHFLOW_ALIASES,
  RECEIVABLE_ALIASES,
  REVENUE_ALIASES,
  TOTAL_ASSET_ALIASES
} from './financial-metric-fields';
import {
  growthRate,
  rowValue,
  safeDivide,
} from './financial-metric-engine';

export interface DriverValue {
  label: string;
  current: number | null;
  previous: number | null;
  kind: 'percent' | 'amount' | 'times';
  interpretation: string;
}

export interface WorkingCapitalSignal {
  label: string;
  growth: number | null;
  revenueGap: number | null;
  tone: 'positive' | 'neutral' | 'warning';
  interpretation: string;
}

export interface FinancialDriverAnalysis {
  currentYear: string | null;
  previousYear: string | null;
  dupont: DriverValue[];
  cashBridge: DriverValue[];
  workingCapital: WorkingCapitalSignal[];
  coverage: number;
  caveat: string;
}

function average(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return (current + previous) / 2;
}

function tableOf(statements: FinancialStatements, type: StatementTable['type']): StatementTable | undefined {
  return statements.tables.find((table) => table.type === type);
}

function gapTone(label: string, gap: number | null): WorkingCapitalSignal['tone'] {
  if (gap === null) return 'neutral';
  const materialGap = 0.1 - Number.EPSILON * 10;
  if (label === '应付账款') {
    // Faster payable growth can reflect bargaining power OR payment stress.
    return Math.abs(gap) >= materialGap ? 'warning' : 'neutral';
  }
  return gap <= 0 ? 'positive' : gap >= materialGap ? 'warning' : 'neutral';
}

export function buildFinancialDriverAnalysis(
  statements: FinancialStatements | null
): FinancialDriverAnalysis {
  const years = statements?.years ?? [];
  const currentYear = years[0] ?? null;
  const previousYear = years[1] ?? null;
  const baseYear = years[2] ?? null;
  const unavailable: FinancialDriverAnalysis = {
    currentYear,
    previousYear,
    dupont: [],
    cashBridge: [],
    workingCapital: [],
    coverage: 0,
    caveat: '至少需要两个完整年度和三张报表才能进行驱动拆解。'
  };
  if (!statements || !currentYear || !previousYear) return unavailable;

  const balance = tableOf(statements, 'balance');
  const income = tableOf(statements, 'income');
  const cashflow = tableOf(statements, 'cashflow');
  const revenue = rowValue(income, currentYear, REVENUE_ALIASES);
  const previousRevenue = rowValue(income, previousYear, REVENUE_ALIASES);
  const netProfit = rowValue(income, currentYear, NET_PROFIT_ALIASES);
  const previousNetProfit = rowValue(income, previousYear, NET_PROFIT_ALIASES);
  const assets = rowValue(balance, currentYear, TOTAL_ASSET_ALIASES);
  const previousAssets = rowValue(balance, previousYear, TOTAL_ASSET_ALIASES);
  const baseAssets = baseYear ? rowValue(balance, baseYear, TOTAL_ASSET_ALIASES) : null;
  const equity = rowValue(balance, currentYear, EQUITY_ALIASES);
  const previousEquity = rowValue(balance, previousYear, EQUITY_ALIASES);
  const baseEquity = baseYear ? rowValue(balance, baseYear, EQUITY_ALIASES) : null;
  const operatingCash = rowValue(cashflow, currentYear, OPERATING_CASHFLOW_ALIASES);
  const previousOperatingCash = rowValue(cashflow, previousYear, OPERATING_CASHFLOW_ALIASES);
  const context = { statements, balance, income, cashflow };
  const currentCash = freeCashFlowDetails(context, currentYear);
  const previousCash = freeCashFlowDetails(context, previousYear);
  const capex = currentCash.capitalExpenditure;
  const previousCapex = previousCash.capitalExpenditure;
  const freeCash = currentCash.freeCashFlow;
  const previousFreeCash = previousCash.freeCashFlow;

  const averageAssets = average(assets, previousAssets);
  const previousAverageAssets = average(previousAssets, baseAssets);
  const averageEquity = average(equity, previousEquity);
  const previousAverageEquity = average(previousEquity, baseEquity);
  const netMargin = safeDivide(netProfit, revenue);
  const previousNetMargin = safeDivide(previousNetProfit, previousRevenue);
  const assetTurnover = safeDivide(revenue, averageAssets);
  const previousAssetTurnover = safeDivide(previousRevenue, previousAverageAssets);
  const equityMultiplier = safeDivide(averageAssets, averageEquity);
  const previousEquityMultiplier = safeDivide(previousAverageAssets, previousAverageEquity);
  const roe = (
    netMargin !== null &&
    assetTurnover !== null &&
    equityMultiplier !== null
  ) ? netMargin * assetTurnover * equityMultiplier : null;
  const previousRoe = (
    previousNetMargin !== null &&
    previousAssetTurnover !== null &&
    previousEquityMultiplier !== null
  ) ? previousNetMargin * previousAssetTurnover * previousEquityMultiplier : null;

  const dupont: DriverValue[] = [
    {
      label: '净利率',
      current: netMargin,
      previous: previousNetMargin,
      kind: 'percent',
      interpretation: '利润端：每单位收入最终沉淀的净利润。'
    },
    {
      label: '总资产周转率',
      current: assetTurnover,
      previous: previousAssetTurnover,
      kind: 'times',
      interpretation: '效率端：资产创造收入的速度。'
    },
    {
      label: '权益乘数',
      current: equityMultiplier,
      previous: previousEquityMultiplier,
      kind: 'times',
      interpretation: '杠杆端：资产相对股东权益的放大倍数。'
    },
    {
      label: '杜邦 ROE',
      current: roe,
      previous: previousRoe,
      kind: 'percent',
      interpretation: '净利率 × 总资产周转率 × 权益乘数。'
    }
  ];

  const cashBridge: DriverValue[] = [
    {
      label: '净利润',
      current: netProfit,
      previous: previousNetProfit,
      kind: 'amount',
      interpretation: '利润表起点。'
    },
    {
      label: '经营现金流',
      current: operatingCash,
      previous: previousOperatingCash,
      kind: 'amount',
      interpretation: '经营活动实际回收的现金。'
    },
    {
      label: '资本开支',
      current: capex,
      previous: previousCapex,
      kind: 'amount',
      interpretation: '维持与扩张长期资产的现金投入。'
    },
    {
      label: '自由现金流',
      current: freeCash,
      previous: previousFreeCash,
      kind: 'amount',
      interpretation: '经营现金流减资本开支后的可支配现金。'
    },
    {
      label: '现金含金量',
      current: safeDivide(operatingCash, netProfit),
      previous: safeDivide(previousOperatingCash, previousNetProfit),
      kind: 'times',
      interpretation: '经营现金流 / 净利润，用于观察利润兑现。'
    }
  ];

  const revenueGrowth = growthRate(revenue, previousRevenue);
  const workingCapital = [
    { label: '应收账款', aliases: RECEIVABLE_ALIASES },
    { label: '存货', aliases: INVENTORY_ALIASES },
    { label: '应付账款', aliases: ACCOUNTS_PAYABLE_ALIASES }
  ].map(({ label, aliases }) => {
    const growth = growthRate(
      rowValue(balance, currentYear, aliases),
      rowValue(balance, previousYear, aliases)
    );
    const revenueGap = growth !== null && revenueGrowth !== null ? growth - revenueGrowth : null;
    const tone = gapTone(label, revenueGap);
    const direction = revenueGap === null
      ? '缺少可比数据'
      : `${label}增速${revenueGap >= 0 ? '高于' : '低于'}收入增速 ${Math.abs(revenueGap * 100).toFixed(1)} 个百分点`;
    return {
      label,
      growth,
      revenueGap,
      tone,
      interpretation: direction
    };
  });

  const allValues = [
    ...dupont.flatMap((item) => [item.current, item.previous]),
    ...cashBridge.flatMap((item) => [item.current, item.previous]),
    ...workingCapital.flatMap((item) => [item.growth, item.revenueGap])
  ];
  const coverage = Math.round(
    (allValues.filter((value) => value !== null).length / allValues.length) * 100
  );

  return {
    currentYear,
    previousYear,
    dupont,
    cashBridge,
    workingCapital,
    coverage,
    caveat: baseYear
      ? '杜邦拆解使用平均资产和平均权益；营运资本信号以收入增速为基准。'
      : '缺少第三个年度时，上期周转率和上期杜邦 ROE 不可比。'
  };
}
