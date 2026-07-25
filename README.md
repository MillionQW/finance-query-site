# 财报查询台

一个本地运行的财经查询网站：前端使用 Vue 3 + TypeScript，后端使用 NestJS，财报数据通过 Python 调用 AKShare 获取。

## 功能

- 搜索 A 股和港股公司
- 拉取公司自上市年开始的全部年度财报，并保留最近 20 个季报/中报报告期
- 查看资产负债表、利润表、现金流量表
- 查看最新报告期累计同比、最近十二个月（TTM）指标和最近 8 期三表明细
- 自动校验三表完整度和关键勾稽关系，保留不可变财报版本并提示历史数据调整
- 首屏先给出可解释的研究结论、诊断维度和优先关注信号
- 分析盈利、现金质量、成长、偿债和营运效率指标，包括自由现金流、三年累计现金含金量、现金循环周期及增长背离预警
- 拆解杜邦 ROE、利润到自由现金流和营运资本驱动
- 查看 ETF、主要指数、同行对比和估值数据，并显示个股在行业横截面中的相对位置
- 使用 ROA、PE、市值等条件筛选公司
- 保存收藏、公司备注、买点区间并跟踪公告；公告默认突出重要事件并收起例行披露
- 财报首次拉取后写入本地 SQLite，后续默认直接读本地库
- 前端提供搜索结果栏、年度筛选、关键指标趋势和明细表格

## 技术结构

- `apps/web`: Vue 3 + TypeScript + Vite
- `apps/api`: NestJS API，托管生产构建后的前端静态文件
- `apps/api/src/python/akshare_bridge.py`: AKShare Python 适配器
- `data/finance.sqlite`: 本地财报数据库

NestJS 可以跑这个项目。AKShare 是 Python 库，所以这里采用 NestJS 调用 Python bridge 的方式，既保留 NestJS 的工程化能力，也不需要重写 AKShare 数据采集逻辑。

## 安装

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/api/requirements.lock.txt
```

需要 Node.js 22.5 或更高版本，推荐 Python 3.12。`requirements.lock.txt`
用于复现当前已验证的 Python 环境；需要升级 AKShare 时再更新锁文件。

项目会优先使用根目录下的 `.venv\Scripts\python.exe`。如果本机 `python` 不是你要用的解释器，也可以在 `.env` 中设置：

```dotenv
PYTHON_BIN=C:\Python312\python.exe
```

## 开发运行

开两个终端分别运行：

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

- 前端开发地址: `http://localhost:5173`
- 后端 API 地址: `http://localhost:3000/api`

## 本机部署运行

```powershell
npm run build
npm run start
```

打开 `http://localhost:3000`。

Windows 下也可以直接运行 `start-finance-site.cmd`。脚本会在源码或依赖配置更新后自动重新构建，避免继续运行旧产物。

## 配置

复制 `.env.example` 为 `.env` 后即可覆盖默认配置。服务和开发页面默认只监听本机回环地址；如需局域网访问，应显式设置 `HOST`、`WEB_ORIGIN`，并自行增加身份认证。

常用配置：

- `HOST`、`PORT`：API 监听地址和端口。
- `WEB_ORIGIN`：允许的前端来源，多个来源用逗号分隔。
- `AKSHARE_TIMEOUT_MS`：单个 Python 数据任务的总超时。
- `AKSHARE_MAX_OUTPUT_BYTES`：Python bridge 单次允许返回的最大数据量。
- `AKSHARE_EXPOSE_ERROR_DETAILS`：是否向浏览器暴露上游错误细节，默认关闭。
- `FINANCE_DB_PATH`：SQLite 数据库路径。
- `FINANCE_REFRESH_*`、`ANNOUNCEMENT_*`：后台刷新频率。

## 质量检查

```powershell
npm test
npm run typecheck
npm run build
```

代码评审还应遵守 [PROJECT_NOTES.md](./PROJECT_NOTES.md#file-size-and-responsibility-guardrails) 中的文件规模与职责边界约束，避免应用外壳、存储门面和命令入口再次膨胀成巨型文件。

## API

- `GET /api/health`
- `GET /api/companies/search?q=腾讯&market=all`
- `GET /api/finance/statements?market=hk&symbol=00700`
- `GET /api/finance/statements?market=a&symbol=600519`
- `GET /api/finance/statements?market=hk&symbol=00700&refresh=true` 强制重新拉取并更新 SQLite
- `GET /api/cache/stats` 查看本地库统计

## 本地 SQLite 缓存

数据库位置默认是：

```text
data\finance.sqlite
```

写入策略：

- 后端先按 `market + symbol + years` 查询 SQLite。
- 命中缓存时直接返回本地 JSON，避免重复请求 AKShare。
- 未命中时调用 AKShare，成功后同时写入完整响应和拆分后的明细表。
- 点击前端“刷新”会带上 `refresh=true`，强制重新拉取并覆盖本地快照。

为后续搜索和图表预留的表：

- `companies`: 公司代码、名称、市场，供本地搜索使用。
- `financial_statement_cache`: 标准化后的完整财报响应，供页面快速返回。
- `financial_statement_rows`: 报表行项目，供按科目搜索。
- `financial_statement_values`: 年份维度的明细值，供多公司/多指标图表。
- `financial_metric_values`: 总资产、总负债、营业收入、净利润、经营现金流等关键指标序列。
