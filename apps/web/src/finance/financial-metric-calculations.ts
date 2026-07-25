import {
  HK_ASSOCIATE_JOINT_VENTURE_GROUPS,
  HK_INVESTMENT_CASH_NET_ALIASES,
  LONG_TERM_EQUITY_INVESTMENT_ALIASES
} from './financial-metric-fields';
import { findRow } from './financial-metric-engine';
import {
  cashEquivalentIncrease,
  operatingCostDetails
} from './financial-metric-calculation-helpers';
import type { FormulaDetails, MetricContext, MetricDefinition, MetricGroupKey } from './financial-metric-types';
import { profitabilityMetricDetails } from './financial-metric-details/profitability';
import { cashQualityMetricDetails } from './financial-metric-details/cashQuality';
import { growthMetricDetails } from './financial-metric-details/growth';
import { solvencyMetricDetails } from './financial-metric-details/solvency';
import { efficiencyMetricDetails } from './financial-metric-details/efficiency';
import { assetQualityMetricDetails } from './financial-metric-details/assetQuality';
import { judgmentMetricDetails } from './financial-metric-details/judgment';

type MetricDetailsBuilder = (
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
) => FormulaDetails | null;

const metricDetailsByGroup: Record<MetricGroupKey, MetricDetailsBuilder> = {
  profitability: profitabilityMetricDetails,
  cashQuality: cashQualityMetricDetails,
  growth: growthMetricDetails,
  solvency: solvencyMetricDetails,
  efficiency: efficiencyMetricDetails,
  assetQuality: assetQualityMetricDetails,
  judgment: judgmentMetricDetails
};

export function metricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails {
  return metricDetailsByGroup[definition.group](definition, context, year, yearIndex) ?? {
    rows: [],
    expression: '-'
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
