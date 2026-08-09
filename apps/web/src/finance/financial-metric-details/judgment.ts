import { BEGIN_CASH_EQUIVALENT_ALIASES, END_CASH_EQUIVALENT_ALIASES, FINANCING_CASHFLOW_ALIASES, HK_INVESTMENT_CASH_NET_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INVESTING_CASHFLOW_ALIASES, INVESTMENT_CASH_INFLOW_ALIASES, INVESTMENT_CASH_OUTFLOW_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES } from '../financial-metric-fields';
import { absoluteValue, rowValue } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { sumRows, cashEquivalentIncrease, operatingCashflowDisplayName, judgmentValue, judgmentDetails } from '../financial-metric-calculation-helpers';
import { classifyCashFlows } from '../cash-flow-classification';

export function judgmentMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
  if (definition.key === 'cashFlowCompanyType') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const investingCashflow = rowValue(context.cashflow, year, INVESTING_CASHFLOW_ALIASES);
    const financingCashflow = rowValue(context.cashflow, year, FINANCING_CASHFLOW_ALIASES);
    const classification = classifyCashFlows(operatingCashflow, investingCashflow, financingCashflow);
    const signOf = (value: number | null): string => value === null ? '缺失' : value === 0 ? '0' : value > 0 ? '＋' : '－';

    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: operatingCashflow, note: signOf(operatingCashflow) },
        { label: '投资活动现金流量净额', value: investingCashflow, note: signOf(investingCashflow) },
        { label: '筹资活动现金流量净额', value: financingCashflow, note: signOf(financingCashflow) },
        {
          label: '分类结果',
          value: classification?.code ?? null,
          displayValue: classification ? `第${classification.code}类 · ${classification.companyType}` : '无法归类',
          note: classification?.note
        },
        {
          label: '关注要点',
          value: null,
          displayValue: classification?.focus ?? '请核对缺失或为 0 的现金流净额'
        }
      ],
      expression: classification
        ? `经营${classification.operatingSign} / 投资${classification.investingSign} / 筹资${classification.financingSign} → 第${classification.code}类 ${classification.companyType}；关注：${classification.focus}${classification.note ? `（${classification.note}）` : ''}`
        : '三项净额必须齐全且均不为 0，才能按正负组合归类'
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

  return null;
}
