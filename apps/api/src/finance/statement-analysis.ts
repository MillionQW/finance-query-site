import { createHash } from 'node:crypto';
import type {
  FinancialStatements,
  StatementQualityCheck,
  StatementQualitySummary,
  StatementRevisionChange,
  StatementRow,
  StatementTable
} from './types';

type StatementType = StatementTable['type'];

const KEY_METRICS = ['assets', 'liabilities', 'revenue', 'netProfit', 'operatingCashflow'];

function normalizeLabel(value: string): string {
  return value.replace(/[\s_（）()]/g, '').toUpperCase();
}

function numeric(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function findRow(table: StatementTable | undefined, aliases: string[]): StatementRow | undefined {
  if (!table) return undefined;
  const normalizedAliases = aliases.map(normalizeLabel);
  return table.rows.find((row) => {
    const candidates = [row.item, row.sourceItem ?? ''].map(normalizeLabel);
    return candidates.some((candidate) =>
      normalizedAliases.some((alias) => candidate === alias || candidate.includes(alias))
    );
  });
}

function rowNumber(
  table: StatementTable | undefined,
  aliases: string[],
  period: string
): number | null {
  return numeric(findRow(table, aliases)?.values[period]);
}

function balanceEquationCheck(
  statements: FinancialStatements,
  latestYear: string | undefined
): StatementQualityCheck {
  if (!latestYear) {
    return {
      key: 'balance-equation',
      label: '资产负债表勾稽',
      status: 'unavailable',
      detail: '缺少可用于校验的年度。'
    };
  }
  const balance = statements.tables.find((table) => table.type === 'balance');
  const assets = rowNumber(balance, ['总资产', '资产总计', 'TOTAL_ASSETS'], latestYear);
  const liabilities = rowNumber(
    balance,
    ['总负债', '负债合计', 'TOTAL_LIABILITIES'],
    latestYear
  );
  const equity = rowNumber(
    balance,
    [
      '所有者权益合计',
      '股东权益合计',
      '权益总额',
      '总权益',
      '净资产',
      'TOTAL_EQUITY'
    ],
    latestYear
  );
  if (assets === null || liabilities === null || equity === null) {
    return {
      key: 'balance-equation',
      label: '资产负债表勾稽',
      status: 'unavailable',
      detail: `${latestYear} 年缺少资产、负债或权益合计字段。`
    };
  }
  const difference = assets - liabilities - equity;
  const tolerance = Math.max(Math.abs(assets) * 0.001, 1);
  const ratio = Math.abs(difference) / Math.max(Math.abs(assets), 1);
  return {
    key: 'balance-equation',
    label: '资产负债表勾稽',
    status: Math.abs(difference) <= tolerance ? 'pass' : ratio <= 0.01 ? 'warning' : 'fail',
    detail: Math.abs(difference) <= tolerance
      ? `${latestYear} 年资产＝负债＋权益。`
      : `${latestYear} 年勾稽差额为资产的 ${(ratio * 100).toFixed(2)}%。`
  };
}

function cashReconciliationCheck(
  statements: FinancialStatements,
  latestYear: string | undefined
): StatementQualityCheck {
  if (!latestYear) {
    return {
      key: 'cash-reconciliation',
      label: '现金流勾稽',
      status: 'unavailable',
      detail: '缺少可用于校验的年度。'
    };
  }
  const cashflow = statements.tables.find((table) => table.type === 'cashflow');
  const ending = rowNumber(
    cashflow,
    ['期末现金及现金等价物余额', '现金及现金等价物期末余额', 'CASH_EQUIVALENTS_END'],
    latestYear
  );
  const beginning = rowNumber(
    cashflow,
    ['期初现金及现金等价物余额', '现金及现金等价物期初余额', 'CASH_EQUIVALENTS_BEGIN'],
    latestYear
  );
  const increase = rowNumber(
    cashflow,
    ['现金及现金等价物净增加额', '现金等价物净增加额', 'NET_INCREASE_CASH'],
    latestYear
  );
  if (ending === null || beginning === null || increase === null) {
    return {
      key: 'cash-reconciliation',
      label: '现金流勾稽',
      status: 'unavailable',
      detail: `${latestYear} 年缺少期初、期末或净增加额字段。`
    };
  }
  const difference = ending - beginning - increase;
  const tolerance = Math.max(Math.abs(ending) * 0.005, 1);
  return {
    key: 'cash-reconciliation',
    label: '现金流勾稽',
    status: Math.abs(difference) <= tolerance ? 'pass' : 'warning',
    detail: Math.abs(difference) <= tolerance
      ? `${latestYear} 年期末现金与本期变动可以勾稽。`
      : `${latestYear} 年现金流勾稽存在 ${Math.abs(difference).toLocaleString('zh-CN')} 的差额。`
  };
}

export function evaluateStatementQuality(
  statements: FinancialStatements
): StatementQualitySummary {
  const latestYear = statements.years[0];
  const tableCount = statements.tables.filter((table) => table.rows.length > 0).length;
  const availableMetrics = statements.highlights.filter((series) =>
    series.points.some((point) => point.year === latestYear && point.value !== null)
  ).length;
  const periodTableCount = (statements.periodTables ?? []).filter(
    (table) => table.rows.length > 0
  ).length;
  const checks: StatementQualityCheck[] = [
    {
      key: 'statement-coverage',
      label: '三表完整度',
      status: tableCount === 3 ? 'pass' : tableCount === 2 ? 'warning' : 'fail',
      detail: `已识别 ${tableCount}/3 张年度报表。`
    },
    {
      key: 'key-metric-coverage',
      label: '关键指标覆盖',
      status: availableMetrics === KEY_METRICS.length
        ? 'pass'
        : availableMetrics >= 3
          ? 'warning'
          : 'fail',
      detail: `${latestYear ?? '最新年度'}覆盖 ${availableMetrics}/${KEY_METRICS.length} 个核心指标。`
    },
    balanceEquationCheck(statements, latestYear),
    cashReconciliationCheck(statements, latestYear),
    {
      key: 'reporting-period-coverage',
      label: '报告期覆盖',
      status: periodTableCount === 3
        ? 'pass'
        : periodTableCount > 0
          ? 'warning'
          : 'unavailable',
      detail: periodTableCount
        ? `已识别 ${periodTableCount}/3 张季报或中报。`
        : '当前缓存尚未包含季报或中报。'
    }
  ];

  const availableChecks = checks.filter((check) => check.status !== 'unavailable');
  const points = availableChecks.reduce((total, check) => {
    if (check.status === 'pass') return total + 1;
    if (check.status === 'warning') return total + 0.55;
    return total;
  }, 0);
  const score = availableChecks.length
    ? Math.round((points / availableChecks.length) * 100)
    : 0;
  const coveragePercent = Math.round(
    (checks.filter((check) => check.status !== 'unavailable').length / checks.length) * 100
  );
  const hasFailure = checks.some((check) => check.status === 'fail');

  return {
    score,
    tone: hasFailure || score < 60 ? 'risk' : score < 85 ? 'attention' : 'good',
    coveragePercent,
    checks
  };
}

interface FlatValue {
  scope: StatementRevisionChange['scope'];
  statementType: StatementType;
  item: string;
  sourceItem: string;
  period: string;
  value: number;
}

function flattenValues(statements: FinancialStatements): Map<string, FlatValue> {
  const result = new Map<string, FlatValue>();
  const addRows = (
    scope: FlatValue['scope'],
    table: { type: StatementType; rows: StatementRow[] },
    periods: string[]
  ) => {
    for (const row of table.rows) {
      const sourceItem = row.sourceItem || row.item;
      for (const period of periods) {
        const value = numeric(row.values[period]);
        if (value === null) continue;
        const key = `${scope}:${table.type}:${sourceItem}:${period}`;
        result.set(key, {
          scope,
          statementType: table.type,
          item: row.item,
          sourceItem,
          period,
          value
        });
      }
    }
  };
  for (const table of statements.tables) addRows('annual', table, table.years);
  for (const table of statements.periodTables ?? []) {
    addRows('reporting-period', table, table.periods);
  }
  return result;
}

export function diffFinancialStatements(
  previous: FinancialStatements,
  current: FinancialStatements
): StatementRevisionChange[] {
  const before = flattenValues(previous);
  const after = flattenValues(current);
  const changes: StatementRevisionChange[] = [];
  for (const [key, currentValue] of after) {
    const previousValue = before.get(key);
    if (!previousValue) continue;
    const changeAmount = currentValue.value - previousValue.value;
    const tolerance = Math.max(Math.abs(previousValue.value) * 1e-9, 1e-6);
    if (Math.abs(changeAmount) <= tolerance) continue;
    const changePercent = previousValue.value === 0
      ? null
      : (changeAmount / Math.abs(previousValue.value)) * 100;
    const material = changePercent === null || Math.abs(changePercent) >= 1;
    changes.push({
      scope: currentValue.scope,
      statementType: currentValue.statementType,
      item: currentValue.item,
      sourceItem: currentValue.sourceItem,
      period: currentValue.period,
      previousValue: previousValue.value,
      currentValue: currentValue.value,
      changeAmount,
      changePercent,
      material
    });
  }
  return changes.sort((a, b) => {
    if (a.material !== b.material) return a.material ? -1 : 1;
    return Math.abs(b.changePercent ?? Number.POSITIVE_INFINITY)
      - Math.abs(a.changePercent ?? Number.POSITIVE_INFINITY);
  });
}

export function statementDataForHash(statements: FinancialStatements): object {
  return {
    schemaVersion: statements.schemaVersion ?? 1,
    company: {
      market: statements.company.market,
      symbol: statements.company.symbol
    },
    years: statements.years,
    ...(statements.reportingCurrency !== undefined ? { reportingCurrency: statements.reportingCurrency } : {}),
    ...(statements.amountScale !== undefined ? { amountScale: statements.amountScale } : {}),
    tables: statements.tables,
    reportPeriods: statements.reportPeriods ?? [],
    periodTables: statements.periodTables ?? []
  };
}

export function hashStatementData(statements: FinancialStatements): string {
  return createHash('sha256')
    .update(JSON.stringify(statementDataForHash(statements)))
    .digest('hex');
}
