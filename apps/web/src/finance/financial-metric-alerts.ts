import { formatMetricValue } from './financial-metric-engine';
import type { MetricAlert, MetricPoint, MetricResult } from './financial-metric-types';

export function isGrowthGapMetric(metricKey: string): boolean {
  return [
    'receivablesRevenueGrowthGap',
    'inventoryRevenueGrowthGap',
    'profitCashflowGrowthGap',
    'assetRevenueGrowthGap',
    'debtCashflowGrowthGap'
  ].includes(metricKey);
}

export function isCriticalMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.kind === 'judgment') return result.latest === 0;
  if (result.definition.key === 'roic' || result.definition.key === 'netMargin') return result.latest < 0;
  if (result.definition.key === 'revenueGrowth') return result.latest < -0.2;
  if (result.definition.key === 'operatingProfitGrowth') return result.latest < -0.3;
  if (result.definition.key === 'cashDebtRatio') return result.latest < 1;
  if (result.definition.key === 'currentRatio') return result.latest < 1.5;
  if (result.definition.key === 'quickRatio') return result.latest < 0.8;
  if (result.definition.key === 'receivablesToAssets') return result.latest > 0.3;
  if (result.definition.key === 'debtRatio') return result.latest > 0.5;
  if (result.definition.key === 'assetLiabilityRatio') return result.latest > 0.8;
  if (result.definition.key === 'operatingCashConversion') return result.latest < 0.7;
  if (result.definition.key === 'cumulativeCashConversion3y') return result.latest < 0.8;
  if (result.definition.key === 'cashCollectionRatio') return result.latest < 0.8;
  if (result.definition.key === 'freeCashFlow' || result.definition.key === 'freeCashFlowMargin') return result.latest < 0;
  if (result.definition.key === 'accrualRatio') return result.latest > 0.1;
  if (result.definition.key === 'deductedProfitRatio') return result.latest >= 0 && result.latest < 0.5;
  if (result.definition.key === 'interestCoverage') return result.latest < 1;
  if (result.definition.key === 'netDebtToOperatingCash') return result.latest > 5;
  if (result.definition.key === 'incrementalRoic3y' || result.definition.key === 'averageRoic5y') return result.latest < 0;
  if (isProfitabilityVolatilityMetric(result.definition.key)) return result.latest > 0.1;
  if (result.definition.key === 'developmentCapitalizationProxy') return result.latest > 0.5;
  if (result.definition.key === 'developmentToEquity') return result.latest > 0.2;
  if (result.definition.key === 'goodwillToEquity') return result.latest > 0.6;
  if (result.definition.key === 'intangibleGoodwillToAssets') return result.latest > 0.5;
  if (result.definition.key === 'impairmentToOperatingProfit') return result.latest > 0.5;
  if (isGrowthGapMetric(result.definition.key)) return result.latest > 0.2;
  return false;
}

export function isPositiveMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.kind === 'judgment') return result.latest === 1;
  if (result.definition.key === 'roic') return result.latest >= 0.12;
  if (result.definition.key === 'netMargin') return result.latest >= 0.1;
  if (result.definition.key === 'revenueGrowth' || result.definition.key === 'operatingProfitGrowth') return result.latest >= 0.1;
  if (result.definition.key === 'grossMargin') return result.latest > 0.4;
  if (result.definition.key === 'expenseToGrossProfitRatio') return result.latest < 0.3;
  if (result.definition.key === 'operatingCashConversion' || result.definition.key === 'cumulativeCashConversion3y') return result.latest >= 1;
  if (result.definition.key === 'cashCollectionRatio') return result.latest >= 1;
  if (result.definition.key === 'freeCashFlowMargin') return result.latest >= 0.1;
  if (result.definition.key === 'accrualRatio') return result.latest <= 0;
  if (result.definition.key === 'deductedProfitRatio') return result.latest >= 0.9;
  if (result.definition.key === 'interestCoverage') return result.latest >= 5;
  if (result.definition.key === 'netDebtToOperatingCash') return result.latest < 2;
  if (result.definition.key === 'incrementalRoic3y' || result.definition.key === 'averageRoic5y') return result.latest >= 0.15;
  if (isProfitabilityVolatilityMetric(result.definition.key)) return result.latest <= 0.03;
  if (isGrowthGapMetric(result.definition.key)) return result.latest <= 0;
  return false;
}

