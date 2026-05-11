# TOOLS.md — 能力地图（`.tool/` 导引）

本文件在 **`.roleAgent/TOOLS.md`**，作用是把「工作区里与工具有关的东西」串成一张**地图**：先看清 `.tool/` 里有什么、各管什么，再往下看「本机/项目独有」的备忘。

> `.tool/README.md` 若存在，仅作为**入口跳转**；总览与入口说明以 **本文件（TOOLS.md）** 为准。

---

## 与 `.tool/` 的对应关系

工作区根目录下的 **`.tool/`** 由应用初始化，主要包含：

| 文件 | 作用 |
|------|------|
| **`manifest.json`** | 能力开关（`version: 2`）：`tools.docs`、`tools.git`、`tools.web_search`、`tools.web_scrape`、`tools.embedded_browser`。后三项由原「浏览器类」拆分为独立开关。引擎按此过滤模型工具；创建/设置工作区时的勾选会写回此文件。 |
| **`docs.md`** | 文档类工具清单（与 `tools.docs` 对应的 **function 工具名**，由应用按引擎注册表自动生成）。 |
| **`browser.md`** | 网络搜索 / 爬取 / 内嵌打开 三类说明（分别对应 `web_search`、`web_scrape`、`embedded_browser` 三项开关）。 |
| **`git.md`** | Git 类工具说明（对应 `tools.git`）。 |

阅读顺序建议：**manifest.json**（当前开了什么）→ 按需打开上表 **`.md`** 了解参数与边界。

---

## 写在本文件下半部分：本地备忘

下面这是你（或助手）维护的 **本机 / 本项目独有** 信息，不属于 `.tool/` 里那种通用契约说明：

- SSH 主机与别名、内网 API、设备名
- 语音 / TTS 偏好、代理与环境变量提示
- 任何「只有这台机器或这个项目才需要」的速查

---

按需补充；契约与开关始终以 `.tool/manifest.json` 与各 `*.md` 为准。
