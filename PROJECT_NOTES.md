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

- Local `main` is synchronized with `origin/main` as of this update.
- Latest known commit: `43feed2 Rebuild financial trend panel with ECharts`
- Recent related commits:
  - `86024db Add interactive statement item trends`
  - `43feed2 Rebuild financial trend panel with ECharts`

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
- Company pages show the latest 60 days of announcements from AKShare/CNInfo with category filters.
- Favorite-company announcements refresh every 12 hours in batches of two, with a request gap to reduce rate-limit risk.
- Favorite tabs show a red dot for newly discovered announcements until that company page is opened.

## Statement Table

- Supports raw values, YoY, and ratio views.
- Supports unit display switching: original unit, `万`, and `亿`.
- YoY increase is red, decrease is green.
- Hovering over a Chinese line item shows the English/source field name.
- A-share rows preserve both Chinese display names and source field names.
- The table has its own vertically scrollable viewport.
- The year header remains sticky while statement rows scroll.
- The first line-item column remains sticky during horizontal scrolling.
- Statement line items are clickable and keyboard accessible.
- Clicking a line item opens an ECharts trend chart between the statement tabs and table.
- The selected table row is highlighted.
- Clicking the selected line item again, or using the chart close button, hides the chart.
- Switching between balance sheet, income statement, and cash-flow statement clears the previous line-item selection.

## Statement Item Trend Chart

- Implemented in `apps/web/src/components/StatementItemTrend.vue`.
- Uses one ECharts Canvas instance for the currently selected statement line item.
- Displays active years from oldest to newest.
- Follows the statement table unit switch: original unit, `万`, or `亿`.
- Every non-empty annual value is rendered directly above its data point.
- Hover details retain the converted value and original raw value.
- Missing values remain gaps instead of being connected or treated as zero.
- The chart displays the English/source field name when it differs from the Chinese display name.

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

- Peer comparison details are collapsed by default and can be manually expanded or collapsed from the panel header.
- Refresh task status and cache management now live on a dedicated settings page opened from the top-right settings button.
- The settings page preserves the current company in the URL and lists all cache entries.
- Custom local-company picker now supports filtering by company name, stock code, and market.
- The picker shows matching/selected counts, an empty-result hint, and all cached statement companies instead of only the latest 24.
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
- Statement tables now use a bounded scroll area with sticky year headers.
- Statement line items can be selected to generate an on-demand 10-year trend chart.
- Line-item trend charts show annual values directly on the chart instead of requiring Hover.
- The old hand-written SVG `trend-panel` was replaced with an ECharts implementation.

## Core Financial Trend Panel

The overview panel in `apps/web/src/components/MiniTrend.vue` now uses ECharts instead of manually generated SVG paths.

- Displays up to five highlights:
  - total assets
  - total liabilities
  - revenue
  - net profit
  - operating cash flow
- Supports two views:
  - `增长指数`: each series uses its first valid non-zero value as the base value of 100, making growth rates comparable across metrics with different scales.
  - `实际金额`: shows actual financial scale and automatically chooses original units, `万`, or `亿`.
- Native ECharts legend interaction can show or hide individual series.
- Missing values are rendered as gaps.
- Tooltip details include:
  - actual amount
  - year-over-year change
  - base-100 growth index
- Positive YoY values are red and negative YoY values are green.
- The active view is component-local UI state and is not persisted in the URL or SQLite.
- Base-100 values are comparative indices, not actual amounts. The actual-amount view should be used when financial scale matters.

## Metric Comparison APIs

- `GET /api/cache/entries`
  - Lists local cache entries.
- `GET /api/finance/peer-metrics`
  - Compares a metric across locally cached companies that appear in the pulled peer list.
- `GET /api/finance/metric-comparison`
  - Compares a metric across arbitrary locally cached companies.

## Announcement APIs

- `GET /api/finance/announcements?market=a&symbol=600519`
  - Returns the latest cached announcements and refreshes a stale company cache on demand.
- `POST /api/finance/announcements/:market/:symbol/viewed`
  - Marks a favorite company's currently discovered announcements as viewed.

Announcement refresh defaults:

- refresh interval: 12 hours
- scheduler check: every 15 minutes
- batch size: 2 favorite companies
- request gap within a batch: 3 seconds
- announcement lookback: 60 days

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
- Sticky statement headers and independent table scrolling
- Balance-sheet, income-statement, and cash-flow line-item selection
- Direct annual labels in statement item trend charts
- Core financial trend growth-index and actual-amount views
- Core financial trend Tooltip contents and view switching
- A-share rendering with Guizhou Maotai (`600519`)
- Hong Kong stock rendering with Tencent (`00700`)
- No relevant browser console error or warning during validation

## Product Decisions

- Do not prioritize mobile layout for now.
- Do not invest in export improvements for now.
- Do not build a generic user formula editor for now.
- Add future financial charts by implementing explicit formulas in code, with separate A-share/HK field alias handling.
- Peer/custom comparison should remain SQLite-first and should not silently trigger large AKShare fetches.

## Suggested Next Steps

- Add single-cache-entry delete and refresh actions to the cache management panel.
- Add more fixed metrics to peer/custom comparison, such as ROE, gross margin, net margin, and revenue growth.
- Persist selected peer/custom comparison companies in localStorage.
- Improve anomaly explanations, for example "missing revenue" or "missing previous denominator".
- Move A-share/HK field aliases into a centralized configuration file for easier maintenance.