export function isWarningMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.key === 'roic') return result.latest >= 0 && result.latest < 0.05;
  if (result.definition.key === 'netMargin') return result.latest >= 0 && result.latest < 0.03;
  if (result.definition.key === 'revenueGrowth') return result.latest >= -0.2 && result.latest < 0;
  if (result.definition.key === 'operatingProfitGrowth') return result.latest >= -0.3 && result.latest < 0;
  if (result.definition.key === 'currentRatio') return result.latest > 2.5;
  if (result.definition.key === 'quickRatio') return result.latest > 1.2;
  if (result.definition.key === 'assetLiabilityRatio') return result.latest > 0.7 && result.latest <= 0.8;
  if (result.definition.key === 'operatingCashConversion') return result.latest >= 0.7 && result.latest < 1;
  if (result.definition.key === 'cumulativeCashConversion3y') return result.latest >= 0.8 && result.latest < 1;
  if (result.definition.key === 'cashCollectionRatio') return result.latest >= 0.8 && result.latest < 1;
  if (result.definition.key === 'freeCashFlowMargin') return result.latest >= 0 && result.latest < 0.05;
  if (result.definition.key === 'accrualRatio') return result.latest > 0.05;
  if (result.definition.key === 'deductedProfitRatio') return result.latest >= 0.5 && result.latest < 0.9;
  if (result.definition.key === 'interestCoverage') return result.latest >= 1 && result.latest < 3;
  if (result.definition.key === 'netDebtToOperatingCash') return result.latest >= 3 && result.latest <= 5;
  if (result.definition.key === 'incrementalRoic3y' || result.definition.key === 'averageRoic5y') return result.latest >= 0 && result.latest < 0.08;
  if (isProfitabilityVolatilityMetric(result.definition.key)) return result.latest > 0.05 && result.latest <= 0.1;
  if (result.definition.key === 'developmentCapitalizationProxy') return result.latest > 0.3 && result.latest <= 0.5;
  if (result.definition.key === 'developmentToEquity') return result.latest > 0.1 && result.latest <= 0.2;
  if (result.definition.key === 'goodwillToEquity') return result.latest > 0.3 && result.latest <= 0.6;
  if (result.definition.key === 'intangibleGoodwillToAssets') return result.latest > 0.3 && result.latest <= 0.5;
  if (result.definition.key === 'impairmentToOperatingProfit') return result.latest > 0.2 && result.latest <= 0.5;
  if (isGrowthGapMetric(result.definition.key)) return result.latest > 0.1 && result.latest <= 0.2;
  return false;
}

function isProfitabilityVolatilityMetric(metricKey: string): boolean {
  return [
    'roicVolatility5y',
    'grossMarginVolatility5y',
    'operatingMarginVolatility5y'
  ].includes(metricKey);
}

