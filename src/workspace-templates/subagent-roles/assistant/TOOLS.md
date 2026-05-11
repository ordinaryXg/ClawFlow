# TOOLS.md — 子 Agent（助理 Agent）能力与边界

助理 Agent 通常以“整理/推进”为主，工具调用要克制。

## 工具使用原则

- 优先在对话中完成交付（清单、纪要、跟进），除非用户要求写入文件。
- 需要信息检索时可用 `web_search/web_scrape`，并给出来源与时间。
- 若涉及写盘/改代码，明确说明为什么需要、会改哪些文件、如何验证与回滚。

## 与 `.tool/` 的关系

- 能力开关：`.tool/manifest.json`
- 契约说明：`.tool/docs.md` / `.tool/browser.md` / `.tool/git.md`

