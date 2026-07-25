import type { StatementTable } from '../types/finance';
import {
  ACCOUNTS_PAYABLE_ALIASES,
  ADMIN_EXPENSE_ALIASES,
  BEGIN_CASH_EQUIVALENT_ALIASES,
  CASH_ALIASES,
  CASH_EQUIVALENT_INCREASE_ALIASES,
  COMBINED_CAPITAL_EXPENDITURE_ALIASES,
  CURRENT_ASSET_ALIASES,
  CURRENT_LIABILITY_ALIASES,
  CUSTOMER_CASH_RECEIPTS_ALIASES,
  DEDUCTED_NET_PROFIT_ALIASES,
  DEVELOPMENT_EXPENDITURE_ALIASES,
  END_CASH_EQUIVALENT_ALIASES,
  EQUITY_ALIASES,
  FINANCE_EXPENSE_ALIASES,
  FIXED_ASSET_ALIASES,
  FIXED_ASSET_CAPEX_ALIASES,
  GROSS_PROFIT_ALIASES,
  GOODWILL_ALIASES,
  HK_ASSOCIATE_JOINT_VENTURE_GROUPS,
  HK_INVESTMENT_CASH_NET_ALIASES,
  INCOME_TAX_ALIASES,
  INTEREST_BEARING_DEBT_GROUPS,
  INTEREST_EXPENSE_ALIASES,
  INTANGIBLE_ASSET_ALIASES,
  INTANGIBLE_ASSET_CAPEX_ALIASES,
  INVENTORY_ALIASES,
  INVESTMENT_CASH_INFLOW_ALIASES,
  INVESTMENT_CASH_OUTFLOW_ALIASES,
  LONG_TERM_EQUITY_INVESTMENT_ALIASES,
  IMPAIRMENT_ALIASES,
  NET_ASSET_ALIASES,
  NET_PROFIT_ALIASES,
  OPERATING_CASHFLOW_ALIASES,
  OPERATING_COST_ALIASES,
  OPERATING_PROFIT_ALIASES,
  OPERATING_REVENUE_ALIASES,
  RECEIVABLE_ALIASES,
  RESEARCH_EXPENSE_ALIASES,
  REVENUE_ALIASES,
  SELLING_EXPENSE_ALIASES,
  TOTAL_ASSET_ALIASES,
  TOTAL_LIABILITY_ALIASES,
  TOTAL_OPERATING_COST_ALIASES,
  TOTAL_OPERATING_REVENUE_ALIASES,
  TOTAL_PROFIT_ALIASES
} from './financial-metric-fields';
import {
  absoluteValue,
  calculateCashConversionCycle,
  calculateDevelopmentCapitalizationProxy,
  calculateFreeCashFlow,
  calculateIncrementalReturn,
  calculateRollingRatio,
  calculateRollingStatistics,
  findRow,
  findRows,
  formatMetricValue,
  formatRawValue,
  growthGapValue,
  growthRate,
  rowValue,
  safeDivide,
  sumAbsolute,
  toNumber
} from './financial-metric-engine';
import type {
  FormulaDetail,
  FormulaDetails,
  MetricContext,
  MetricDefinition
} from './financial-metric-types';

export function averageBalance(
  context: MetricContext,
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
): number | null {
  if (yearIndex < 0) return null;
  const row = findRow(table, aliases);
  if (!row) return null;

  const current = toNumber(row.values[year]);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row.values[previousYear]) : null;
  if (current === null || previous === null) return null;
  return (current + previous) / 2;
}

export function previousRowValue(
  context: MetricContext,
  table: StatementTable | undefined,
  yearIndex: number,
  aliases: string[]
): number | null {
  const previousYear = context.statements.years[yearIndex + 1];
  return previousYear ? rowValue(table, previousYear, aliases) : null;
}

export function operatingCostDetails(context: MetricContext, year: string) {
  const directCost = rowValue(context.income, year, OPERATING_COST_ALIASES);
  if (directCost !== null) {
    const costAbs = absoluteValue(directCost);
    const rows: FormulaDetail[] = [
      { label: '营业成本/销售成本', value: directCost, note: '直接科目' }
    ];
    if (directCost < 0) {
      rows.push({ label: '营业成本绝对值', value: costAbs });
    }
    return { costAbs, rows };
  }

  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const grossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
  const derivedCost = revenue !== null && grossProfit !== null ? revenue - grossProfit : null;
  const costAbs = absoluteValue(derivedCost);

  return {
    costAbs,
    rows: [
      { label: '营业收入', value: revenue },
      { label: '毛利润', value: grossProfit },
      { label: '推导营业成本', value: derivedCost, note: '营业收入 - 毛利润' }
    ]
  };
}

export function freeCashFlowDetails(context: MetricContext, year: string) {
  const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
  const combinedCapitalExpenditure = rowValue(context.cashflow, year, COMBINED_CAPITAL_EXPENDITURE_ALIASES);
  const fixedAssetCapitalExpenditure = rowValue(context.cashflow, year, FIXED_ASSET_CAPEX_ALIASES);
  const intangibleCapitalExpenditure = rowValue(context.cashflow, year, INTANGIBLE_ASSET_CAPEX_ALIASES);
  const calculated = calculateFreeCashFlow(
    operatingCashflow,
    combinedCapitalExpenditure,
    [fixedAssetCapitalExpenditure, intangibleCapitalExpenditure]
  );
  return {
    operatingCashflow,
    combinedCapitalExpenditure,
    fixedAssetCapitalExpenditure,
    intangibleCapitalExpenditure,
    capitalExpenditure: calculated.capitalExpenditure,
    freeCashFlow: calculated.freeCashFlow
  };
}

