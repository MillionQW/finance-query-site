import type { StatementTable } from '../types/finance';

export function exportStatementCsv(
  table: StatementTable,
  years: string[],
  filename: string
): void {
  const header = ['项目', ...years];
  const lines = table.rows.map((row) =>
    [row.item, ...years.map((year) => row.values[year] ?? '')]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
