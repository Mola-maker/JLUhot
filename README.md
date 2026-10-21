# MolaMaker

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center">
  <b>吉大新闻聚合站。</b><br>
  每天从 67 个信源里抓取、归并、打分，出一份读得完的吉大日报。
</p>

## 这是什么

MolaMaker 是一个吉林大学的新闻聚合站。它每天从校内信源（吉大新闻网、校内通知、教务、各学院）和一批 AI 行业信源里收资料，用大模型先筛一遍、再独立打两次分，挑出真正值得看的，写成中文标题和摘要；把不同来源说的同一件事聚成一个事件，按有多少人在说排出热度；每天早上出一份日报，周报月报再从日报里汇编。

新闻原文的版权归各来源所有。这是一个聚合阅读站：把各来源的内容聚到一起展示，每篇都写明来源并给出原文链接。

## 它盯哪些信源

一共 67 个，清单在 [`industry/sources.json`](industry/sources.json)，首次启动时导入。

| 类别 | 数量 | 说明 |
|---|---|---|
| 校内新闻与讲座 | 3 | 吉大新闻网、讲座预告 |
| 校内通知（OA） | 5 | 校内通知渠道，由 `deploy/oa-collector.py` 抓取后推送进来 |
| 学院来源 | 40 | 各学院网站 |
| AI 行业 | 19 | 保留自框架示例的「AIhot 板块」，接入的是公开的海外 AI 资讯源 |

信源分三级（官方一手、官方账号与准官方、媒体与个人），各级入选门槛不同，抓取频率按产出自动调整。怎么配见[信源](docs/sources.md)。

## 它是怎么工作的

一条资料从信源进来，先判重，再预筛；可能重要的独立打两次分，写好中文标题和摘要，和别的报道聚成事件，算进热度。分数过了门槛、又不是精选里已有新闻的重复，才进精选；日报按规则编出当天要闻，周报、月报再从日报里汇编。每一步的提示词都在 [`industry/prompts/`](industry/prompts/)，改标准不用改代码。详见[精选与校准](docs/selection.md)。

### 通知公告的采集

校内的通知公告没有公开的 RSS，由 [`deploy/oa-collector.py`](deploy/) 定时抓取、解析后，经外部推送接口送进来（解析逻辑在 `deploy/oa_parse.py`，是纯函数，单独有测试）。学院来源则直接按各学院网站的结构配置抓取。

### 聚簇与热点

同一件事，官网发一篇、别的渠道转十篇，读者只需要看到一次。MolaMaker 把它们聚成一个**事件**：先用标题摘要的向量（没配向量服务时比文字重合度）在最近两周里找候选，再让模型判断是同一件事、后续进展，还是两件事；拿不准的合并，写入前再让模型复核一遍（复核可以单独换一家模型，设 `GROUP_REVIEW_MODEL`）。

**热度**按事件算，不按文章算：48 小时内，每个独立来源只算一次，24 小时减半。重复抓取不会多算，一家来源发十篇也只算一次，所以排在前面的，是真正有很多人在说的事。

## 你会得到什么