export function developmentCapitalizationDetails(context: MetricContext, year: string, yearIndex: number) {
  const currentDevelopmentExpenditure = rowValue(context.balance, year, DEVELOPMENT_EXPENDITURE_ALIASES);
  const previousYear = context.statements.years[yearIndex + 1];
  const previousDevelopmentExpenditure = previousRowValue(
    context,
    context.balance,
    yearIndex,
    DEVELOPMENT_EXPENDITURE_ALIASES
  );
  const researchExpense = absoluteValue(rowValue(context.income, year, RESEARCH_EXPENSE_ALIASES));
  return {
    currentDevelopmentExpenditure,
    previousDevelopmentExpenditure,
    previousYear,
    researchExpense,
    ...calculateDevelopmentCapitalizationProxy(
      currentDevelopmentExpenditure,
      previousDevelopmentExpenditure,
      researchExpense
    )
  };
}

export function rollingCashConversionDetails(context: MetricContext, yearIndex: number, windowSize: number) {
  const years = context.statements.years.slice(yearIndex, yearIndex + windowSize);
  const operatingCashflows = context.statements.years.map((year) => rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES));
  const netProfits = context.statements.years.map((year) => rowValue(context.income, year, NET_PROFIT_ALIASES));
  const calculated = calculateRollingRatio(operatingCashflows, netProfits, yearIndex, windowSize);
  return {
    years,
    operatingCashflowTotal: calculated.numeratorTotal,
    netProfitTotal: calculated.denominatorTotal,
    value: calculated.value
  };
}

export function cashConversionCycleDetails(context: MetricContext, year: string, yearIndex: number) {
  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const cost = operatingCostDetails(context, year);
  const receivable = averageBalanceDetails(context, context.balance, year, yearIndex, RECEIVABLE_ALIASES);
  const inventory = averageBalanceDetails(context, context.balance, year, yearIndex, INVENTORY_ALIASES);
  const payable = averageBalanceDetails(context, context.balance, year, yearIndex, ACCOUNTS_PAYABLE_ALIASES);
  const calculated = calculateCashConversionCycle(
    revenue,
    cost.costAbs,
    receivable.average,
    inventory.average,
    payable.average
  );
  return { revenue, cost, receivable, inventory, payable, ...calculated };
}

function effectiveTaxRate(context: MetricContext, year: string): number | null {
  const incomeTax = absoluteValue(rowValue(context.income, year, INCOME_TAX_ALIASES));
  const totalProfit = rowValue(context.income, year, TOTAL_PROFIT_ALIASES);
  if (incomeTax === null || totalProfit === null || totalProfit <= 0) return null;
  return Math.min(Math.max(incomeTax / totalProfit, 0), 1);
}

export function ebitValue(context: MetricContext, year: string): number | null {
  const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
  if (operatingProfit === null) return null;
  const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES)) ?? 0;
  return operatingProfit + interestExpense;
}

export function nopatValue(context: MetricContext, year: string): number | null {
  const ebit = ebitValue(context, year);
  const taxRate = effectiveTaxRate(context, year);
  return ebit !== null && taxRate !== null ? ebit * (1 - taxRate) : null;
}

function investedCapitalDetails(context: MetricContext, year: string) {
  const equity = rowValue(context.balance, year, EQUITY_ALIASES);
  const cash = rowValue(context.balance, year, CASH_ALIASES);
  const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
  const debtTotal = debt.total ?? 0;
  const investedCapital = equity !== null && cash !== null
    ? equity + debtTotal - cash
    : null;
  return { equity, cash, debt, debtTotal, investedCapital };
}

export function averageInvestedCapital(context: MetricContext, year: string, yearIndex: number) {
  const current = investedCapitalDetails(context, year);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? investedCapitalDetails(context, previousYear) : null;
  const average = current.investedCapital !== null && previous !== null && previous.investedCapital !== null
    ? (current.investedCapital + previous.investedCapital) / 2
    : null;
  return { current, previous, previousYear, average };
}

export function incrementalRoicDetails(context: MetricContext, yearIndex: number, lookbackYears: number) {
  const currentYear = context.statements.years[yearIndex];
  const baseIndex = yearIndex + lookbackYears;
  const baseYear = context.statements.years[baseIndex];
  const currentNopat = currentYear ? nopatValue(context, currentYear) : null;
  const baseNopat = baseYear ? nopatValue(context, baseYear) : null;
  const currentCapital = currentYear ? investedCapitalDetails(context, currentYear).investedCapital : null;
  const baseCapital = baseYear ? investedCapitalDetails(context, baseYear).investedCapital : null;
  const calculated = calculateIncrementalReturn(currentNopat, baseNopat, currentCapital, baseCapital);
  return {
    currentYear,
    baseYear,
    currentNopat,
    baseNopat,
    currentCapital,
    baseCapital,
    ...calculated
  };
}

function profitabilityValueAtIndex(
  context: MetricContext,
  yearIndex: number,
  metric: 'roic' | 'grossMargin' | 'operatingMargin'
): number | null {
  const year = context.statements.years[yearIndex];
  if (!year) return null;
  if (metric === 'roic') {
    return safeDivide(
      nopatValue(context, year),
      averageInvestedCapital(context, year, yearIndex).average
    );
  }
  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  if (metric === 'operatingMargin') {
    return safeDivide(rowValue(context.income, year, OPERATING_PROFIT_ALIASES), revenue);
  }
  const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
  const operatingCost = rowValue(context.income, year, OPERATING_COST_ALIASES);
  const grossProfit = directGrossProfit ?? (
    revenue !== null && operatingCost !== null
      ? revenue - Math.abs(operatingCost)
      : null
  );
  return safeDivide(grossProfit, revenue);
}

export function rollingProfitabilityStatistics(
  context: MetricContext,
  yearIndex: number,
  windowSize: number,
  metric: 'roic' | 'grossMargin' | 'operatingMargin'
) {
  const values = context.statements.years.map((_, index) => profitabilityValueAtIndex(context, index, metric));
  const years = context.statements.years.slice(yearIndex, yearIndex + windowSize);
  const windowValues = values.slice(yearIndex, yearIndex + windowSize);
  return {
    years,
    values: windowValues,
    ...calculateRollingStatistics(values, yearIndex, windowSize)
  };
}

