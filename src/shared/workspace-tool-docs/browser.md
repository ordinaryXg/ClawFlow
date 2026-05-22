# 网络与页面能力（browser）

## 是什么

通过 **`web_search`**、**`web_scrape`** 访问**工作区外**的公开 Web 信息：前者返回**搜索结果列表**，后者对单个 URL **HTTP 拉取并抽纯文本**。

- 搜索源、API 密钥、代理由**应用在后台**配置；你**不**改设置、**不**用 shell `curl` 替代。
- manifest 中 **`tools.web_search`** 与 **`tools.web_scrape` 彼此独立**；仅已开启的工具会下发。
- **无**应用内网页浏览 / webview 工具；勿虚构 `workspace_browser_*` 等名称。页面抓取请用 `web_scrape`。

> 开关：`.agent/.tool/manifest.json` → `tools.web_search` / `tools.web_scrape`

## 边界（能做 / 不能做）

**能做**

- 用 **`web_search`** 查版本、公告、API 文档、新闻等**结构化搜索结果**（标题、URL、摘要）
- 用 **`web_scrape`** 对**用户给出或搜索得到的 https URL** 抓静态 HTML 正文；全文落盘 `.agent/.clawflow/scrapes/`，工具 JSON 返回摘录

**不能做 / 勿误用**

- 抓取**强依赖客户端 JS 渲染**的 SPA → 正文可能为空或不完整；勿当作「已完整阅读页面」
- 读**工作区本地文件** → 用 `tools.docs` 的 `workspace_read_file*` / `workspace_list_dir`
- 用户未要求外部事实、且无 URL/搜索需求 → **不要**调搜索或爬取
- 工具未返回有效摘要/正文 → **不得**编造网页内容或来源

## 工具与参数

| 工具 | 必填 | 常用可选 | 返回 |
|------|------|----------|------|
| `web_search` | `query` | `count`（条数上限）、`country`、`language`、`freshness`（day/week/month/year）、`date_after` / `date_before`、`search_lang` | 提供方归一化后的 JSON 结果列表 |
| `web_scrape` | `url`（http/https） | `max_chars`（摘录上限，默认约 24000；全文仍写入 scrapes 目录） | JSON 回执 + 摘录；含 `errorCode` / `hint` 时按失败处理 |

**以工具 JSON 为唯一事实来源**；回复用户时摘要即可，勿整段粘贴 raw JSON。

## 该怎么用

1. **先搜后抓**：先用 `web_search` 定位权威 URL；仅当摘要不够再对**具体 URL** 调 `web_scrape`。
2. **一次一事**：`web_scrape` 针对单页；多页需多次调用或多次搜索。
3. **引用来源**：向用户汇报外部事实时带上结果中的 **URL / 标题**（来自工具输出）。
4. **只读**：两类工具均不写工作区；若需把抓取内容落盘到项目文件，再用 `workspace_write_file` 等（`tools.docs`）。

## 什么时候用

- 任务依赖**项目外**、**当前工作区没有**的事实（版本号、官方文档、变更日志、规范原文）
- 用户给出 **http(s) URL**，要求阅读、摘要、核对页面内容
- 需要先**搜索**再深入某一链接

## 意图 → 调用

| 用户意图 | 工具 | 要点 |
|----------|------|------|
| 「查一下 X 最新文档/版本」 | `web_search` | `query` 具体；可加 `freshness` |
| 「打开/读这个链接」 | `web_scrape` | `url` 须 http(s)；先 normalize 为合法 URL |
| 搜索命中多条，需正文 | 先 `web_search` 再 `web_scrape` | 从搜索结果选 1～2 个最相关 URL 再抓 |
| 只要搜索结果列表 | `web_search` | 不必对每个 URL scrape |

## 典型序列

**A. 查外部事实**

1. `web_search` + 精确 `query`
2. 用返回条目回答；若摘要不足 → 对最相关 URL 走 B

**B. 读指定页面**

1. `web_scrape` + `url`
2. 从 JSON 摘录/正文中作答；必要时说明 scrape 文件相对路径（若在回执中给出）

## 实现与配置（你需知晓）

- 搜索后端由应用配置，可能包括 **Bocha、Brave、SearXNG、DuckDuckGo** 等；**不是**百度站内搜索。
- `web_scrape`：**主进程 HTTP GET + HTML→文本**，不执行页面 JS；支持 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`。
- 搜索/抓取失败时，可提示用户检查 **ClawFlow 系统设置中的网络搜索配置**、API 密钥或代理；你**不能**自行改配置。

## 失败时你怎么做

| 工具信号 | 你的下一步 |
|----------|------------|
| 搜索空结果 / 限流 | 改写 `query` 重试一次；仍失败则说明可能需用户配置搜索源或代理 |
| scrape `errorCode` / 非 2xx | 报告 hint；勿假装已读；可建议用户换 URL 或手动打开 |
| 摘录极短或为空 | 说明可能为 SPA/需登录/反爬；勿编造正文 |
| 工具未下发 | 说明 `tools.web_search` 或 `tools.web_scrape` 未在工作区 manifest 中开启 |

## 网页搜索（tools.web_search）

{{TOOLS:web_search}}

## 网络数据爬取（tools.web_scrape）

{{TOOLS:web_scrape}}
