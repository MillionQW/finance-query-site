import { ADMIN_EXPENSE_ALIASES, EQUITY_ALIASES, FINANCE_EXPENSE_ALIASES, GROSS_PROFIT_ALIASES, INCOME_TAX_ALIASES, INTEREST_EXPENSE_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_COST_ALIASES, OPERATING_PROFIT_ALIASES, OPERATING_REVENUE_ALIASES, REVENUE_ALIASES, SELLING_EXPENSE_ALIASES, TOTAL_ASSET_ALIASES, TOTAL_OPERATING_COST_ALIASES, TOTAL_OPERATING_REVENUE_ALIASES, TOTAL_PROFIT_ALIASES } from '../financial-metric-fields';
import { absoluteValue, formatMetricValue, formatRawValue, growthRate, rowValue, safeDivide, sumAbsolute } from '../financial-metric-engine';
import type { FormulaDetail, FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { previousRowValue, effectiveTaxRate, ebitValue, nopatValue, averageInvestedCapital, incrementalRoicDetails, rollingProfitabilityStatistics, greenblattCapitalDetails, longTermEquityInvestmentDetails, operatingCashflowDisplayName, averageBalanceDetails } from '../financial-metric-calculation-helpers';

export function profitabilityMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
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

  return null;
}
