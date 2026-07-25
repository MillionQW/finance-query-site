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

## Local AKShare Reference Repository

- AKShare has been cloned locally to `D:\akshare`.
- Remote repository: `https://github.com/akfamily/akshare.git`
- Local documentation root: `D:\akshare\docs`
- Public fund and ETF documentation: `D:\akshare\docs\data\fund\fund_public.md`
- ETF implementation source: `D:\akshare\akshare\fund\fund_etf_em.py`
- When implementing or debugging AKShare integrations, check this local repository's documentation and source before relying on memory or external summaries.
- Search the local documentation and source with `rg`, for example:
  - `rg -n "fund_etf_spot_em" D:\akshare\docs D:\akshare\akshare`
- Update the local AKShare reference repository when newer API behavior needs to be checked:
  - `git -C D:\akshare pull --ff-only`
- The finance app still uses the AKShare version installed in `D:\finance-query-site\.venv`; cloning the reference repository does not automatically change the installed package version.

## Git

- Local `main` is synchronized with `origin/main` as of this update.
- Latest known feature commit: `c7e8801 Add ETF research and tracking-index valuation`
- Recent related commits:
  - `c7e8801 Add ETF research and tracking-index valuation`
  - `39caecf Document local AKShare reference repository`
  - `1c426f6 Update project notes with recent chart improvements`
  - `86024db Add interactive statement item trends`
  - `43feed2 Rebuild financial trend panel with ECharts`

## Implemented Features

- Search A-share and Hong Kong stock companies.
- Fetch all annual financial statements from the company's listing year onward.
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
- A dedicated ETF research page is available with URL state such as `?view=etf&etf=510300`.

## ETF Research Phase 1

The first ETF implementation is complete and reuses the existing NestJS, Python bridge, SQLite, Vue 3, and ECharts stack.

Current ETF features:

- Switch between the existing company page and ETF research from the top navigation.
- Search ETFs by code or name.
- Filter by Shanghai or Shenzhen exchange.
- Sort by turnover amount, change percentage, fund size, turnover rate, premium/discount rate, or code.
- Display up to 100 matching ETFs in a sticky-header market table.
- Preserve the selected ETF in the URL and restore it after refresh or browser navigation.
- Display the selected ETF's:
  - latest price and daily change
  - IOPV
  - premium/discount rate
  - turnover amount
  - turnover rate
  - market capitalization / estimated fund scale
  - latest share count
- Display up to 10 years of daily price history with selectable 1-month, 3-month, 1-year, 3-year, and full-history ranges.
- Display turnover amount when Eastmoney history data is available, otherwise clearly fall back to turnover volume from Sina.
- Calculate from locally cached unadjusted price history:
  - 20-day price return
  - 60-day price return
  - year-to-date price return
  - annualized price return
  - annualized volatility
  - maximum drawdown
  - current drawdown
  - Sharpe ratio using a 2% annual risk-free-rate assumption
  - period high and low
- Save ETF favorites in SQLite.
- Display the selected ETF's tracking-index price-to-earnings ratio without treating the ETF itself as an operating company:
  - primary value: CSI index `PE1`, based on total shares
  - supporting value: CSI index `PE2`, based on calculated shares
  - tracking-index name/code and valuation date
  - explicit unavailable state when the tracking target cannot be uniquely matched to a CSI index

ETF data sources and fallback behavior:

- Market quotes: `ak.fund_etf_spot_em`
- Primary daily history: `ak.fund_etf_hist_em`
- Daily history fallback: `ak.fund_etf_hist_sina`
- AKShare's `基金折价率` is converted so the app's `premiumRate` is positive for a premium and negative for a discount.
- Normal market requests use stale-while-revalidate: cached SQLite data is returned immediately while an expired market snapshot refreshes in the background.
- Explicit refresh waits for the remote market update.
- Market cache defaults to 3 minutes; history cache defaults to 24 hours.
- If history refresh fails and cached history exists, the API returns stale cached history instead of an empty page.
- ETF valuation resolves `fund_overview_em` tracking-target metadata against `index_csindex_all`, then reads `stock_zh_index_value_csindex`.
- Valuation results load independently from price history and are cached in SQLite for 24 hours.

ETF SQLite tables:

- `etfs`
- `etf_daily_prices`
- `etf_refresh_state`
- `favorite_etfs`
- `etf_valuations`

ETF APIs:

- `GET /api/etfs`
- `GET /api/etfs/:symbol`
- `GET /api/etfs/:symbol/valuation`
- `GET /api/etfs/favorites`
- `POST /api/etfs/favorites/:symbol`
- `DELETE /api/etfs/favorites/:symbol`

## Index Research Phase 1

A dedicated index research page is available with URL state such as `?view=index&index=cn:000300`.

