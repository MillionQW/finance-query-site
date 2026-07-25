import type { FinancialStatements } from '../types/finance';
import { metricAlerts } from './financial-metric-alerts';
import { metricDetails, missingRequirements } from './financial-metric-calculations';
import type { MetricContext, MetricDefinition, MetricResult } from './financial-metric-types';

export function evaluateFinancialMetrics(
  statements: FinancialStatements | null,
  activeYears: string[],
  definitions: MetricDefinition[]
): MetricResult[] {
  if (!statements) {
    return definitions.map((definition) => ({
      definition,
      points: [],
      latest: null,
      missing: [],
      alerts: []
    }));
  }

  const context: MetricContext = {
    statements,
    balance: statements.tables.find((table) => table.type === 'balance'),
    income: statements.tables.find((table) => table.type === 'income'),
    cashflow: statements.tables.find((table) => table.type === 'cashflow')
  };
  const years = activeYears.length ? activeYears : statements.years;

  return definitions.map((definition) => {
    const points = years.map((year) => {
      const yearIndex = statements.years.indexOf(year);
      const details = metricDetails(definition, context, year, yearIndex);
      return {
        year,
        value: definition.calculate(context, year, yearIndex),
        details: details.rows,
        expression: details.expression
      };
    });

    return {
      definition,
      points,
      latest: points.find((point) => point.value !== null)?.value ?? null,
      missing: missingRequirements(definition, context),
      alerts: metricAlerts(definition, points)
    };
  });
}