export function greenblattCapitalDetails(context: MetricContext, year: string) {
  const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
  const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
  const fixedAssets = rowValue(context.balance, year, FIXED_ASSET_ALIASES);
  const workingCapital = currentAssets !== null && currentLiabilities !== null
    ? currentAssets - currentLiabilities
    : null;
  const capital = workingCapital !== null && fixedAssets !== null
    ? workingCapital + fixedAssets
    : null;
  return { currentAssets, currentLiabilities, fixedAssets, workingCapital, capital };
}

export function sumRows(
  table: StatementTable | undefined,
  year: string,
  groups: Array<{ label: string; aliases: string[] }>
) {
  const rows: FormulaDetail[] = [];
  let total = 0;
  let hasValue = false;

  for (const group of groups) {
    const matches = findRows(table, group.aliases);
    for (const match of matches) {
      const value = toNumber(match.values[year]);
      if (value === null) continue;
      const normalizedValue = Math.abs(value);
      rows.push({ label: group.label, value: normalizedValue, note: match.sourceItem ?? match.item });
      total += normalizedValue;
      hasValue = true;
    }
  }

  return {
    total: hasValue ? total : null,
    rows
  };
}

export function cashEquivalentIncrease(context: MetricContext, year: string): number | null {
  const direct = rowValue(context.cashflow, year, CASH_EQUIVALENT_INCREASE_ALIASES);
  if (direct !== null || context.statements.company.market !== 'hk') return direct;
  const beginning = rowValue(context.cashflow, year, BEGIN_CASH_EQUIVALENT_ALIASES);
  const ending = rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES);
  return beginning !== null && ending !== null ? ending - beginning : null;
}

function longTermEquityInvestmentDetails(context: MetricContext, year: string) {
  if (context.statements.company.market === 'hk') {
    return sumRows(context.balance, year, HK_ASSOCIATE_JOINT_VENTURE_GROUPS);
  }
  const value = rowValue(context.balance, year, LONG_TERM_EQUITY_INVESTMENT_ALIASES);
  return {
    total: value,
    rows: value === null
      ? []
      : [{ label: '长期股权投资', value }]
  };
}

export function longTermEquityInvestmentValue(context: MetricContext, year: string): number | null {
  return longTermEquityInvestmentDetails(context, year).total;
}

function operatingCashflowDisplayName(context: MetricContext): string {
  return context.statements.company.market === 'hk'
    ? '经营业务现金净额'
    : '经营活动现金流量净额';
}

export function judgmentValue(
  left: number | null,
  right: number | null,
  predicate: (left: number, right: number) => boolean
): number | null {
  if (left === null || right === null) return null;
  return Number(predicate(left, right));
}

export function sumRowsContaining(table: StatementTable | undefined, year: string, keyword: string) {
  const matches = table?.rows.filter((row) => row.item.includes(keyword) || row.sourceItem?.includes(keyword)) ?? [];
  const rows: FormulaDetail[] = [];
  let total = 0;

  for (const match of matches) {
    const value = toNumber(match.values[year]);
    if (value === null) continue;
    const normalizedValue = Math.abs(value);
    rows.push({ label: match.item, value: normalizedValue, note: match.sourceItem ?? match.item });
    total += normalizedValue;
  }

  return { total: rows.length ? total : null, rows };
}

