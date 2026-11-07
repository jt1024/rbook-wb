# 经典解读网站（classic-insight）

> 用 AI 为经典作品生成多风格、多受众的结构化解读，做一个「人人读得懂的经典」阅读站。
>
> 版本：v0.2.0 · 状态：**已部署上线**，7 篇作品 × 3 种解读风格的内容矩阵已补齐

**线上地址**：https://classic-insight.app.workbuddy.host/?sharecode=OMEKVEHSWQ
（通过分享链接打开后会写入访问凭证；裸域名直接访问会返回 403）

## 项目简介

经典解读网站面向大众读者，提供「作品 × 解读风格 × 读者人群」三维度的经典解读内容：

- **作品**：现代散文、公版古文、儿童经典等分类
- **解读风格**（可插拔字典）：孔庆东体、钱钟书体、郑渊洁体……每种风格对应独立的 AI 提示词模板
- **读者人群**：成人、儿童、宝妈、青少年、老年人……每类人群附带受众侧写提示词片段

一篇作品可组合出 N 篇解读，全部由 AI 自动生成，经质量评分与人工审核后发布。

## 功能特性

### 前台
- 首页：已发布作品与解读列表（全文角标 + 阅读时长）
- 作品列表 / 作品详情（原文全文阅读，分段排版）
- 解读阅读页：结构化内容（背景介绍 / 逐段精读 / 金句 / 延伸书单）
- 关于页

### 后台（`/admin`，服务端会话登录）
- 仪表盘：内容与任务总览
- 作品管理：新建 / 编辑 / 上下架，支持服务端 AI 检索自动填充元数据与全文
- AI 生成：选择「作品 × 风格 × 受众」组合发起生成任务
- 审核发布：质量评分 + 结构化表单审核（通过 / 拒绝）
- 字典管理：解读风格、读者人群的提示词模板随时可增改

## 技术栈与架构

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React 19 + TypeScript 5 |
| 样式 | Tailwind CSS 4 |
| 数据库 | PostgreSQL（云托管，JSONB 存结构化解读） |
| AI | 云服务免密钥 LLM 网关；**只在服务端**通过 `/api/ai/*` 调用 |
| 部署 | Node.js 单端口 HTTP 服务（`npm run build && npm start`，监听 `$PORT`） |

**浏览器不持有任何云凭证**。所有数据库与 LLM 访问都收拢在服务端：

```
浏览器 ── POST /api/data ──────────────┐
       ── /api/admin/{login,logout,session,db} ──┤ 服务端（Node.js）
       ── /api/ai/{models,generate,search} ──────┘   │
                                                     ├─ /api/data：只读白名单，匿名强制只看已发布内容
                                                     ├─ /api/admin/db：校验会话后调用云端 admin_write()
                                                     └─ /api/ai/*：校验会话 + 限流，服务端调用 LLM 网关
```