- Curated coverage: SSE Composite, CSI 300, CSI 500, CSI 1000, CSI A500, SZSE Component, ChiNext, STAR 50, Beijing 50, Hang Seng, Hang Seng TECH, and Hang Seng China Enterprises.
- Shows a common-index quote strip, searchable and market-filtered directory, selected-index quote facts, up to ten years of daily history, and return/risk metrics.
- Supports SQLite-backed favorites and restores the selected index from browser history.
- A-share spot data uses `stock_zh_index_spot_em` with Sina spot fallback; Hong Kong spot data uses `stock_hk_index_spot_em` with Sina fallback.
- CSI history uses the official `stock_zh_index_hist_csindex` interface. Other mainland and Hong Kong indices use their respective AKShare daily-history adapters and fallbacks.
- Every index history adapter has independent fallbacks: mainland indices try Tencent and then Sina after the primary source; Hong Kong indices try Tencent and then the dedicated Sina Hong Kong-index interface after Eastmoney.
- Tencent mainland `amount` is normalized as trading volume (hands), not mislabeled as turnover amount.
- When every remote source fails, the API returns stale SQLite history when available; otherwise it returns a user-facing unavailable message while retaining technical details in server logs.
- Market cache defaults to 3 minutes and history cache defaults to 24 hours, with stale cached history returned when a remote refresh fails.

Index SQLite tables:

- `indices`
- `index_daily_prices`
- `index_refresh_state`
- `favorite_indices`
- `index_valuations`

Index APIs:

- `GET /api/indices`
- `GET /api/indices/:market/:symbol`
- `GET /api/indices/:market/:symbol/valuation`
- `GET /api/indices/favorites`
- `POST /api/indices/favorites/:market/:symbol`
- `DELETE /api/indices/favorites/:market/:symbol`

Index valuation behavior:

- CSI-family indices use official `stock_zh_index_value_csindex` data and cache the latest result for 24 hours.
- `PE1` (total-shares basis) is the primary displayed value; `PE2` (calculated-shares basis) is supporting context.
- Unsupported markets and index providers return an explicit unavailable reason rather than substituting a different valuation source.

## ETF Valuation Notes

The ETF price-to-earnings value is the valuation of the tracking index, not the ETF price divided by fund earnings. ETFs are investment vehicles rather than operating companies, so presenting an ETF-level corporate P/E would be misleading.

Resolution flow:

1. Read the fund's exact `跟踪标的` from `ak.fund_overview_em`.
2. Require a unique exact match in `ak.index_csindex_all`; do not use fuzzy matching or infer a code from the ETF name.
3. Fetch official CSI valuation data with `ak.stock_zh_index_value_csindex`.
4. Display `市盈率1` as the primary P/E (total-shares basis) and `市盈率2` as the supporting P/E (calculated-shares basis).
5. Store the latest result in SQLite table `etf_valuations` and reuse it for 24 hours.

Coverage limitations:

- Only ETFs whose tracking targets uniquely match an index in the CSI catalog can currently show P/E.
- Commodity, bond, currency, overseas, or non-CSI index ETFs may legitimately show no P/E.
- A failed or ambiguous match must return an explicit unavailable reason; it must never silently substitute a similarly named index.
- Valuation loads separately from ETF quotes and price history, so a slow index request does not block the main ETF page.

Verified example as of 2026-07-11:

- ETF: `510300` / 沪深300ETF华泰柏瑞
- Tracking index: `000300` / 沪深300指数
- Primary P/E: `14.79`
- Supporting P/E: `17.69`
- Valuation date: `2026-07-10`
- Cached API response after the initial fetch: approximately `74 ms` on the local machine

ETF frontend ownership:

- `apps/web/src/components/EtfPage.vue`: page state, URL synchronization, search, filters, table, metrics, and favorites.
- `apps/web/src/components/EtfPriceChart.vue`: the single ETF history ECharts instance.
- `apps/web/src/types/etf.ts`: frontend ETF contracts.

ETF backend ownership:

