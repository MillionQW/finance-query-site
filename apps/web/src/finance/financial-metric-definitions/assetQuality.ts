import { DEVELOPMENT_EXPENDITURE_ALIASES, EQUITY_ALIASES, GOODWILL_ALIASES, INTANGIBLE_GOODWILL_ALIASES, IMPAIRMENT_ALIASES, OPERATING_PROFIT_ALIASES, RESEARCH_EXPENSE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { absoluteValue, rowValue, safeDivide } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { developmentCapitalizationDetails, sumRows } from '../financial-metric-calculation-helpers';

export const assetQualityDefinitions: MetricDefinition[] = [
  {
    key: 'researchExpenseRatio',
    label: '研发费用率',
    group: 'assetQuality',
    formula: '研发费用 / 营业收入',
    kind: 'percent',
    description: '观察企业当期费用化研发投入强度。高投入不直接等于高产出，应结合收入增长、毛利率和后续产品表现判断。',
    requirements: [
      { label: '研发费用', table: 'income', aliases: RESEARCH_EXPENSE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.income, year, RESEARCH_EXPENSE_ALIASES)),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'developmentCapitalizationProxy',
    label: '研发资本化代理率',
    group: 'assetQuality',
    formula: '开发支出正增长额 / (研发费用 + 开发支出正增长额)',
    kind: 'percent',
    description: '用开发支出余额的正增长近似当期资本化金额，只作趋势预警；开发项目转入无形资产会令该代理值偏低，不能替代财报附注中的真实资本化率。',
    requirements: [
      { label: '研发费用', table: 'income', aliases: RESEARCH_EXPENSE_ALIASES },
      { label: '开发支出', table: 'balance', aliases: DEVELOPMENT_EXPENDITURE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      developmentCapitalizationDetails(context, year, yearIndex).value
  },
  {
    key: 'developmentToEquity',
    label: '开发支出/净资产',
    group: 'assetQuality',
    formula: '开发支出 / 股东权益',
    kind: 'percent',
    description: '观察尚未完成或尚未转入无形资产的开发项目占净资产比例。比例过高时，项目失败或减值可能显著影响股东权益。',
    requirements: [
      { label: '开发支出', table: 'balance', aliases: DEVELOPMENT_EXPENDITURE_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.balance, year, DEVELOPMENT_EXPENDITURE_ALIASES)),
        rowValue(context.balance, year, EQUITY_ALIASES)
      )
  },
  {
    key: 'goodwillToEquity',
    label: '商誉/净资产',
    group: 'assetQuality',
    formula: '商誉 / 股东权益',
    kind: 'percent',
    description: '观察并购形成的商誉相对股东权益的暴露。商誉本身不等于风险，但比例较高时，一次重大减值可能明显侵蚀净资产。',
    requirements: [
      { label: '商誉', table: 'balance', aliases: GOODWILL_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.balance, year, GOODWILL_ALIASES)),
        rowValue(context.balance, year, EQUITY_ALIASES)
      )
  },
  {
    key: 'intangibleGoodwillToAssets',
    label: '商誉及无形资产/总资产',
    group: 'assetQuality',
    formula: '(商誉 + 无形资产 + 开发支出) / 总资产',
    kind: 'percent',
    description: '观察总资产中依赖估值、摊销和未来现金流假设的资产比例。比例高时需进一步查看无形资产构成、使用寿命和减值测试。',
    requirements: [
      { label: '商誉、无形资产或开发支出', table: 'balance', aliases: INTANGIBLE_GOODWILL_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRows(context.balance, year, [{ label: '商誉及无形资产', aliases: INTANGIBLE_GOODWILL_ALIASES }]).total,
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'impairmentToOperatingProfit',
    label: '减值侵蚀率',
    group: 'assetQuality',
    formula: '资产及信用减值绝对额 / |营业利润|',
    kind: 'percent',
    description: '观察资产减值、信用减值或港股减值拨备相对经营利润的侵蚀程度。不同报表可能以损失或收益列示，因此统一使用绝对额。',
    requirements: [
      { label: '资产减值、信用减值或减值拨备', table: 'income', aliases: IMPAIRMENT_ALIASES },
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRows(context.income, year, [{ label: '减值及拨备', aliases: IMPAIRMENT_ALIASES }]).total,
        absoluteValue(rowValue(context.income, year, OPERATING_PROFIT_ALIASES))
      )
  }
];
