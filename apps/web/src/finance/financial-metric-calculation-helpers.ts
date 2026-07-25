import type { StatementTable } from '../types/finance';
import { ACCOUNTS_PAYABLE_ALIASES, BEGIN_CASH_EQUIVALENT_ALIASES, CASH_ALIASES, CASH_EQUIVALENT_INCREASE_ALIASES, COMBINED_CAPITAL_EXPENDITURE_ALIASES, CURRENT_ASSET_ALIASES, CURRENT_LIABILITY_ALIASES, DEVELOPMENT_EXPENDITURE_ALIASES, END_CASH_EQUIVALENT_ALIASES, EQUITY_ALIASES, FIXED_ASSET_ALIASES, FIXED_ASSET_CAPEX_ALIASES, GROSS_PROFIT_ALIASES, HK_ASSOCIATE_JOINT_VENTURE_GROUPS, INCOME_TAX_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INTEREST_EXPENSE_ALIASES, INTANGIBLE_ASSET_CAPEX_ALIASES, INVENTORY_ALIASES, LONG_TERM_EQUITY_INVESTMENT_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_COST_ALIASES, OPERATING_PROFIT_ALIASES, RECEIVABLE_ALIASES, RESEARCH_EXPENSE_ALIASES, REVENUE_ALIASES, TOTAL_PROFIT_ALIASES } from './financial-metric-fields';
import { absoluteValue, calculateCashConversionCycle, calculateDevelopmentCapitalizationProxy, calculateFreeCashFlow, calculateIncrementalReturn, calculateRollingRatio, calculateRollingStatistics, findRow, findRows, formatMetricValue, formatRawValue, growthGapValue, growthRate, rowValue, safeDivide, toNumber } from './financial-metric-engine';
import type { FormulaDetail, FormulaDetails, MetricContext, MetricDefinition } from './financial-metric-types';

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

export function effectiveTaxRate(context: MetricContext, year: string): number | null {
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

export function investedCapitalDetails(context: MetricContext, year: string) {
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

export function profitabilityValueAtIndex(
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

export function longTermEquityInvestmentDetails(context: MetricContext, year: string) {
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

export function operatingCashflowDisplayName(context: MetricContext): string {
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

export function averageBalanceDetails(
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

export function growthDetails(
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

export function growthGapDetails(
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

export function judgmentDetails(
  definition: MetricDefinition,
  value: number | null,
  rows: FormulaDetail[]
): FormulaDetails {
  return {
    rows,
    expression: `${definition.formula}：${formatMetricValue(value, definition.kind)}`
  };
}