- `apps/api/src/finance/etf.controller.ts`
- `apps/api/src/finance/etf.service.ts`
- `apps/api/src/finance/etf.dto.ts`
- `apps/api/src/finance/etf.types.ts`
- `apps/api/src/python/akshare_bridge.py`

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
- ROIC = NOPAT / average invested capital
- Three-year incremental ROIC = change in NOPAT over three years / positive change in ending invested capital over three years
- Five-year average ROIC = arithmetic mean of five annual ROIC observations
- Five-year ROIC volatility = population standard deviation of five annual ROIC observations
- Five-year gross-margin volatility = population standard deviation of five annual gross margins
- Five-year operating-margin volatility = population standard deviation of five annual operating margins
- R&D expense ratio = expensed research and development / revenue
- R&D capitalization proxy = positive increase in development-expenditure balance / (R&D expense + positive development-expenditure increase)
- Development expenditure to equity = ending development-expenditure balance / shareholders' equity
- Goodwill to equity = goodwill / shareholders' equity
- Intangible and goodwill asset ratio = (goodwill + intangible assets + development expenditure) / total assets
- Impairment burden = absolute asset/credit impairment and Hong Kong impairment provisions / absolute operating profit
- Greenblatt ROC = EBIT / (working capital + net fixed assets)
- Current ratio = current assets / current liabilities
- Quick ratio = (current assets - inventory) / current liabilities
- Cash debt ratio = cash and cash equivalents / interest-bearing debt
- Interest-bearing debt ratio = interest-bearing debt / total assets
- Asset-liability ratio = total liabilities / total assets
- Interest coverage = EBIT / interest expense
- Net debt to operating cash flow = (interest-bearing debt - cash) / operating cash flow
- Operating margin = operating profit / revenue
- Net margin = net profit / revenue
- Operating cash conversion = operating cash flow / net profit
- Three-year cumulative cash conversion = rolling three-year operating cash flow / rolling three-year net profit
- Free cash flow = operating cash flow - cash paid to acquire long-term assets
- Free cash flow margin = free cash flow / revenue
- Accrual ratio = (net profit - operating cash flow) / average total assets
- Deducted-profit ratio = recurring attributable net profit / attributable net profit
- Cash collection ratio = customer cash receipts / revenue
- Revenue growth = (current revenue - previous revenue) / previous revenue
- Operating profit growth = (current operating profit - previous operating profit) / previous operating profit
- Asset growth = (current assets - previous assets) / previous assets
- Net asset growth = (current net assets - previous net assets) / previous net assets
- Growth-divergence metrics compare receivables, inventory, profit, assets, and interest-bearing debt growth with revenue or operating-cash-flow growth.
- Receivables turnover = revenue / average accounts receivable
- Inventory turnover = operating cost / average inventory
- Payables turnover = operating cost / average accounts payable
- Cash conversion cycle = receivable days + inventory days - payable days
- Fixed asset turnover = revenue / net fixed assets
- Gross margin = gross profit / revenue
- Expense ratio = selling, admin, and finance expenses / revenue

The financial metric panel groups cash conversion and free-cash-flow metrics under `现金质量`.
Growth-divergence metrics display warning or danger states when the latest gap exceeds 10 or 20 percentage points, and persistent two-year gaps are promoted to danger alerts.
The panel also provides four explainable diagnostic summaries: `赚钱能力`, `增长质量`, `现金创造`, and `财务风险`.
Each summary is derived from named fixed metrics, shows its data coverage and triggered condition, and links back to the selected metric's trend, formula, and alerts; it does not use an opaque composite score.
Cross-year diagnostic evidence detects consecutive profitability declines, repeated revenue or operating-profit contraction, persistently weak profit-to-cash conversion, consecutive negative free cash flow, and rapid increases in leverage or goodwill exposure.
Trend rules require complete adjacent calendar years, so missing or hidden years are not silently treated as consecutive observations.

Financial metric code is split by responsibility:

- `apps/web/src/finance/financial-metric-fields.ts`: A-share and Hong Kong statement-field aliases.
- `apps/web/src/finance/financial-metric-engine.ts`: pure parsing, ratio, rolling-window, free-cash-flow, growth-gap, and cash-cycle calculations.
- `apps/web/src/finance/financial-metric-alerts.ts`: metric state classification and explainable warning rules.
- `apps/web/src/finance/financial-diagnostics.ts`: transparent aggregation for the four diagnostic summaries.
- `apps/web/src/finance/*.spec.ts`: formula, field-matching, cross-market, missing-data, and alert regression tests.
- `apps/web/src/components/CustomMetricChart.vue`: metric catalog, chart preparation, and presentation details.

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
- ETF market pull with 1,543 live market rows from AKShare
- ETF search, exchange filter, sorting, selection, URL restoration, and top navigation
- ETF favorite add/remove persistence
- `510300` ten-year history with 2,428 cached trading days
- ETF history fallback from Eastmoney to Sina
- ETF market and history SQLite cache hits
- ETF price/volume ECharts rendering and range switching
- ETF risk and return metric rendering
- ETF tracking-index PE rendering and 24-hour SQLite valuation cache
- No relevant browser console error or warning during validation

## Product Decisions

- Do not prioritize mobile layout for now.
- Do not invest in export improvements for now.
- Do not build a generic user formula editor for now.
- Add future financial charts by implementing explicit formulas in code, with separate A-share/HK field alias handling.
- Peer/custom comparison should remain SQLite-first and should not silently trigger large AKShare fetches.

## Suggested Next Steps

- Add ETF holdings and industry-allocation analysis using `fund_portfolio_hold_em` and `fund_portfolio_industry_allocation_em`.
- Add multi-ETF comparison for normalized return, drawdown, volatility, correlation, scale, liquidity, and holdings overlap.
- Add ETF share-change and estimated fund-flow analysis with an explicit estimation label.
- Add ETF dividend history and alerts.
- Add single-cache-entry delete and refresh actions to the cache management panel.
- Add more fixed metrics to peer/custom comparison, such as ROE, gross margin, net margin, and revenue growth.
- Persist selected peer/custom comparison companies in localStorage.
- Improve anomaly explanations, for example "missing revenue" or "missing previous denominator".
- Move A-share/HK field aliases into a centralized configuration file for easier maintenance.