| | |
|---|---|
| **多种信源** | RSS、网页列表、JSON 接口、X 账号、微信公众号，以及你自己脚本推送进来的内容（校内通知走的就是这一种）。信源分三级（官方一手、官方账号与准官方、媒体与个人），各级入选门槛不同；抓取频率按产出自动调整 |
| **精选** | 预筛，同一份评分标准独立打两次分，再按信源分级的门槛决定入选；同一条新闻只占一条，换个说法的重复不进。提示词和门槛全部公开，全部可以改；用你自己标注的样本在 SelectBench 里校准 |
| **写作** | 中文标题、答案先行的摘要、推荐理由，外文全文翻译；分类、标签和新闻事实单独抽取；防止模型把原文没提到的机构写进标题 |
| **聚簇** | 不同来源报道的同一件事聚成一个事件，后续进展挂在同一个事件下，事件页有综述；进展和报道时间线可一起切换“最新在前”或“最早在前”；人工改过的归属不会被覆盖 |
| **热点** | 按事件算热度：独立来源越多越靠前；和 6 小时前比，涨得快的标上升，新出现的标“新” |
| **日报、周报、月报** | 每天出日报（默认 08:00），按规则编出当天要闻：一件事一条，报过的事只在有新进展时跟进，不调模型。每周一出周报、每月 1 日出月报（默认 10:00、10:30），从日报里汇编，模型只写总述和栏目导读。几点出刊在 `site/site.ts` 的 `EDITION_TIMES` 里改 |
| **主题与搜索** | 院系机构、科研方向、校园生活三类主题页；标题摘要搜索和全文相关搜索 |
| **阅读设置** | 深浅色外观、网站默认字体或浏览器默认字体；收藏和阅读设置只保存在本机，可以导出、导入备份 |
| **给 Agent 用** | RSS（精选、全部、全文、日报、周报、月报）、公开 API、MCP、Agent Markdown、`llms.txt`，同一份内容给人看也给 Agent 用 |
| **后台** | 信源管理与试抓、内容诊断与人工评分更正、精选评测、每一步单独换模型、付费服务的预算熔断、运行记录与告警 |

## 跑起来

需要 [Docker](https://docs.docker.com/get-started/get-docker/)、[Node.js 24](https://nodejs.org/en/download)（运行 `init-env` 生成配置要用），和一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱都可以）。

`init-env` 默认按 DeepSeek 配置。用千问、智谱等别家，照 `.env.example` 里的例子改 `.env` 的 `LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_EXTRA_JSON`；用推理模型（先想再答）时，还要设 `LLM_REASONING_TOKENS` 给推理留出输出额度。

```bash
git clone https://github.com/Mola-maker/JLUhot.git
cd JLUhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。一两分钟后开始有内容，第一次导入的资料大约半小时处理完。

站点跑起来后，打开 `/agent` 可以复制 MCP、RSS 或 API 的接入方式；只能读网页的 Agent 从 `/api/v1/agent` 开始；接口说明在 `/openapi-v1.json`。

机器上没有 Node、服务器在中国大陆、要配域名和 HTTPS，或者不用 Docker、直接在 Linux、macOS 上跑（Windows 用 WSL2），见[部署](docs/deploy.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [给 Agent 的说明](AGENTS.md) | 这个仓库的结构、最常见的任务、要守住的规则 |
| [把它改成另一个行业](docs/customize.md) | 站名、分类、主题、信源、提示词、门槛、模型、品牌，一步一步来 |
| [信源](docs/sources.md) | 各类信源怎么配，分级和全文，抓取频率，旧文和存档，外部推送接口 |
| [精选与校准](docs/selection.md) | 一条资料怎么变成精选、怎么编进日报周报月报，怎么用自己的样本校准 |
| [事件归组与关系评测](docs/grouping.md) | 事件关系怎么判断，怎么用自己标注的成对样本评测 |
| [部署](docs/deploy.md) | Docker、域名和 HTTPS、中国大陆、更新、备份、花多少钱 |
| [架构](docs/architecture.md) | 三个进程、几条不变的规则、目录、模块、数据库迁移、对外出口、测试 |

技术栈：Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 基于 AIHOT 框架

本站是 [AIHOT](https://github.com/KKKKhazix/AIHOT) 的二次开发——一个「自己找热点、自己写日报」的行业热点站框架。引擎、后台、精选流程、聚簇与热度算法都来自上游，本站把行业从「AI」换成了「吉林大学」：换了信源、分类标签与主题，重写了精选标准与写作提示词，并加了一个校内通知的采集器（[`deploy/`](deploy/)）。

上游框架的说明见 [README.en.md](README.en.md)；框架本身怎么改造成别的行业，见[把它改成另一个行业](docs/customize.md)。**AIHOT 的名字和 Logo 不在本站的使用范围内**，本站用的是自己的站名与图标（`site/brand/`）。

## 许可

代码使用 [MIT 许可证](LICENSE)。字体有自己的许可，见 [NOTICE](NOTICE)。
