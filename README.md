# JLUHOT (MolaMaker) · 智能吉大校园与学术前沿聚合平台

<p align="center">
  <a href="https://github.com/Mola-maker/JLUhot"><img src="https://img.shields.io/badge/GitHub-JLUhot-176b75?style=for-the-badge&logo=github&logoColor=white" alt="JLUhot Repository"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-00b4d8?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/React_Router-v7_SSR-EA4335?style=for-the-badge&logo=reactrouter&logoColor=white" alt="React Router">
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose">
  <img src="https://img.shields.io/badge/MCP-Enabled-9B51E0?style=for-the-badge&logo=anthropic&logoColor=white" alt="MCP Server">
</p>

<p align="center">
  <b>面向吉大师生、校友与学术科技探索者的全自动智能聚合站</b><br>
  每天从 98 个校内外信源（吉大新闻网、校内 OA 通知、40 个学院、Nature/Science/AI 顶刊）持续采集，<br>
  大模型独立两轮去噪打分与事件聚簇，每天早上 8:00 生成一份读得完的精编日报。<br>
  集成 <b>MolaMaker 宇宙美学</b>、<b>Folia 6 模式音乐视效舞台</b> 与 <b>全学科顶刊工作台</b>，既给人看，也为 AI Agent 提供实时 MCP / API 数据源。
</p>

---

## 目录

