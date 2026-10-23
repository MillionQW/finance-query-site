# Finance Query Site Notes

## Project

- Path: `D:\finance-query-site`
- Backend: NestJS + TypeScript
- Frontend: Vue 3 + TypeScript + ECharts
- Data source: AKShare through the Python bridge
- Local storage: SQLite
- Package manager: npm
- Local URL: `http://localhost:3000`

## Research consistency, operating periods and scenarios (2026-10-23)

- Annual diagnostics and summary cards now use the actual latest annual period without non-null backfill. Missing inputs reduce coverage; the no-risk label requires at least 80% of configured inputs. The header distinguishes annual quality from newer reporting-period coverage.
- Driver and metric panels share `freeCashFlowDetails`. Capex totals take precedence over components, and incomplete components yield unavailable values. Payables outgrowing revenue are no longer automatically positive.
- Financial payloads carry optional reportingCurrency, amountScale and currencyNote. Unknown HK denomination remains explicitly unknown. Reporting-period tables preserve START_DATE as periodStarts. Currency and amount-scale changes participate in statement version hashes; legacy hashes without metadata stay compatible.
- `operating-periods.ts` owns quarter/half-year derivation, exact prior-year comparisons and current operating signals. It does not difference balance sheets, replace parent earnings with consolidated profit, or calculate growth from nonpositive bases. Missing HK start dates require a cache refresh.
- `scenario-valuation.ts` owns the fixed 3/5-year PE exit model, annual end-period dividends, share count changes, fixed FX, present value, safety margin, IRR and reverse growth. Inputs are explicit and illustrative defaults are labeled. Negative earnings are unsupported.
- `ScenarioValuationPanel.vue` loads/saves independent immutable SQLite snapshots through `GET/POST /api/finance/valuation-models/:market/:symbol`. Nested DTO validation and semantic date/FX checks guard writes. The panel is keyed by company and aborts old reads. Changing profit basis clears the old profit amount.
- New schema table: company_valuation_models; existing research notes and snapshots are preserved. API repository/controller are focused modules; the store facade only delegates.
- Verification: full TypeScript test-file runs, Python unittest discovery, typecheck/build and `node scripts/research-smoke.mjs`. Smoke uses an isolated database and deterministic A/HK statements, tests real model persistence and rejects invalid inputs. Artifacts are written under ignored data/.

## Business observations and research hypotheses (2026-10-23)

- `ResearchTrackingWorkspace.vue` composes separate business entry, hypothesis tracking and history panels after scenario valuation. Company changes remount the workspace and abort previous reads. A-share observations now sync automatically on mount; manual evidence remains supported for uncovered disclosures.
- `research-tracking.ts` owns exact-identity comparisons and hypothesis status. Identity includes dimension, segment, metric, unit, currency, basis and both period dates. Growth requires a positive comparable base; percent metrics use percentage points. Segment share requires an explicit overall-company observation; incomplete segments are never summed. Gross margin requires comparable revenue and gross profit.
- Hypotheses store inclusive target bounds, due date, rationale and an optional same-company valuation snapshot. Verification stores a frozen observed value/version, explanatory note and valuation impact. Revised or archived observations invalidate the visible current verification; hypothesis edits clear its latest review while retaining all historical revisions. Due-date attention is in-page only and does not schedule notifications.
- `research-tracking.controller.ts`, DTO/semantic validation and `store/research-tracking.repository.ts` own the API and persistence. Tables `company_research_entries` and `company_research_revisions` store current state and immutable revisions. Transactions enforce expected-version concurrency, unique active observations and company ownership. Verification also checks the displayed observation version.
- Regression coverage includes missing versus zero actuals, period/unit/currency/basis matching, review history, duplicates, optimistic conflicts and foreign-company links. `scripts/research-tracking-smoke.mjs`, called by the existing research smoke script, exercises entry, comparisons, valuation linking, verification, corrections, reload, archive/restore and company isolation against an isolated SQLite database. Screenshots are under ignored data/.

## Automatic business disclosures (2026-10-23)

- `finance_bridge/business.py` uses the public Eastmoney BusinessAnalysis/PageAjax source documented by local AKShare `stock_zygc_em`. It retains industry/product/region categories, income, cost, source-named main-business profit, gross margin and source revenue share. It preserves raw field/value/unit/full source row and provider URL. RMB yuan amounts convert to 亿元, fraction ratios to percent, and calendar quarter/half/year disclosures to year-start cumulative periods. Unknown categories/dates and missing numeric values are skipped. Conflicting source duplicates fail rather than choosing an arbitrary value. HK has explicit unsupported status; no currency or period assumptions are reused for it.
- `BusinessSyncService` and `POST .../research/:market/:symbol/business-sync` perform bounded Python fetches with single-flight and a persisted 24-hour status cache (5-minute failure cooldown, force refresh available). `company_business_sync` records attempts and last success; failed/empty responses preserve observations. Sync does not create a scheduled background task.
- Repository import is transactional and idempotent. Stable provider keys match existing records; source changes retain immutable revisions and trigger hypothesis re-verification. Manual edits/archive and same-identity manual records are protected. Provenance is server-owned and cannot be supplied through manual DTO writes. Previously imported records absent from a nonempty source result are marked missing and excluded from comparisons/verification, while evidence remains available.
- Source data are secondary provider extracts, not direct report PDF parsing; original report page numbers are unavailable and labeled accordingly. Reclassification, consolidation and restatement comparability are not guaranteed merely by matching names. The UI exposes raw evidence for each current/historical record and explains these limits.
- Verified Python normalization tests, TypeScript service/repository/frontend regressions, full typecheck/build and deterministic browser smoke. Live isolated SQLite integration for 600519 returned 200 source rows / 679 observations; repeat force sync added/updated zero. `business-auto-smoke.mjs` adds auto-load/provenance/error/unsupported-state browser coverage to the existing research smoke script.

