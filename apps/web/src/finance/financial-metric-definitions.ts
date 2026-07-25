import { OPERATING_CASHFLOW_ALIASES } from './financial-metric-fields';
import type { MetricDefinition, MetricGroupKey } from './financial-metric-types';
import { profitabilityDefinitions } from './financial-metric-definitions/profitability';
import { cashQualityDefinitions } from './financial-metric-definitions/cashQuality';
import { growthDefinitions } from './financial-metric-definitions/growth';
import { solvencyDefinitions } from './financial-metric-definitions/solvency';
import { efficiencyDefinitions } from './financial-metric-definitions/efficiency';
import { assetQualityDefinitions } from './financial-metric-definitions/assetQuality';
import { judgmentDefinitions } from './financial-metric-definitions/judgment';

export const metricGroups: Array<{ key: MetricGroupKey; label: string }> = [
  { key: 'profitability', label: '盈利能力' },
  { key: 'cashQuality', label: '现金质量' },
  { key: 'growth', label: '成长能力' },
  { key: 'solvency', label: '偿债能力' },
  { key: 'efficiency', label: '营运效率' },
  { key: 'assetQuality', label: '研发与资产' },
  { key: 'judgment', label: '判断指标' }
];

export const definitions: MetricDefinition[] = [
  ...profitabilityDefinitions,
  ...cashQualityDefinitions,
  ...growthDefinitions,
  ...solvencyDefinitions,
  ...efficiencyDefinitions,
  ...assetQualityDefinitions,
  ...judgmentDefinitions
];

export function definitionForMarket(definition: MetricDefinition, market: 'a' | 'hk'): MetricDefinition {
  if (market !== 'hk') return definition;
  const operatingCashName = '经营业务现金净额';
  const overrides: Record<string, Partial<MetricDefinition>> = {
    internalAssetReturn: {
      label: '内部资产收益率（港股口径）',
      formula: '营业利润 / (总资产 - 联营公司权益 - 合营公司权益)',
      description: '港股口径：扣除联营公司和合营公司权益后，观察内部经营资产的收益效率。'
    },
    netAssetCashReturn: {
      label: '经营现金资产回报率',
      formula: `${operatingCashName} / 平均资产`,
      description: `观察${operatingCashName}相对于平均总资产的回报水平。`
    },
    operatingCashflowAboveProfit: {
      label: `${operatingCashName} > 净利润 > 0`,
      formula: `${operatingCashName} > 净利润 > 0`
    },
    cashEquivalentIncreasePositive: {
      label: '期末现金 > 期初现金',
      formula: '期末现金 - 期初现金 > 0',
      description: '港股口径：期末现金高于期初现金时通过。'
    },
    endingCashAboveDebt: {
      label: '期末现金 > 有息负债',
      formula: '期末现金 > 有息负债'
    },
    investmentOutflowAboveInflow: {
      label: '投资业务现金净额 < 0',
      formula: '投资业务现金净额 < 0',
      description: '港股口径：投资业务现金净额为负时，表示投资现金流出大于流入。'
    }
  };
  const override = overrides[definition.key] ?? {};
  const marketDefinition = {
    ...definition,
    ...override,
    requirements: definition.requirements.map((requirement) =>
      requirement.aliases === OPERATING_CASHFLOW_ALIASES
        ? { ...requirement, label: operatingCashName }
        : requirement
    )
  };
  const useHongKongNames = (value: string) => value
    .split('营业总收入').join('营运收入')
    .split('营业成本').join('销售成本')
    .split('营业收入').join('营业额')
    .split('利息支出').join('融资成本')
    .split('营业利润').join('经营溢利');
  return {
    ...marketDefinition,
    label: useHongKongNames(marketDefinition.label),
    formula: useHongKongNames(marketDefinition.formula),
    description: useHongKongNames(marketDefinition.description),
    requirements: marketDefinition.requirements.map((requirement) => ({
      ...requirement,
      label: useHongKongNames(requirement.label)
    }))
  };
}