- `/api/data` 匿名请求强制过滤 `status='published'`，并剔除挂在未发布作品上的解读；`generation_jobs` 等后台数据需要登录态。
- `/api/ai/*` 全部要求登录态并带进程内限流；模型成功率统计与全文检索缓存持久化在服务端（`.data/ai-search-state.json`），多用户共享、重启不丢失。
- 云端 RLS 只保留 `SELECT`；写操作唯一入口是 `SECURITY DEFINER` 函数 `admin_write()`。详见 `docs/安全配置-服务端登录与RLS.md`。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入真实值，见下节
npx tsc --noEmit
npm run dev                  # http://localhost:3000
```

生产构建与运行：

```bash
npm run build
npm start
```

## 环境变量

复制 `.env.example` 为 `.env.local`（已被 `.gitignore` 排除，不进仓库）：

| 变量 | 用途 |
|---|---|
| `ADMIN_PASSWORD` | 后台登录口令 |
| `SESSION_SECRET` | 会话 cookie 的 HMAC 签名密钥 |
| `ADMIN_DB_SECRET` | 服务端调用云端 `admin_write()` 的密钥（需与函数内 MD5 对应） |
| `CLOUD_ENDPOINT` | 云服务数据面地址 |
| `CLOUD_PUBLISHABLE_KEY` | 云服务 publishable key（`wbpk_` 开头），仅服务端使用 |
| `CLOUD_OAUTH_RELAY_BASE_URL` | OAuth relay 地址，可选 |
| `CLOUD_RESOURCE_ID` | 资源 ID，可选 |

## 目录结构

```
src/
├─ app/
│  ├─ page.tsx / about / works / interpretations   # 前台页面
│  ├─ admin/                                       # 后台页面
│  └─ api/
│     ├─ data/route.ts          # 只读数据代理（按登录态过滤）
│     ├─ admin/{login,logout,session,db}/          # 会话与写库代理
│     └─ ai/{models,generate,search}/              # AI 能力代理（需登录 + 限流）
├─ lib/
│  ├─ publicConfig.ts   # 服务端云配置（server-only，读环境变量）
│  ├─ cloud.ts          # 服务端唯一的云 SDK 客户端（server-only）
│  ├─ serverQueries.ts  # 服务端直连数据库的查询（server-only）
│  ├─ queries.ts        # 浏览器侧封装：统一 fetch /api/data
│  ├─ ai.ts / aiSearch.ts / aiGuard.ts            # 服务端 LLM、检索成本优化、鉴权限流
│  ├─ aiClient.ts       # 浏览器侧封装：统一调 /api/ai/*
│  ├─ adminDb.ts        # 浏览器侧封装：统一调 /api/admin/db
│  ├─ adminSession.ts   # HMAC 会话签名
│  ├─ prompt.ts / quality.ts / types.ts
└─ app/globals.css
```

## 数据模型（核心 5 表）

```
works（作品/原文）           ── 标题、作者、年代、分类、原文全文、状态
styles（解读风格字典）       ── 名称 + AI 提示词模板（可插拔核心）
audiences（读者人群字典）    ── 名称 + 受众侧写提示词片段
interpretations（解读）      ── work × style × audience，JSONB 结构化内容、
                               质量分、状态机：pending_review → published/rejected
generation_jobs（生成任务）  ── 异步生成任务记录
```

## 内容生产流程

```
录入 / 服务端 AI 检索导入作品 → 选择「作品 × 风格 × 受众」
→ 服务端 AI 生成（流式）→ 质量评分 → 人工审核 → 发布到前台
```

## 后台访问

后台入口：`/admin`。口令由服务端 `ADMIN_PASSWORD` 校验，签发 HMAC 签名的 `httpOnly` 会话 cookie；所有写操作经 `/api/admin/db`，所有 AI 调用经 `/api/ai/*`。

## 相关文档

- `docs/需求文档-经典解读网站-v1.md` — 产品需求
- `docs/技术方案-经典解读网站-v1.md` — 技术选型、数据库设计、AI 方案
- `docs/安全配置-服务端登录与RLS.md` — 环境变量清单、RLS 策略与 `admin_write()` 的 SQL 模板

## 已知问题与后续计划

- [x] 录入示范作品并补齐「作品 × 风格」解读矩阵（7 篇已发布作品，每篇 3 种风格）
- [x] RLS 收紧为匿名只读，后台写操作全部经服务端代理
- [x] AI 调用收拢到服务端，前端 bundle 不再含云凭证
- [x] git 历史清理（filter-repo 抹除旧口令与硬编码云配置）并强制推送
- [x] 部署上线，具备公网域名
- [ ] 全文人工校对：AI 回忆的课文仍可能存在个别字词出入
- [ ] 页面级 SEO：首页与详情页仍是客户端取数，缺少 `generateMetadata` / OG
- [ ] 后台口令替换为正式账号体系；会话改为可服务端吊销
- [ ] 绑定自有域名（当前使用平台分配的 `*.app.workbuddy.host` 分享域名）