## Commands

- Type check: `npm run typecheck`
- Build: `npm run build`
- Start production server: `npm run start`
- After completing any change, automatically run `npm run build` to rebuild and update the website, and confirm that the build succeeds before handing off the work.

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

## Company PE (TTM) historical percentiles (2026-10-23)

- Company pages independently load `GET /api/finance/company-valuation?market=a|hk&symbol=...`; `refresh=true` bypasses the daily cache.
- The Python `company-valuation` bridge uses `stock_zh_valuation_baidu` / `stock_hk_valuation_baidu`, indicator `市盈率(TTM)`, period `全部`. Live A-share (600519) and HK (00700) calls were verified.
- These interfaces return sampled history, **not daily observations**. The UI labels this and shows 3/5/10-year percentiles, each window's valid sample count and actual sample dates, latest PE, and valuation date.
- The percentile cards also switch a PE (TTM) history chart between 3/5/10 years, defaulting to 3 years. The chart and selected percentile share the same calendar cutoff and normalized observations; switching ranges does not fetch again. The API exposes the last 10 years as `history`, preserving invalid PE as null gaps. The chart uses a time axis, hover date/PE values, and responsive resizing.
- Windows end at the latest source date. Percentile is `count(PE <= latest PE) / valid sample count * 100`, including the latest observation. Dates are deduplicated; missing, non-finite, zero and negative PE are excluded. Invalid latest PE or fewer than two valid observations yields no percentile. Incomplete history is explicitly labeled.
- Each window also returns `referenceLevels` for the 20th/50th/80th percentile PE, using linear interpolation at `(n - 1) * p` (PERCENTILE.INC). The chart renders matching dashed lines and colored PE labels, updated on range switches without fetching. Equal levels share a line label; fewer than two valid samples yield null levels and no reference lines. Latest invalid PE does not suppress reference levels derived from otherwise valid historical samples.
- Raw snapshots are persisted in SQLite `company_pe_history`, cached for 24 hours, and concurrent requests share one subprocess. Refresh failures preserve the previous snapshot and explicitly mark it stale.
- Verification: 33 API tests, full typecheck and production build passed. Browser checks covered A/HK live data, manual refresh, failure display, rapid company switching, and desktop/mobile layouts.

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

## Reporting Period and TTM Analysis

- Financial-statement payload schema version 2 keeps the existing annual tables and adds the latest 20 reporting periods.
- A-share reporting periods reuse the Eastmoney report-period responses already fetched for annual normalization.
- Hong Kong statements independently request both `年度` and `报告期` data.
- The company page shows:
  - latest reporting-period cumulative values and same-period YoY
  - revenue, net profit, and operating cash flow on a trailing-twelve-month basis
  - the latest eight reporting periods for all three statements
- TTM uses `current YTD + previous annual - previous same period`; it remains unavailable when any required input is missing.
- Reporting-period table YoY compares the same period in the prior year instead of the adjacent displayed column.
- Python regression tests cover report-period preservation and TTM calculation.

## Conclusion-first Research Summary

- The company page puts an explainable research summary before detailed statement panels.
- The summary reuses the existing named metric definitions, evaluator, and four financial diagnostics instead of introducing an opaque score.
- It presents the overall tone, data coverage, the four diagnostic dimensions, and the highest-priority evidence.
- Every conclusion keeps its source metric or rule visible, while missing inputs remain explicitly unavailable.

## Announcement Intelligence

- Announcements are classified by event category, importance, routine status, and a short impact hint.
- The default view prioritizes material events and hides repetitive routine disclosures such as monthly returns.
- Users can still switch to all announcements or a specific event category.
- Announcement writes use an upsert so refreshing a company also upgrades previously cached classifications.

## Financial Drivers and Industry Position

- The driver panel decomposes DuPont ROE into net margin, asset turnover, and the equity multiplier.
- A cash bridge follows net profit through operating cash flow and capital expenditure to free cash flow.
- Receivables, inventory, and payables growth are compared with revenue growth, with a 10-percentage-point materiality threshold.
- Industry ranking cards turn raw rank values into explicit percentile bands while retaining the ranking direction and valuation caveat.
- Relative valuation position is never presented as an automatic buy or sell conclusion.

## Research Dossier