export function metricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails {
  if (definition.key === 'roe') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const equity = averageBalanceDetails(context, context.balance, year, yearIndex, EQUITY_ALIASES);
    const value = safeDivide(netProfit, equity.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 股东权益`, value: equity.current, note: '期末' },
        { label: `${equity.previousYear ?? '上年'} 股东权益`, value: equity.previous, note: '期初' },
        { label: '平均股东权益', value: equity.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(equity.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'roa') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(netProfit, assets.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'roic') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const interestExpenseForEbit = interestExpense ?? 0;
    const ebit = operatingProfit !== null ? operatingProfit + interestExpenseForEbit : null;
    const totalProfit = rowValue(context.income, year, TOTAL_PROFIT_ALIASES);
    const incomeTax = absoluteValue(rowValue(context.income, year, INCOME_TAX_ALIASES));
    const taxRate = effectiveTaxRate(context, year);
    const nopat = nopatValue(context, year);
    const investedCapital = averageInvestedCapital(context, year, yearIndex);
    const value = safeDivide(nopat, investedCapital.average);
    const previousLabel = investedCapital.previousYear ?? '上年';
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '利息支出', value: interestExpense, note: interestExpense === null ? '缺失时按 0 处理' : undefined },
        { label: '息税前利润 EBIT', value: ebit, note: '营业利润 + 利息支出' },
        { label: '利润总额', value: totalProfit },
        { label: '所得税费用', value: incomeTax },
        { label: '有效所得税率', value: taxRate, kind: 'percent', note: '所得税费用 / 利润总额' },
        { label: '税后经营利润 NOPAT', value: nopat, note: 'EBIT × (1 - 有效所得税率)' },
        { label: `${year} 股东权益`, value: investedCapital.current.equity, note: '期末' },
        ...investedCapital.current.debt.rows,
        { label: `${year} 有息负债合计`, value: investedCapital.current.debtTotal, note: '缺失时按 0 处理' },
        { label: `${year} 现金及现金等价物`, value: investedCapital.current.cash, note: '期末' },
        { label: `${year} 投入资本`, value: investedCapital.current.investedCapital, note: '股东权益 + 有息负债 - 现金及现金等价物' },
        { label: `${previousLabel} 投入资本`, value: investedCapital.previous?.investedCapital ?? null, note: '期初' },
        { label: '平均投入资本', value: investedCapital.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(nopat)} / ${formatRawValue(investedCapital.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'incrementalRoic3y') {
    const incremental = incrementalRoicDetails(context, yearIndex, 3);
    return {
      rows: [
        { label: `${incremental.currentYear ?? year} NOPAT`, value: incremental.currentNopat },
        { label: `${incremental.baseYear ?? '三年前'} NOPAT`, value: incremental.baseNopat },
        { label: 'NOPAT增量', value: incremental.profitChange, note: '本期 - 三年前' },
        { label: `${incremental.currentYear ?? year} 投入资本`, value: incremental.currentCapital },
        { label: `${incremental.baseYear ?? '三年前'} 投入资本`, value: incremental.baseCapital },
        { label: '投入资本增量', value: incremental.capitalChange, note: '仅在大于0时计算' }
      ],
      expression: `${formatRawValue(incremental.profitChange)} / ${formatRawValue(incremental.capitalChange)} = ${formatMetricValue(incremental.value, definition.kind)}`
    };
  }

  if (
    definition.key === 'averageRoic5y' ||
    definition.key === 'roicVolatility5y' ||
    definition.key === 'grossMarginVolatility5y' ||
    definition.key === 'operatingMarginVolatility5y'
  ) {
    const metric = definition.key === 'grossMarginVolatility5y'
      ? 'grossMargin'
      : definition.key === 'operatingMarginVolatility5y'
        ? 'operatingMargin'
        : 'roic';
    const metricLabel = metric === 'grossMargin'
      ? '毛利率'
      : metric === 'operatingMargin'
        ? '营业利润率'
        : 'ROIC';
    const statistics = rollingProfitabilityStatistics(context, yearIndex, 5, metric);
    const value = definition.key === 'averageRoic5y'
      ? statistics.mean
      : statistics.standardDeviation;
    return {
      rows: [
        ...statistics.years.map((statisticsYear, index) => ({
          label: `${statisticsYear} ${metricLabel}`,
          value: statistics.values[index] ?? null,
          kind: 'percent' as const
        })),
        { label: `5年${metricLabel}均值`, value: statistics.mean, kind: 'percent' },
        { label: `5年${metricLabel}标准差`, value: statistics.standardDeviation, kind: 'percent' }
      ],
      expression: `${definition.formula} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'greenblattReturnOnCapital') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const ebit = ebitValue(context, year);
    const capital = greenblattCapitalDetails(context, year);
    const value = capital.capital !== null && capital.capital > 0
      ? safeDivide(ebit, capital.capital)
      : null;
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '利息支出', value: interestExpense, note: interestExpense === null ? '缺失时按 0 处理' : undefined },
        { label: '息税前利润 EBIT', value: ebit, note: '营业利润 + 利息支出' },
        { label: '流动资产', value: capital.currentAssets },
        { label: '流动负债', value: capital.currentLiabilities },
        { label: '营运资本', value: capital.workingCapital, note: '流动资产 - 流动负债' },
        { label: '固定资产净值', value: capital.fixedAssets },
        { label: '投入经营资本', value: capital.capital, note: '营运资本 + 固定资产净值' }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(capital.capital)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'currentRatio') {
    const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
    const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
    const value = safeDivide(currentAssets, currentLiabilities);
    return {
      rows: [
        { label: '流动资产', value: currentAssets },
        { label: '流动负债', value: currentLiabilities }
      ],
      expression: `${formatRawValue(currentAssets)} / ${formatRawValue(currentLiabilities)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'quickRatio') {
    const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
    const inventory = rowValue(context.balance, year, INVENTORY_ALIASES);
    const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
    const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
    const value = safeDivide(quickAssets, currentLiabilities);
    return {
      rows: [
        { label: '流动资产', value: currentAssets },
        { label: '存货', value: inventory },
        { label: '速动资产', value: quickAssets, note: '流动资产 - 存货' },
        { label: '流动负债', value: currentLiabilities }
      ],
      expression: `${formatRawValue(quickAssets)} / ${formatRawValue(currentLiabilities)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashDebtRatio') {
    const cash = rowValue(context.balance, year, CASH_ALIASES);
    const interestBearingDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const value = safeDivide(cash, interestBearingDebt.total);
    return {
      rows: [
        { label: '现金及现金等价物', value: cash },
        ...interestBearingDebt.rows,
        { label: '有息负债合计', value: interestBearingDebt.total, note: '借款/贷款/债券/租赁等合计' }
      ],
      expression: `${formatRawValue(cash)} / ${formatRawValue(interestBearingDebt.total)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'debtRatio') {
    const interestBearingDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(interestBearingDebt.total, totalAssets);
    return {
      rows: [
        ...interestBearingDebt.rows,
        { label: '有息负债合计', value: interestBearingDebt.total, note: '借款/贷款/债券/租赁等合计' },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(interestBearingDebt.total)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'assetLiabilityRatio') {
    const totalLiabilities = rowValue(context.balance, year, TOTAL_LIABILITY_ALIASES);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(totalLiabilities, totalAssets);
    return {
      rows: [
        { label: '负债合计', value: totalLiabilities, note: '期末' },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(totalLiabilities)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivablesToAssets') {
    const receivables = sumRowsContaining(context.balance, year, '应收');
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(receivables.total, totalAssets);
    return {
      rows: [
        ...receivables.rows,
        { label: '所有“应收”科目合计', value: receivables.total },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(receivables.total)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivableRevenueMonths') {
    const receivable = rowValue(context.balance, year, RECEIVABLE_ALIASES);
    const annualRevenue = rowValue(context.income, year, REVENUE_ALIASES);
    const monthlyRevenue = annualRevenue === null ? null : annualRevenue / 12;
    const value = safeDivide(receivable, monthlyRevenue);
    return {
      rows: [
        { label: '应收账款余额', value: receivable, note: '期末' },
        { label: '年度营业收入', value: annualRevenue },
        { label: '月均营业收入', value: monthlyRevenue, note: '年度营业收入 / 12' }
      ],
      expression: `${formatRawValue(receivable)} / ${formatRawValue(monthlyRevenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivableTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const receivable = averageBalanceDetails(context, context.balance, year, yearIndex, RECEIVABLE_ALIASES);
    const value = safeDivide(revenue, receivable.average);
    const previousRevenue = previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES);
    const revenueGrowth = growthRate(revenue, previousRevenue);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: `${year} 应收账款`, value: receivable.current, note: '期末' },
        { label: `${receivable.previousYear ?? '上年'} 应收账款`, value: receivable.previous, note: '期初' },
        { label: '应收账款平均余额', value: receivable.average, note: '(期初 + 期末) / 2' },
        { label: '营业收入增幅', value: revenueGrowth, kind: 'percent', note: '与上年比较' }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(receivable.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'inventoryTurnover') {
    const cost = operatingCostDetails(context, year);
    const inventory = averageBalanceDetails(context, context.balance, year, yearIndex, INVENTORY_ALIASES);
    const value = safeDivide(cost.costAbs, inventory.average);
    return {
      rows: [
        ...cost.rows,
        { label: `${year} 存货`, value: inventory.current, note: '期末' },
        { label: `${inventory.previousYear ?? '上年'} 存货`, value: inventory.previous, note: '期初' },
        { label: '存货平均余额', value: inventory.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(cost.costAbs)} / ${formatRawValue(inventory.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'payableTurnover') {
    const cost = operatingCostDetails(context, year);
    const payable = averageBalanceDetails(context, context.balance, year, yearIndex, ACCOUNTS_PAYABLE_ALIASES);
    const value = safeDivide(cost.costAbs, payable.average);
    return {
      rows: [
        ...cost.rows,
        { label: `${year} 应付账款`, value: payable.current, note: '期末' },
        { label: `${payable.previousYear ?? '上年'} 应付账款`, value: payable.previous, note: '期初' },
        { label: '应付账款平均余额', value: payable.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(cost.costAbs)} / ${formatRawValue(payable.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashConversionCycle') {
    const details = cashConversionCycleDetails(context, year, yearIndex);
    return {
      rows: [
        { label: '营业收入', value: details.revenue },
        ...details.cost.rows,
        { label: '应收账款平均余额', value: details.receivable.average },
        { label: '应收天数', value: details.receivableDays, kind: 'days', note: '平均应收账款 × 365 / 营业收入' },
        { label: '存货平均余额', value: details.inventory.average },
        { label: '存货天数', value: details.inventoryDays, kind: 'days', note: '平均存货 × 365 / 营业成本' },
        { label: '应付账款平均余额', value: details.payable.average },
        { label: '应付天数', value: details.payableDays, kind: 'days', note: '平均应付账款 × 365 / 营业成本' }
      ],
      expression: `${formatMetricValue(details.receivableDays, 'days')} + ${formatMetricValue(details.inventoryDays, 'days')} - ${formatMetricValue(details.payableDays, 'days')} = ${formatMetricValue(details.cycle, definition.kind)}`
    };
  }

  if (definition.key === 'fixedAssetTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const fixedAssets = rowValue(context.balance, year, FIXED_ASSET_ALIASES);
    const value = safeDivide(revenue, fixedAssets);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: '固定资产净值', value: fixedAssets }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(fixedAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'totalAssetTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(revenue, assets.average);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'grossMargin') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
    const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
    const grossProfit = directGrossProfit ?? (
      revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
    );
    const value = safeDivide(grossProfit, revenue);
    const rows: FormulaDetail[] = [
      { label: '营业收入', value: revenue }
    ];
    if (directGrossProfit !== null) {
      rows.push({ label: '毛利润', value: directGrossProfit });
    } else {
      rows.push(
        { label: '营业成本', value: cost },
        { label: '推导毛利润', value: grossProfit, note: '营业收入 - |营业成本|' }
      );
    }
    return {
      rows,
      expression: `${formatRawValue(grossProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'operatingMargin') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(operatingProfit, revenue);
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(operatingProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'tangOperatingMargin') {
    const totalRevenue = rowValue(context.income, year, TOTAL_OPERATING_REVENUE_ALIASES);
    const totalCost = rowValue(context.income, year, TOTAL_OPERATING_COST_ALIASES);
    const operatingRevenue = rowValue(context.income, year, OPERATING_REVENUE_ALIASES);
    const tangOperatingProfit = totalRevenue !== null && totalCost !== null
      ? totalRevenue - Math.abs(totalCost)
      : null;
    const value = safeDivide(tangOperatingProfit, operatingRevenue);
    return {
      rows: [
        { label: '营业总收入', value: totalRevenue },
        { label: '营业总成本', value: totalCost },
        { label: '老唐营业利润', value: tangOperatingProfit, note: '营业总收入 - |营业总成本|' },
        { label: '营业收入', value: operatingRevenue }
      ],
      expression: `${formatRawValue(tangOperatingProfit)} / ${formatRawValue(operatingRevenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netMargin') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(netProfit, revenue);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'expenseRatio') {
  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
  const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
  const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
  const threeFees = sumAbsolute([selling, admin, finance]);
  const value = safeDivide(threeFees, revenue);
  const previousRevenue = previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES);
  const revenueGrowth = growthRate(revenue, previousRevenue);
  return {
    rows: [
      { label: '营业收入', value: revenue },
      { label: '销售费用', value: selling },
      { label: '管理费用', value: admin },
      { label: '财务费用', value: finance },
      { label: '三费合计', value: threeFees, note: '|销售| + |管理| + |财务|' },
      { label: '营业收入增幅', value: revenueGrowth, kind: 'percent', note: '与上年比较' }
    ],
    expression: `${formatRawValue(threeFees)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
  };
  }

  if (definition.key === 'operatingCostRatio') {
    const operatingCost = absoluteValue(rowValue(context.income, year, OPERATING_COST_ALIASES));
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(operatingCost, revenue);
    return {
      rows: [
        { label: '营业成本', value: operatingCost },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(operatingCost)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'sellingExpenseRatio') {
    const sellingExpense = absoluteValue(rowValue(context.income, year, SELLING_EXPENSE_ALIASES));
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(sellingExpense, revenue);
    return {
      rows: [
        { label: '销售费用', value: sellingExpense },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(sellingExpense)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'ebitMargin') {
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const ebit = interestExpense !== null && operatingProfit !== null ? interestExpense + operatingProfit : null;
    const financingCostLabel = context.statements.company.market === 'hk' ? '融资成本' : '利息支出';
    const operatingProfitLabel = context.statements.company.market === 'hk' ? '经营溢利' : '营业利润';
    const value = safeDivide(ebit, revenue);
    return {
      rows: [
        { label: financingCostLabel, value: interestExpense },
        { label: operatingProfitLabel, value: operatingProfit },
        { label: '息税前利润', value: ebit, note: `${financingCostLabel} + ${operatingProfitLabel}` },
        { label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netAssetCashReturn') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(operatingCashflow, assets.average);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(operatingCashflow)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'operatingCashConversion') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = safeDivide(operatingCashflow, netProfit);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: '净利润', value: netProfit }
      ],
      expression: `${formatRawValue(operatingCashflow)} / ${formatRawValue(netProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cumulativeCashConversion3y') {
    const rolling = rollingCashConversionDetails(context, yearIndex, 3);
    return {
      rows: [
        { label: '滚动区间', value: null, note: rolling.years.join('、') || '-' },
        { label: '近3年经营现金流合计', value: rolling.operatingCashflowTotal },
        { label: '近3年净利润合计', value: rolling.netProfitTotal }
      ],
      expression: `${formatRawValue(rolling.operatingCashflowTotal)} / ${formatRawValue(rolling.netProfitTotal)} = ${formatMetricValue(rolling.value, definition.kind)}`
    };
  }

  if (definition.key === 'freeCashFlow' || definition.key === 'freeCashFlowMargin') {
    const freeCashFlow = freeCashFlowDetails(context, year);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = definition.key === 'freeCashFlow'
      ? freeCashFlow.freeCashFlow
      : safeDivide(freeCashFlow.freeCashFlow, revenue);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: freeCashFlow.operatingCashflow },
        ...(freeCashFlow.combinedCapitalExpenditure === null
          ? [
              { label: '购建固定资产', value: freeCashFlow.fixedAssetCapitalExpenditure },
              { label: '购建无形资产及其他资产', value: freeCashFlow.intangibleCapitalExpenditure }
            ]
          : []),
        { label: '资本开支', value: freeCashFlow.capitalExpenditure, note: '购建长期资产支付现金的绝对值' },
        { label: '自由现金流', value: freeCashFlow.freeCashFlow, note: '经营现金流 - 资本开支' },
        ...(definition.key === 'freeCashFlowMargin'
          ? [{ label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }]
          : [])
      ],
      expression: definition.key === 'freeCashFlow'
        ? `${formatRawValue(freeCashFlow.operatingCashflow)} - ${formatRawValue(freeCashFlow.capitalExpenditure)} = ${formatMetricValue(value, definition.kind)}`
        : `${formatRawValue(freeCashFlow.freeCashFlow)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'accrualRatio') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const accruals = netProfit !== null && operatingCashflow !== null
      ? netProfit - operatingCashflow
      : null;
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(accruals, assets.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: '应计利润', value: accruals, note: '净利润 - 经营现金流' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `(${formatRawValue(netProfit)} - ${formatRawValue(operatingCashflow)}) / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'deductedProfitRatio') {
    const deductedProfit = rowValue(context.income, year, DEDUCTED_NET_PROFIT_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = safeDivide(deductedProfit, netProfit);
    return {
      rows: [
        { label: '扣非归母净利润', value: deductedProfit },
        { label: '归母净利润', value: netProfit }
      ],
      expression: `${formatRawValue(deductedProfit)} / ${formatRawValue(netProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashCollectionRatio') {
    const customerCashReceipts = rowValue(context.cashflow, year, CUSTOMER_CASH_RECEIPTS_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(customerCashReceipts, revenue);
    return {
      rows: [
        { label: '销售商品、提供劳务收到的现金', value: customerCashReceipts },
        { label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(customerCashReceipts)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'interestCoverage') {
    const ebit = ebitValue(context, year);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const value = safeDivide(ebit, interestExpense);
    return {
      rows: [
        { label: '息税前利润 EBIT', value: ebit },
        { label: context.statements.company.market === 'hk' ? '融资成本' : '利息支出', value: interestExpense }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(interestExpense)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netDebtToOperatingCash') {
    const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const cash = rowValue(context.balance, year, CASH_ALIASES);
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netDebt = debt.total !== null && cash !== null ? debt.total - cash : null;
    const value = safeDivide(netDebt, operatingCashflow);
    return {
      rows: [
        ...debt.rows,
        { label: '有息负债合计', value: debt.total },
        { label: '现金及现金等价物', value: cash },
        { label: '净债务', value: netDebt, note: '有息负债 - 现金' },
        { label: operatingCashflowDisplayName(context), value: operatingCashflow }
      ],
      expression: `${formatRawValue(netDebt)} / ${formatRawValue(operatingCashflow)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'researchExpenseRatio') {
    const researchExpense = absoluteValue(rowValue(context.income, year, RESEARCH_EXPENSE_ALIASES));
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(researchExpense, revenue);
    return {
      rows: [
        { label: '研发费用', value: researchExpense },
        { label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(researchExpense)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'developmentCapitalizationProxy') {
    const details = developmentCapitalizationDetails(context, year, yearIndex);
    return {
      rows: [
        { label: `${year} 开发支出`, value: details.currentDevelopmentExpenditure, note: '期末余额' },
        { label: `${details.previousYear ?? '上年'} 开发支出`, value: details.previousDevelopmentExpenditure, note: '期初余额' },
        { label: '开发支出正增长额', value: details.developmentIncrease, note: '负增长按0处理' },
        { label: '研发费用', value: details.researchExpense },
        { label: '研发投入代理值', value: details.totalResearchInvestmentProxy, note: '研发费用 + 开发支出正增长额' }
      ],
      expression: `${formatRawValue(details.developmentIncrease)} / ${formatRawValue(details.totalResearchInvestmentProxy)} = ${formatMetricValue(details.value, definition.kind)}`
    };
  }

  if (definition.key === 'developmentToEquity' || definition.key === 'goodwillToEquity') {
    const isDevelopment = definition.key === 'developmentToEquity';
    const assetLabel = isDevelopment ? '开发支出' : '商誉';
    const assetValue = absoluteValue(rowValue(
      context.balance,
      year,
      isDevelopment ? DEVELOPMENT_EXPENDITURE_ALIASES : GOODWILL_ALIASES
    ));
    const equity = rowValue(context.balance, year, EQUITY_ALIASES);
    const value = safeDivide(assetValue, equity);
    return {
      rows: [
        { label: assetLabel, value: assetValue },
        { label: '股东权益', value: equity }
      ],
      expression: `${formatRawValue(assetValue)} / ${formatRawValue(equity)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'intangibleGoodwillToAssets') {
    const assets = sumRows(context.balance, year, [
      { label: '商誉', aliases: GOODWILL_ALIASES },
      { label: '无形资产', aliases: INTANGIBLE_ASSET_ALIASES },
      { label: '开发支出', aliases: DEVELOPMENT_EXPENDITURE_ALIASES }
    ]);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(assets.total, totalAssets);
    return {
      rows: [
        ...assets.rows,
        { label: '商誉及无形资产合计', value: assets.total },
        { label: '总资产', value: totalAssets }
      ],
      expression: `${formatRawValue(assets.total)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'impairmentToOperatingProfit') {
    const impairment = sumRows(context.income, year, [{ label: '减值及拨备', aliases: IMPAIRMENT_ALIASES }]);
    const operatingProfit = absoluteValue(rowValue(context.income, year, OPERATING_PROFIT_ALIASES));
    const value = safeDivide(impairment.total, operatingProfit);
    return {
      rows: [
        ...impairment.rows,
        { label: '减值及拨备绝对额合计', value: impairment.total },
        { label: '|营业利润|', value: operatingProfit }
      ],
      expression: `${formatRawValue(impairment.total)} / ${formatRawValue(operatingProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'internalAssetReturn') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const investment = longTermEquityInvestmentDetails(context, year);
    const longTermEquityInvestment = investment.total;
    const internalAssets = totalAssets !== null && longTermEquityInvestment !== null
      ? totalAssets - longTermEquityInvestment
      : null;
    const value = safeDivide(operatingProfit, internalAssets);
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '总资产', value: totalAssets },
        ...investment.rows,
        { label: '内部经营资产', value: internalAssets, note: context.statements.company.market === 'hk' ? '总资产 - 联营公司权益 - 合营公司权益' : '总资产 - 长期股权投资' }
      ],
      expression: `${formatRawValue(operatingProfit)} / ${formatRawValue(internalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'expenseToGrossProfitRatio') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
    const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
    const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
    const threeFees = sumAbsolute([selling, admin, finance]);
    const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
    const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
    const grossProfit = directGrossProfit ?? (
      revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
    );
    const value = safeDivide(threeFees, grossProfit);
    const grossProfitRows: FormulaDetail[] = directGrossProfit !== null
      ? [{ label: '毛利润', value: directGrossProfit, note: '直接科目' }]
      : [
          { label: '营业收入', value: revenue },
          { label: '营业成本', value: cost },
          { label: '推导毛利润', value: grossProfit, note: '营业收入 - |营业成本|' }
        ];
    return {
      rows: [
        { label: '销售费用', value: selling },
        { label: '管理费用', value: admin },
        { label: '财务费用', value: finance },
        { label: '三费合计', value: threeFees, note: '|销售| + |管理| + |财务|' },
        ...grossProfitRows
      ],
      expression: `${formatRawValue(threeFees)} / ${formatRawValue(grossProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'revenueGrowth') {
    return growthDetails(definition, context, year, yearIndex, '营业收入', context.income, REVENUE_ALIASES);
  }

  if (definition.key === 'operatingProfitGrowth') {
    return growthDetails(definition, context, year, yearIndex, '营业利润', context.income, OPERATING_PROFIT_ALIASES);
  }

  if (definition.key === 'assetGrowth') {
    return growthDetails(definition, context, year, yearIndex, '总资产', context.balance, TOTAL_ASSET_ALIASES);
  }

  if (definition.key === 'netAssetGrowth') {
    return growthDetails(definition, context, year, yearIndex, '净资产', context.balance, NET_ASSET_ALIASES);
  }

  if (definition.key === 'receivablesRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '应收账款', context.balance, RECEIVABLE_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'inventoryRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '存货', context.balance, INVENTORY_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'profitCashflowGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '净利润', context.income, NET_PROFIT_ALIASES,
      operatingCashflowDisplayName(context), context.cashflow, OPERATING_CASHFLOW_ALIASES
    );
  }

  if (definition.key === 'assetRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '总资产', context.balance, TOTAL_ASSET_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'debtCashflowGrowthGap') {
    const previousYear = context.statements.years[yearIndex + 1];
    const currentDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total;
    const previousDebt = previousYear
      ? sumRows(context.balance, previousYear, INTEREST_BEARING_DEBT_GROUPS).total
      : null;
    const currentCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const previousCashflow = previousRowValue(context, context.cashflow, yearIndex, OPERATING_CASHFLOW_ALIASES);
    const debtGrowth = growthRate(currentDebt, previousDebt);
    const cashflowGrowth = growthRate(currentCashflow, previousCashflow);
    const value = growthGapValue(currentDebt, previousDebt, currentCashflow, previousCashflow);
    return {
      rows: [
        { label: '有息负债增长率', value: debtGrowth, kind: 'percent' },
        { label: `${operatingCashflowDisplayName(context)}增长率`, value: cashflowGrowth, kind: 'percent' }
      ],
      expression: `${formatMetricValue(debtGrowth, 'percent')} - ${formatMetricValue(cashflowGrowth, 'percent')} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'operatingCashflowAboveProfit') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = judgmentValue(operatingCashflow, netProfit, (cashflow, profit) => cashflow > profit && profit > 0);
    return judgmentDetails(definition, value, [
      { label: operatingCashflowDisplayName(context), value: operatingCashflow },
      { label: '净利润', value: netProfit }
    ]);
  }

  if (definition.key === 'cashEquivalentIncreasePositive') {
    const increase = cashEquivalentIncrease(context, year);
    const beginning = context.statements.company.market === 'hk'
      ? rowValue(context.cashflow, year, BEGIN_CASH_EQUIVALENT_ALIASES)
      : null;
    const ending = context.statements.company.market === 'hk'
      ? rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES)
      : null;
    const value = increase === null ? null : Number(increase > 0);
    return judgmentDetails(definition, value, [
      ...(beginning !== null && ending !== null
        ? [
            { label: '期末现金', value: ending },
            { label: '期初现金', value: beginning }
          ]
        : []),
      { label: '现金及现金等价物净增加额', value: increase }
    ]);
  }

  if (definition.key === 'endingCashAboveDebt') {
    const endingCash = rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES);
    const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const value = judgmentValue(endingCash, debt.total, (cash, totalDebt) => cash > totalDebt);
    return judgmentDetails(definition, value, [
      { label: '期末现金及现金等价物余额', value: endingCash },
      ...debt.rows,
      { label: '有息负债合计', value: debt.total }
    ]);
  }

  if (definition.key === 'investmentOutflowAboveInflow') {
    if (context.statements.company.market === 'hk') {
      const netCashflow = rowValue(context.cashflow, year, HK_INVESTMENT_CASH_NET_ALIASES);
      const value = netCashflow === null ? null : Number(netCashflow < 0);
      return judgmentDetails(definition, value, [
        { label: '投资业务现金净额', value: netCashflow }
      ]);
    }
    const outflow = absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_OUTFLOW_ALIASES));
    const inflow = absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_INFLOW_ALIASES));
    const value = judgmentValue(outflow, inflow, (cashOutflow, cashInflow) => cashOutflow > cashInflow);
    return judgmentDetails(definition, value, [
      { label: '投资活动现金流出', value: outflow },
      { label: '投资活动现金流入', value: inflow }
    ]);
  }

  return {
    rows: [],
    expression: '-'
  };
}

function averageBalanceDetails(
  context: MetricContext,
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
) {
  const row = findRow(table, aliases);
  const current = toNumber(row?.values[year]);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row?.values[previousYear]) : null;
  const average = current !== null && previous !== null ? (current + previous) / 2 : null;
  return { current, previous, previousYear, average };
}

function growthDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number,
  label: string,
  table: StatementTable | undefined,
  aliases: string[]
): FormulaDetails {
  const current = rowValue(table, year, aliases);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? rowValue(table, previousYear, aliases) : null;
  const change = current !== null && previous !== null ? current - previous : null;
  const value = growthRate(current, previous);
  return {
    rows: [
      { label: `${year} ${label}`, value: current, note: '本期' },
      { label: `${previousYear ?? '上期'} ${label}`, value: previous, note: '上期' },
      { label: `${label}变动额`, value: change, note: '本期 - 上期' }
    ],
    expression: `(${formatRawValue(current)} - ${formatRawValue(previous)}) / ${formatRawValue(previous)} = ${formatMetricValue(value, definition.kind)}`
  };
}

function growthGapDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number,
  primaryLabel: string,
  primaryTable: StatementTable | undefined,
  primaryAliases: string[],
  benchmarkLabel: string,
  benchmarkTable: StatementTable | undefined,
  benchmarkAliases: string[]
): FormulaDetails {
  const primaryCurrent = rowValue(primaryTable, year, primaryAliases);
  const primaryPrevious = previousRowValue(context, primaryTable, yearIndex, primaryAliases);
  const benchmarkCurrent = rowValue(benchmarkTable, year, benchmarkAliases);
  const benchmarkPrevious = previousRowValue(context, benchmarkTable, yearIndex, benchmarkAliases);
  const primaryGrowth = growthRate(primaryCurrent, primaryPrevious);
  const benchmarkGrowth = growthRate(benchmarkCurrent, benchmarkPrevious);
  const value = growthGapValue(primaryCurrent, primaryPrevious, benchmarkCurrent, benchmarkPrevious);
  return {
    rows: [
      { label: `${primaryLabel}增长率`, value: primaryGrowth, kind: 'percent' },
      { label: `${benchmarkLabel}增长率`, value: benchmarkGrowth, kind: 'percent' }
    ],
    expression: `${formatMetricValue(primaryGrowth, 'percent')} - ${formatMetricValue(benchmarkGrowth, 'percent')} = ${formatMetricValue(value, definition.kind)}`
  };
}

export function missingRequirements(definition: MetricDefinition, context: MetricContext): string[] {
  if (context.statements.company.market === 'hk' && definition.key === 'operatingCostRatio') {
    const latestYear = context.statements.years[0];
    return operatingCostDetails(context, latestYear).costAbs === null ? ['销售成本或毛利'] : [];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'internalAssetReturn') {
    const commonMissing = definition.requirements
      .filter((requirement) => requirement.aliases !== LONG_TERM_EQUITY_INVESTMENT_ALIASES)
      .filter((requirement) => {
        const table = requirement.table === 'balance' ? context.balance : context.income;
        return !findRow(table, requirement.aliases);
      })
      .map((requirement) => requirement.label);
    const hasAssociateOrJointVenture = HK_ASSOCIATE_JOINT_VENTURE_GROUPS.some((group) =>
      Boolean(findRow(context.balance, group.aliases))
    );
    return hasAssociateOrJointVenture
      ? commonMissing
      : [...commonMissing, '联营公司权益或合营公司权益'];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'cashEquivalentIncreasePositive') {
    return cashEquivalentIncrease(context, context.statements.years[0]) === null
      ? ['期初现金和期末现金']
      : [];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'investmentOutflowAboveInflow') {
    return findRow(context.cashflow, HK_INVESTMENT_CASH_NET_ALIASES)
      ? []
      : ['投资业务现金净额'];
  }
  return definition.requirements
    .filter((requirement) => {
      const table = requirement.table === 'balance'
        ? context.balance
        : requirement.table === 'cashflow'
          ? context.cashflow
          : context.income;
      if (definition.key === 'receivablesToAssets' && requirement.label === '所有“应收”科目') {
        return !table?.rows.some((row) => row.item.includes('应收') || row.sourceItem?.includes('应收'));
      }
      return !findRow(table, requirement.aliases);
    })
    .map((requirement) => requirement.label);
}

function judgmentDetails(
  definition: MetricDefinition,
  value: number | null,
  rows: FormulaDetail[]
): FormulaDetails {
  return {
    rows,
    expression: `${definition.formula}：${formatMetricValue(value, definition.kind)}`
  };
}
