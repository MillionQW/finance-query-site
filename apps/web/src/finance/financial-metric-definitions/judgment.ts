import { CASH_EQUIVALENT_INCREASE_ALIASES, END_CASH_EQUIVALENT_ALIASES, FINANCING_CASHFLOW_ALIASES, HK_INVESTMENT_CASH_NET_ALIASES, INTEREST_BEARING_DEBT_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INVESTING_CASHFLOW_ALIASES, INVESTMENT_CASH_INFLOW_ALIASES, INVESTMENT_CASH_OUTFLOW_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES } from '../financial-metric-fields';
import { absoluteValue, rowValue } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { cashEquivalentIncrease, judgmentValue, sumRows } from '../financial-metric-calculation-helpers';
import { classifyCashFlows } from '../cash-flow-classification';

export const judgmentDefinitions: MetricDefinition[] = [
  {
    key: 'cashFlowCompanyType',
    label: '三类现金流企业类型',
    group: 'judgment',
    formula: '经营、投资、筹资活动现金流量净额的正负组合',
    kind: 'classification',
    description: '按当年三类现金流净额的正负组合归入八种企业类型。该分类只用于提示进一步核查方向，不能代替对多年数据、行业特征和具体项目的分析；任一净额为 0 时不强行归类。',
    requirements: [
      { label: '经营活动产生的现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '投资活动产生的现金流量净额', table: 'cashflow', aliases: INVESTING_CASHFLOW_ALIASES },
      { label: '筹资活动产生的现金流量净额', table: 'cashflow', aliases: FINANCING_CASHFLOW_ALIASES }
    ],
    calculate: (context, year) => classifyCashFlows(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      rowValue(context.cashflow, year, INVESTING_CASHFLOW_ALIASES),
      rowValue(context.cashflow, year, FINANCING_CASHFLOW_ALIASES)
    )?.code ?? null
  },
  {
    key: 'operatingCashflowAboveProfit',
    label: '经营现金流净额 > 净利润 > 0',
    group: 'judgment',
    formula: '经营活动产生的现金流量净额 > 净利润 > 0',
    kind: 'judgment',
    description: '经营现金流净额高于正净利润时通过。更完整的判断请查看“现金质量”中的经营现金含金量及三年累计值。经营活动现金流如果持续大于净利润，很可能意味着公司商品或服务供不应求，买家不断打预付款来订货。',
    requirements: [
      { label: '经营活动产生的现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      rowValue(context.income, year, NET_PROFIT_ALIASES),
      (operatingCashflow, netProfit) => operatingCashflow > netProfit && netProfit > 0
    )
  },
  {
    key: 'cashEquivalentIncreasePositive',
    label: '现金净增加额 > 0',
    group: 'judgment',
    formula: '现金及现金等价物净增加额 > 0',
    kind: 'judgment',
    description: '现金及现金等价物净增加额为正时通过。该数值直接取自现金流量表的“现金及现金等价物净增加额”科目，并非使用货币资金或期末、期初现金余额自行计算。',
    requirements: [
      { label: '现金及现金等价物净增加额', table: 'cashflow', aliases: CASH_EQUIVALENT_INCREASE_ALIASES }
    ],
    calculate: (context, year) => {
      const value = cashEquivalentIncrease(context, year);
      return value === null ? null : Number(value > 0);
    }
  },
  {
    key: 'endingCashAboveDebt',
    label: '期末现金余额 > 有息负债',
    group: 'judgment',
    formula: '期末现金及现金等价物余额 > 有息负债',
    kind: 'judgment',
    description: '期末现金及现金等价物余额能够覆盖有息负债时通过。',
    requirements: [
      { label: '期末现金及现金等价物余额', table: 'cashflow', aliases: END_CASH_EQUIVALENT_ALIASES },
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES),
      sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total,
      (endingCash, debt) => endingCash > debt
    )
  },
  {
    key: 'investmentOutflowAboveInflow',
    label: '投资现金流出 > 流入',
    group: 'judgment',
    formula: '投资活动现金流出 > 投资活动现金流入',
    kind: 'judgment',
    description: '投资活动现金流出大于流入时通过。',
    requirements: [
      { label: '投资活动现金流出', table: 'cashflow', aliases: INVESTMENT_CASH_OUTFLOW_ALIASES },
      { label: '投资活动现金流入', table: 'cashflow', aliases: INVESTMENT_CASH_INFLOW_ALIASES }
    ],
    calculate: (context, year) => {
      if (context.statements.company.market === 'hk') {
        const netCashflow = rowValue(context.cashflow, year, HK_INVESTMENT_CASH_NET_ALIASES);
        return netCashflow === null ? null : Number(netCashflow < 0);
      }
      return judgmentValue(
        absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_OUTFLOW_ALIASES)),
        absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_INFLOW_ALIASES)),
        (outflow, inflow) => outflow > inflow
      );
    }
  }
];