export function metricAlerts(
  definition: MetricResult['definition'],
  points: MetricPoint[]
): MetricAlert[] {
  const alerts: MetricAlert[] = [];
  const missingYears = points.filter((point) => point.value === null).map((point) => point.year);
  if (missingYears.length) {
    alerts.push({
      message: `${missingYears.join('、')} 无法计算，通常是公式科目缺失或分母为 0。`,
      tone: 'warning'
    });
  }

  const validPoints = points.filter((point) => point.value !== null);
  const latest = validPoints[0];
  const previous = validPoints[1];
  if (latest?.value !== null && latest?.value !== undefined) {
    if (isGrowthGapMetric(definition.key) && latest.value > 0.1) {
      const persistent = previous?.value !== null && previous?.value !== undefined && previous.value > 0.1;
      alerts.push({
        year: latest.year,
        message: persistent
          ? `${latest.year} 与上一年连续出现超过10个百分点的增长背离，建议核查变化原因。`
          : `${latest.year} 增长背离达到 ${formatMetricValue(latest.value, 'percent')}，建议核查变化原因。`,
        tone: latest.value > 0.2 || persistent ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'operatingCashConversion' && latest.value < 1) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 每1元净利润仅转化为 ${formatMetricValue(latest.value, 'times')} 经营现金。`,
        tone: latest.value < 0.7 ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'cumulativeCashConversion3y' && latest.value < 1) {
      alerts.push({
        year: latest.year,
        message: `截至${latest.year}的三年累计利润尚未等额转化为经营现金。`,
        tone: latest.value < 0.8 ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'freeCashFlowMargin' && latest.value < 0) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 自由现金流为负，需判断是主动扩产还是经营造血不足。`,
        tone: 'warning'
      });
    }
    if (definition.key === 'accrualRatio' && latest.value > 0.05) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 应计利润率为 ${formatMetricValue(latest.value, 'percent')}，利润对非现金项目的依赖较高。`,
        tone: latest.value > 0.1 ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'deductedProfitRatio' && latest.value >= 0 && latest.value < 0.9) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 扣非利润占比为 ${formatMetricValue(latest.value, 'percent')}，需检查非经常损益来源。`,
        tone: latest.value < 0.5 ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'interestCoverage' && latest.value < 3) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 利息保障倍数为 ${formatMetricValue(latest.value, 'times')}，偿息安全边际偏低。`,
        tone: latest.value < 1 ? 'danger' : 'warning'
      });
    }
    if (definition.key === 'netDebtToOperatingCash' && latest.value > 3) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 净债务相当于 ${formatMetricValue(latest.value, 'times')} 年经营现金流。`,
        tone: latest.value > 5 ? 'danger' : 'warning'
      });
    }
    if (
      (definition.key === 'incrementalRoic3y' || definition.key === 'averageRoic5y') &&
      latest.value < 0.08
    ) {
      alerts.push({
        year: latest.year,
        message: definition.key === 'incrementalRoic3y'
          ? `${latest.year} 三年增量ROIC为 ${formatMetricValue(latest.value, 'percent')}，新增资本回报偏低。`
          : `${latest.year} 五年平均ROIC为 ${formatMetricValue(latest.value, 'percent')}，长期资本回报偏低。`,
        tone: latest.value < 0 ? 'danger' : 'warning'
      });
    }
    if (isProfitabilityVolatilityMetric(definition.key) && latest.value > 0.05) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 五年盈利指标标准差为 ${formatMetricValue(latest.value, 'percent')}，跨周期波动较大。`,
        tone: latest.value > 0.1 ? 'danger' : 'warning'
      });
    }
    const assetQualityAlert = assetQualityAlertFor(definition.key, latest.value, latest.year);
    if (assetQualityAlert) alerts.push(assetQualityAlert);
    if (
      definition.key === 'cashConversionCycle' &&
      previous?.value !== null &&
      previous?.value !== undefined &&
      latest.value - previous.value > 30
    ) {
      alerts.push({
        year: latest.year,
        message: `${latest.year} 现金循环周期较上一年拉长 ${formatMetricValue(latest.value - previous.value, 'days')}。`,
        tone: 'warning'
      });
    }
  }

  for (const point of points) {
    if (point.value === null) continue;
    if (definition.kind === 'percent' && Math.abs(point.value) >= 10) {
      alerts.push({
        year: point.year,
        message: `${point.year} 数值达到 ${formatMetricValue(point.value, definition.kind)}，建议核对公式明细。`,
        tone: 'danger'
      });
    }
    if (definition.kind === 'times' && Math.abs(point.value) >= 100) {
      alerts.push({
        year: point.year,
        message: `${point.year} 倍数达到 ${formatMetricValue(point.value, definition.kind)}，可能由分母过小导致。`,
        tone: 'warning'
      });
    }
  }

  return alerts.slice(0, 3);
}

function assetQualityAlertFor(metricKey: string, value: number, year: string): MetricAlert | null {
  if (metricKey === 'developmentCapitalizationProxy' && value > 0.3) {
    return {
      year,
      message: `${year} 研发资本化代理率为 ${formatMetricValue(value, 'percent')}，需结合无形资产转入和研发附注核查。`,
      tone: value > 0.5 ? 'danger' : 'warning'
    };
  }
  if (metricKey === 'developmentToEquity' && value > 0.1) {
    return {
      year,
      message: `${year} 开发支出占净资产 ${formatMetricValue(value, 'percent')}，项目失败或减值的权益影响较大。`,
      tone: value > 0.2 ? 'danger' : 'warning'
    };
  }
  if (metricKey === 'goodwillToEquity' && value > 0.3) {
    return {
      year,
      message: `${year} 商誉相当于净资产的 ${formatMetricValue(value, 'percent')}，需检查并购标的业绩与减值测试。`,
      tone: value > 0.6 ? 'danger' : 'warning'
    };
  }
  if (metricKey === 'intangibleGoodwillToAssets' && value > 0.3) {
    return {
      year,
      message: `${year} 商誉及无形资产占总资产 ${formatMetricValue(value, 'percent')}，资产估值依赖度较高。`,
      tone: value > 0.5 ? 'danger' : 'warning'
    };
  }
  if (metricKey === 'impairmentToOperatingProfit' && value > 0.2) {
    return {
      year,
      message: `${year} 减值及拨备相当于营业利润的 ${formatMetricValue(value, 'percent')}，利润受资产质量影响较大。`,
      tone: value > 0.5 ? 'danger' : 'warning'
    };
  }
  return null;
}
