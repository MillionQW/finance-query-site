# 财报查询台

一个本地运行的财经查询网站：前端使用 Vue 3 + TypeScript，后端使用 NestJS，财报数据通过 Python 调用 AKShare 获取。

## 功能

- 搜索 A 股和港股公司
- 拉取公司自上市年开始的全部年度财报
- 查看资产负债表、利润表、现金流量表
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
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt
```

项目会优先使用根目录下的 `.venv\Scripts\python.exe`。如果本机 `python` 不是你要用的解释器，也可以手动设置：

```powershell
$env:PYTHON_BIN="C:\Python312\python.exe"
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
D:\finance-query-site\data\finance.sqlite
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
