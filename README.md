# 经典解读网站（classic-insight）

> 用 AI 为经典作品生成多风格、多受众的结构化解读，做一个「人人读得懂的经典」阅读站。
>
> 版本：MVP v0.1.0 · 状态：代码层已完成，待填充示范内容

## 项目简介

经典解读网站面向大众读者，提供「作品 × 解读风格 × 读者人群」三维度的经典解读内容：

- **作品**：现代散文、公版古文、儿童经典等分类
- **解读风格**（可插拔字典）：孔庆东体、钱钟书体、郑渊洁体……每种风格对应独立的 AI 提示词模板
- **读者人群**：成人、儿童、宝妈、青少年、老年人……每类人群附带受众侧写提示词片段

一篇作品可组合出 N 篇解读，全部由 AI 自动生成，经人工审核后发布。前台阅读体验优先，后台提供完整的创作与审核流程。

## 功能特性

### 前台
- 首页：精选推荐与内容导览
- 作品列表 / 作品详情（原文全文阅读）
- 解读阅读页：结构化内容（背景介绍 / 逐段精读 / 金句 / 延伸书单）
- 关于页
- 全部页面 SSR/SSG，利于 SEO

### 后台（`/admin`，口令门控）
- 仪表盘：内容与任务总览
- 作品管理：新建 / 编辑 / 上下架，支持手工录入与检索导入
- AI 生成：选择「作品 × 风格 × 受众」组合发起生成任务，LLM 流式调用
- 审核发布：质量评分 + 人工审核（通过 / 拒绝）
- 字典管理：解读风格、读者人群的提示词模板随时可增改（可插拔核心）

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React 19 + TypeScript 5 |
| 样式 | Tailwind CSS 4 |
| 数据库 | PostgreSQL（云托管，JSONB 存结构化解读） |
| AI | 云服务免密钥 LLM 网关（`@tencent-ai/workbuddy-cloud-sdk`），无需自管 API Key |
| 部署 | 云托管（Serverless） |

## 快速开始

```bash
npm install        # 安装依赖
npx tsc --noEmit   # 类型检查
npm run dev        # 启动开发服务器 → http://localhost:3000
```

生产构建与运行：

```bash
npm run build
npm start
```

> 云服务配置（endpoint / publishableKey 等）已固化在 `src/lib/publicConfig.ts`，开箱即用。

## 目录结构

```
src/
├─ app/                  # 页面（App Router）
│  ├─ page.tsx           # 首页
│  ├─ about/             # 关于
│  ├─ works/             # 作品列表 / [slug] 作品详情
│  ├─ interpretations/   # [id] 解读阅读页
│  └─ admin/             # 后台（口令门控）
│     ├─ page.tsx        # 仪表盘
│     ├─ works/          # 作品管理（列表 / 新建 / [id] 编辑）
│     ├─ generate/       # AI 生成
│     ├─ review/         # 审核发布
│     └─ dictionaries/   # 字典管理
├─ lib/
│  ├─ cloud.ts           # 全站唯一云客户端（数据库 / LLM 复用）
│  ├─ publicConfig.ts    # 云服务端点与公开配置
│  ├─ types.ts           # 领域类型定义
│  ├─ queries.ts         # 数据库查询封装
│  ├─ prompt.ts          # 提示词组装（风格模板 + 受众侧写）
│  ├─ quality.ts         # 生成内容质量评分
│  └─ ai.ts              # LLM 流式调用
└─ app/globals.css
```

## 数据模型（核心 5 表）

```
works（作品/原文）           ── 标题、作者、年代、分类、原文全文、状态
styles（解读风格字典）       ── 名称 + AI 提示词模板（可插拔核心）
audiences（读者人群字典）    ── 名称 + 受众侧写提示词片段
interpretations（解读）      ── work × style × audience，JSONB 结构化内容，
                               质量分，状态机：generating → pending_review → published/rejected
generation_jobs（生成任务）  ── 异步生成任务记录
```

## 内容生产流程

```
录入/检索导入作品 → 选择「作品 × 风格 × 受众」→ AI 生成（流式）
→ 质量评分 → 人工审核 → 发布到前台
```

## 后台访问

后台入口：`/admin`。登录口令由服务端环境变量 `ADMIN_PASSWORD` 配置，**不随代码分发**；登录时由 `/api/admin/login` 校验并签发 HMAC 签名的 `httpOnly` 会话 cookie，所有后台写操作统一经 `/api/admin/db` 代理。

首次运行请复制 `.env.example` 为 `.env.local` 并填入三个值（该文件已被 `.gitignore` 排除）。数据库侧的只读策略与特权写函数配置见 `docs/安全配置-服务端登录与RLS.md`。

## 相关文档

- `docs/需求文档-经典解读网站-v1.md` — 产品需求
- `docs/技术方案-经典解读网站-v1.md` — 技术选型、数据库设计、AI 方案

## 已知问题与后续计划

- [ ] 录入 3~5 篇示范作品（现代散文 + 公版古文），走通「导入 → 生成 → 审核 → 发布」全流程
- [x] RLS 收紧为「匿名只读」，后台写操作全部经服务端代理（详见 `docs/安全配置-服务端登录与RLS.md`）
- [ ] 后台口令替换为正式登录 / 用户体系（当前为服务端单口令会话，二期接入账号体系）
- [ ] 三期：小程序、公众号接入（复用同一套 API）
