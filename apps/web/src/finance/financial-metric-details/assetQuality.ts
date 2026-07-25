import { DEVELOPMENT_EXPENDITURE_ALIASES, EQUITY_ALIASES, GOODWILL_ALIASES, INTANGIBLE_ASSET_ALIASES, IMPAIRMENT_ALIASES, OPERATING_PROFIT_ALIASES, RESEARCH_EXPENSE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { absoluteValue, formatMetricValue, formatRawValue, rowValue, safeDivide } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { developmentCapitalizationDetails, sumRows } from '../financial-metric-calculation-helpers';

export function assetQualityMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
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

  return null;
}