- Company insights now keep separate fields for the core thesis, risks, catalysts, open questions, and free-form notes.
- Existing notes and buy-point ranges remain backward compatible.
- Schema startup migrations add the dossier columns to existing local databases without replacing prior rows.
- The company page shows dossier completion and concise previews, with a single editor for all research fields.

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

## Statement Versions and Data Quality

- Statement content uses a stable data hash that excludes fetch timestamps and UI-only metadata.
- Every distinct statement payload is retained in `financial_statement_versions`; repeated pulls with identical financial data do not create duplicate versions.
- Changes to overlapping annual/reporting-period values are stored in `statement_revision_events`.
- Revision events keep the changed item, statement, period, old/new values, percentage change, and a materiality flag.
- Runtime statement responses include:
  - immutable version count
  - latest revision summary
  - a transparent data-quality score
- Quality checks cover:
  - three-statement availability
  - latest-year key-metric coverage
  - assets = liabilities + equity
  - beginning cash + net increase = ending cash
  - reporting-period statement coverage
- Unavailable checks reduce the visible coverage percentage but do not silently count as failures.

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
When a fixed absolute rule exists, the selected metric detail shows the exact risk, concern, and strong thresholds and highlights the currently matched band.
Metrics that require industry-relative interpretation do not receive invented absolute thresholds.

Financial metric code is split by responsibility:

- `apps/web/src/finance/financial-metric-fields.ts`: A-share and Hong Kong statement-field aliases.
- `apps/web/src/finance/financial-metric-engine.ts`: pure parsing, ratio, rolling-window, free-cash-flow, growth-gap, and cash-cycle calculations.
- `apps/web/src/finance/financial-metric-alerts.ts`: metric state classification and explainable warning rules.
- `apps/web/src/finance/financial-diagnostics.ts`: transparent aggregation for the four diagnostic summaries.
- `apps/web/src/finance/financial-metric-thresholds.ts`: visible threshold descriptions kept in step with metric-state rules.
- `apps/web/src/finance/financial-metric-definitions.ts` and `financial-metric-definitions/`: metric catalog, grouped definitions, and market-specific labels/formulas.
- `apps/web/src/finance/financial-metric-calculations.ts`, `financial-metric-calculation-helpers.ts`, and `financial-metric-details/`: group dispatch, reusable calculations, and explainable formula details.
- `apps/web/src/finance/financial-metric-evaluator.ts`: statement-to-metric result orchestration, including missing fields and alerts.
- `apps/web/src/finance/*.spec.ts`: formula, field-matching, cross-market, missing-data, and alert regression tests.
- `apps/web/src/components/CustomMetricChart.vue`: Vue state, ECharts configuration, and presentation details only.

The application shell is also split by responsibility:

- `apps/web/src/App.vue`: cross-view state and request orchestration.
- `apps/web/src/app/`: URL navigation, formatting, recent-company persistence, and statement export helpers.
- `apps/web/src/components/AppTopbar.vue`: navigation and global company search presentation.
- `apps/web/src/components/CompanyResearchView.vue`: company research page composition.
- `apps/web/src/components/SettingsPage.vue` and `CompanyNoteDialog.vue`: focused settings and note interfaces.

Global styles keep their original cascade order through `apps/web/src/styles.css`, which imports focused modules from `apps/web/src/styles/` for the shell, company workspace, financial metrics, peers/statements, research pages, shared states, and responsive overrides.

SQLite persistence is exposed through `FinanceStoreService`, while implementation details live in `apps/api/src/finance/store/`: company/announcement, statement, ETF, cache, peer comparison, and refresh repositories share one configured database connection, schema initializer, and transaction base class.

`apps/api/src/python/akshare_bridge.py` remains the stable subprocess entry point. Command implementations are grouped under `apps/api/src/python/finance_bridge/` into shared normalization/runtime code plus search, screener, peer, statement, announcement, ETF, and index modules.

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

## File Size and Responsibility Guardrails

Avoid allowing a source file to become the default home for unrelated behavior. File size is a review signal rather than the only design rule, but use these limits for handwritten source:

- Aim to keep components, services, repositories, composables, and command modules below 500 lines.
- At 500 lines, review whether the file contains more than one independently named responsibility.
- Files above 800 lines should normally be split before adding more behavior.
- Do not introduce handwritten source files above 1,000 lines without documenting why a cohesive split is impractical.
- Declarative catalogs, generated code, migrations, and schema definitions may exceed the target when splitting would make navigation or ordering worse; keep their entry point small and group the content by domain where possible.

Preferred split boundaries:

- Vue: separate application orchestration, page composition, reusable presentation, and pure domain calculations.
- NestJS/SQLite: keep injected services as stable facades and move persistence into domain repositories.
- Python bridges: keep the executable entry point thin and place each command family in a separate module.
- CSS: preserve cascade order through a small import file and split rules by page or feature.
- Tests: colocate regression coverage with extracted pure logic and add a facade smoke test when introducing delegation.

During review, treat repeated unrelated imports, long groups of independent state, large conditional dispatch blocks, and multiple external data domains in one file as stronger split signals than line count alone. New features should extend the focused module that owns the behavior instead of growing an application shell, compatibility entry point, or storage facade again.

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