- [✨ 核心亮点](#-核心亮点)
- [🎨 前端美学与交互体验](#-前端美学与交互体验)
- [🎵 Folia-Major 音乐视觉舞台](#-folia-major-音乐视觉舞台)
- [📚 学术论文与前沿资讯工作台](#-学术论文与前沿资讯工作台)
- [🤖 面向 AI Agent 的原生出口 (MCP & API)](#-面向-ai-agent-的原生出口-mcp--api)
- [⚙️ 工作架构与数据流](#️-工作架构与数据流)
- [📡 覆盖的 98 个精选信源](#-覆盖的-98-个精选信源)
- [🚀 1 分钟快速启动 (Docker)](#-1-分钟快速启动-docker)
- [🛠️ 技术栈一览](#️-技术栈一览)
- [🤝 二次开发与上游框架](#-二次开发与上游框架)
- [📄 开源协议](#-开源协议)

---

## ✨ 核心亮点

| 维度 | 功能特色 | 解决的痛点 |
|---|---|---|
| **校内信息全覆盖** | 覆盖吉大主网、OA 办公系统内网通知、40 个学院通知与讲座预告 | 不用每天手动点开几十个学院官网，重要通知与活动一览无遗 |
| **大模型两轮去噪** | 先预筛，再由 LLM 独立进行两次量化打分（内容价值、事实密度等 5 个维度） | 告别形式主义官话水文、营销号软文与无关转发 |
| **多源事件聚类** | 语义向量 + 语义逻辑双重识别，不同媒体报道的同一件事自动合并归簇 | 杜绝「官网发一篇、各渠道转十篇」带来的信息刷屏 |
| **真实热度机制** | 48 小时动态半衰期，以独立发声来源加权计算，不计重复营销 | 排在前面的，是全校师生或行业真正高度关注的重大事项 |
| **周期性精编报刊** | 每日 08:00 出日报、每周一出周报、每月 1 日出月报 | 碎片化信息转化为连贯的主线脉络与重要节点综合回顾 |
| **高颜值阅读体验** | Visual Focus 聚焦展台、淡色荧光笔重点高亮、深浅色自适应与玻璃拟态 | 提升长文与精读效率，打造极具艺术感的浏览体验 |
| **音乐与工作陪伴** | 移植 Folia 视觉舞台（6 种 Canvas 动效），支持真实原声流与 LRC 歌词跳转 | 边看新闻论文边享受极致沉浸式音画律动 |

---

## 🎨 前端美学与交互体验

参考 `E:\molamaker` 宇宙星轨设计理念，彻底告别枯燥单调的新闻列表：

- 🌟 **Visual Focus（视觉聚焦）展台**：首页顶部焦点新闻轮播展示，辅以粉蓝（`#ff4d94` / `#00b4d8`）宇宙天体轨道光晕，关键事件第一眼抓住眼球。
- 🖍️ **淡色荧光笔重点高亮（Fluorescent Highlighter）**：
  - 设计自然倾斜微角（`-0.3deg` / `0.4deg`）与分段内联渲染（`box-decoration-break: clone`），完美支持多行长文自然折行。
  - 在新闻卡片、详情正文与论文摘要中智能标记关键结论、机构与核心数字。
- 🌌 **极简拟态卡片与暗色适配**：支持全站暗色（Dark Mode）与浅色无缝切换，搭配毛玻璃渐变边框与内嵌柔光阴影。

---

## 🎵 Folia-Major 音乐视觉舞台

灵感源自 [`chthollyphile/folia-major`](https://github.com/chthollyphile/folia-major)，在网站中构建了全局音乐体验中心（可通过顶部导航 `/music` 进入，并在全站拥有底栏悬浮迷你播放器）：

<div align="center">
  <b>支持 6 大 Canvas 音频响应式视觉舞台：</b>
</div>

```
 🌊 凝彩 (Tempera)   ── 多层流体正弦/余弦声波叠加，受频段实时调制
 💫 光晕 (Halo)       ── 旋转黑胶唱片，伴随外层粉蓝虚线星轨自转
 🌌 频谱 (Spectrum)   ── 36 频段霓虹律动柱状图，顶点实时粒子碰撞喷射
 🧊 方块魔方 (Cube)   ── 3D 透视投影旋转专辑立方体 + 重低音震感缩放 + 6 颗卫星专辑环绕
 📜 流光歌词 (Lyrics) ── 动感同步 LRC 歌词居中聚光，随节拍脉冲呼吸缩放
 ✨ 粒子星轨 (Stardust) ── 64 颗恒星引力轨道，动态星尘连线系统
```

- **真实高保真音源**：内置网易云音乐本地解码缓存（支持 FLAC、AAC/MP4、MP3 容器）与云端高清流双轨回退机制。
- **HTTP 206 流式分块传输**：后端通过二进制 Magic Byte 精准嗅探音频 MIME 类型，全面支持浏览器 `<audio>` 毫秒级时间轴随意 Seek 拖拽。
- **全屏与精准歌词同步**：右侧抽屉式歌词面板，支持毫秒级精准高亮滚动与单句点击即刻跳转播放。

---

## 📚 学术论文与前沿资讯工作台

专门开设 `/papers` 学术聚合模块，服务吉大师生科研与跟踪学术前沿：

- **顶尖期刊与会议收录**：涵盖 Nature、Science、Cell、PNAS、CVPR、NeurIPS、ICML、arXiv 等顶级期刊会议。
- **6 大学科分类导航**：
  `全部论文` ｜ `精选高分` ｜ `综合顶刊` ｜ `计算机 & AI` ｜ `生命与医学` ｜ `物理与材料`
- **顶刊快速筛选**：点击 Nature / Science / CVPR 等药丸标签一键过滤。
- **即时检索与荧光高亮**：支持按论文标题、作者团队、摘要关键词实时搜索，并在正文中自动荧光笔高亮匹配词。
- **半天刷新机制**：接口与页面采用 12 小时（43200 秒）缓存策略，兼顾论文时效性与极速秒开体验。

---

## 🤖 面向 AI Agent 的原生出口 (MCP & API)

JLUHOT 不仅是为人设计的聚合阅读站，也是一个面向 AI 时代的 **Agent-Native 校园与科技知识库基础设施**：

1. **Model Context Protocol (MCP)**：
   - 原生支持 Anthropic MCP 协议标准。
   - 接入 Claude Desktop、Cursor、Dify 等 Agent 平台后，Agent 可以直接调用 `molamaker_search`、`molamaker_get_latest` 等工具获取最新的校园动态、通知与学术论文。
2. **多模态标准化出口**：
   - **OpenAPI / REST API**：完整规范文档位于 `/openapi-v1.json`。
   - **Agent Markdown 友好接口**：专用简化路由 `/api/v1/agent`，去除非文本噪声，方便 LLM 抓取解析。
   - **`llms.txt` 标准**：符合主流 LLM 索引规范，位于 `/llms.txt`。
   - **全量与分类 RSS**：支持精选源、全量源、日报周报月报单独订阅。

---

## ⚙️ 工作架构与数据流

```
 ┌────────────────────────────────────────────────────────┐
 │                      98 个多维信源                      │
 │   吉大主网 3 个 ｜ OA 内网通知 5 个 ｜ 学院网站 40 个 ｜ 学术/AI 50 个 │
 └──────────────────────────┬─────────────────────────────┘
                            │ (抓取 / Python OA 爬虫推送)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                    判重与预筛选阶段                     │
 │          URL/正文哈希判重 ──> 行业相关性初筛 ──> 垃圾过滤         │
 └──────────────────────────┬─────────────────────────────┘
                            │
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                 大模型两轮独立量化评分                  │
 │      事实密度 ｜ 影响范围 ｜ 时效性 ｜ 独家性 ｜ 规范性      │
 │          (双模型独立裁决，低于入选门槛直接剔除)          │
 └──────────────────────────┬─────────────────────────────┘
                            │
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                 语义向量聚簇与事件生成                  │
 │      不同信源同题报道聚为「单一事件」 ──> 动态衰减热度计算      │
 └──────┬───────────────────┬───────────────────┬─────────┘
        │                   │                   │
        ▼                   ▼                   ▼
 ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │ 📰 门户与日报 │    │ 🎵 Folia音乐 │    │ 🤖 Agent出口 │
 │ Visual Focus │    │ 6 大视效舞台 │    │ MCP Server   │
 │ 荧光高亮标记 │    │ 原声音频流式 │    │ REST API     │
 │ 周期精编报刊 │    │ 毫秒歌词跳转 │    │ llms.txt/RSS │
 └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 📡 覆盖的 98 个精选信源

完整信源清单可查阅 [`industry/sources.json`](industry/sources.json)：

- **校内新闻与重大事件（3 个）**：吉大新闻网（主站头条、综合新闻、讲座论坛）。
- **校内重要通知（OA 5 个）**：校内通知、教务处重要公告、国际交流、科研处等，由 `deploy/oa-collector.py` 自动化抓取转换。
- **各院系官方渠道（40 个）**：计算机科学与技术学院、软件学院、人工智能学院、通信工程学院、数学学院、物理学院、白求恩第一/第二/第三临床医学院、商学与管理学院等全部主流院系。
- **学术与 AI 前沿（50 个）**：Nature、Science、Cell 顶级期刊、arXiv 计算机科学前沿、GitHub 热门技术趋势、顶级 AI 实验室与科技媒体一手跟踪。

---

## 🚀 1 分钟快速启动 (Docker)

### 环境要求
- [Docker](https://docs.docker.com/get-started/get-docker/) & Docker Compose
- [Node.js 24+](https://nodejs.org/en/download)（用于初始化配置文件）
- 任意 OpenAI 兼容的模型 API Key（DeepSeek、千问 Qwen、智谱 GLM、Claude 等均可）

### 部署步骤

```bash
# 1. 克隆本仓库
git clone https://github.com/Mola-maker/JLUhot.git
cd JLUhot

# 2. 生成环境配置（以 DeepSeek 为例）
node scripts/init-env.ts --llm-key <你的模型 API Key>

# 3. 启动全套服务
docker compose up -d --build
```

访问体验：
- **网站首页**：<http://localhost:3000>
- **音乐视觉舞台**：<http://localhost:3000/music>
- **学术论文工作台**：<http://localhost:3000/papers>
- **后台管理系统**：<http://localhost:3000/admin>（管理员密码见 `.env` 的 `ADMIN_PASSWORD`）
- **Agent 接入引导**：<http://localhost:3000/agent>
- **接口说明文档**：<http://localhost:3000/openapi-v1.json>

> 💡 **本地挂载说明**：本地音频媒体文件位于 `apps/web/public/audio/`，通过 Docker Volume 以只读模式挂载至容器，无需打包进镜像，保障镜像极致轻量。

---

## 🛠️ 技术栈一览

- **前端架构**：React Router v7（全栈 SSR）、React 19、Tailwind CSS、Canvas 2D / 3D Web Audio API
- **后端服务**：Node.js 24、Fastify、TypeScript、pg-boss（分布式异步任务队列）
- **数据存储**：PostgreSQL 17（JSONB + 倒排索引 + 事务性迁移）
- **AI 与大模型**：OpenAI 兼容接口、SelectBench 双模校准系统、Prompt 驱动抽取
- **容器与运维**：Docker Compose 多阶段极速构建、自动健康检查与安全熔断

---

## 🤝 二次开发与上游框架

本项目深度基于开源项目 [AIHOT](https://github.com/KKKKhazix/AIHOT) 构建并拓展：
- 将原本专注单一 AI 领域的算法引擎泛化迁移为「吉林大学校园 + 科技学术」双轨驱动模式；
- 重写并深度校准了适配高校环境的提示词、分级门槛与分类字典（`industry/`）；
- 增加了 OA 内网通知采集桥接系统（`deploy/`）；
- 原创增加了 **Visual Focus 宇宙星轨展台**、**淡色荧光笔重点高亮**、**Folia-Major 6 模态音乐视效舞台** 以及 **顶刊论文工作台**。

相关参考文档：
- [给 Agent 的说明](AGENTS.md)
- [信源配置与扩展指南](docs/sources.md)
- [精选与样本校准流程](docs/selection.md)
- [事件归组与关系评测](docs/grouping.md)
- [架构设计与约定](docs/architecture.md)

---

## 📄 开源协议

代码基于 [MIT License](LICENSE) 开源发布。所收录新闻、公告与论文原文之版权完整归各原始发布机构及作者所有。
