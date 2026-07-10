# Finance Query Site Notes

## Project

- Path: `D:\finance-query-site`
- Backend: NestJS + TypeScript
- Frontend: Vue 3 + TypeScript + ECharts
- Data source: AKShare through the Python bridge
- Local storage: SQLite
- Package manager: npm
- Local URL: `http://localhost:3000`

## Commands

- Type check: `npm run typecheck`
- Build: `npm run build`
- Start production server: `npm run start`

## Git

- Local `main` is currently ahead of `origin/main` by multiple commits.
- Latest known commit: `b72e187 Add cache and peer metric comparison panels`
- Push status should be checked before continuing remote work.

## Implemented Features

- Search A-share and Hong Kong stock companies.
- Fetch the latest 10 years of financial statements.
- Persist financial statement payloads and normalized rows into SQLite.
- Avoid repeated AKShare pulls when cached financial statements are available.
- Favorites are stored in SQLite.
- Company page state is persisted in URL query params with `market` and `symbol`.
- Peer quote data is cached for one week.
- Weekly financial statement refresh task is available.
- Manual refresh task button is available in the UI.
- Search results are shown in a dropdown under the search box.
- The old left-side company rail is removed.

## Statement Table

- Supports raw values, YoY, and ratio views.
- Supports unit display switching: original unit, `万`, and `亿`.
- YoY increase is red, decrease is green.
- Hovering over a Chinese line item shows the English/source field name.
- A-share rows preserve both Chinese display names and source field names.

## Cache Visibility

- Financial statement cache status is shown in the UI:
  - local cache
  - freshly updated
  - refresh time
- Peer comparison cache status is also shown in the UI.

## Fixed Metric Charts

The app intentionally does not include a user-editable formula builder. A previous attempt was removed because A-share and Hong Kong stock fields are not universal enough. Future formulas should be implemented directly in code after the user specifies them.

Current fixed metrics:

- ROE = net profit / average shareholders' equity
- ROA = net profit / average total assets
- Current ratio = current assets / current liabilities
- Quick ratio = (current assets - inventory) / current liabilities
- Cash debt ratio = cash and cash equivalents / interest-bearing debt
- Operating margin = operating profit / revenue
- Net margin = net profit / revenue
- Revenue growth = (current revenue - previous revenue) / previous revenue
- Operating profit growth = (current operating profit - previous operating profit) / previous operating profit
- Asset growth = (current assets - previous assets) / previous assets
- Net asset growth = (current net assets - previous net assets) / previous net assets
- Receivables turnover = revenue / average accounts receivable
- Inventory turnover = operating cost / average inventory
- Fixed asset turnover = revenue / net fixed assets
- Gross margin = gross profit / revenue
- Expense ratio = selling, admin, and finance expenses / revenue

## Hong Kong Stock Field Handling

For Hong Kong stock inventory turnover, if operating cost is missing, the code looks for:

- Sales cost
- Revenue cost
- Cost of sales
- Cost of revenue

If operating cost is still unavailable but revenue and gross profit are available, operating cost can be derived as `revenue - gross profit`.

## Recent Optimizations

- Metric charts are grouped into:
  - profitability
  - growth
  - solvency
  - operating efficiency
- Metric charts show anomaly hints for:
  - missing years
  - zero denominators
  - extreme percentage values
  - extreme multiple values
- Cache management panel shows:
  - SQLite cache size
  - statement cache count
  - peer cache count
  - recent cache entries
- Peer financial metric comparison chart was added.
- The peer metric chart supports:
  - companies from pulled peer comparison data
  - arbitrary locally cached companies selected by the user
- Peer/custom company comparison uses only SQLite data and does not trigger AKShare batch pulls.

## Metric Comparison APIs

- `GET /api/cache/entries`
  - Lists local cache entries.
- `GET /api/finance/peer-metrics`
  - Compares a metric across locally cached companies that appear in the pulled peer list.
- `GET /api/finance/metric-comparison`
  - Compares a metric across arbitrary locally cached companies.

## Validation

Recently verified:

- `npm run typecheck`
- `npm run build`
- Local production server at `http://localhost:3000`
- Browser smoke test for the Guizhou Maotai page
- Cache management panel rendering
- Peer financial chart rendering
- Custom local-company comparison mode
- Metric group switching
- No relevant browser console error or warning during validation

## Product Decisions

- Do not prioritize mobile layout for now.
- Do not invest in export improvements for now.
- Do not build a generic user formula editor for now.
- Add future financial charts by implementing explicit formulas in code, with separate A-share/HK field alias handling.
- Peer/custom comparison should remain SQLite-first and should not silently trigger large AKShare fetches.

## Suggested Next Steps

- Add search/filter to the custom local-company picker.
- Add single-cache-entry delete and refresh actions to the cache management panel.
- Add more fixed metrics to peer/custom comparison, such as ROE, gross margin, net margin, and revenue growth.
- Persist selected peer/custom comparison companies in localStorage.
- Improve anomaly explanations, for example "missing revenue" or "missing previous denominator".
- Move A-share/HK field aliases into a centralized configuration file for easier maintenance.
