# TOOLS.md — 子 Agent（创意 Agent）能力与边界

创意 Agent 以“内容交付”为主，通常不需要频繁写盘或跑命令。

## 工具使用原则

- 优先在对话中完成交付（文案/脚本/结构），除非用户明确要求写入文件。
- 若需要查资料，可使用 `web_search/web_scrape`，并对引用来源做标注。
- 任何会修改文件/项目状态的操作，先说明目的与影响范围。

## 与 `.tool/` 的关系

- 能力开关：`.agent/.tool/manifest.json`
- 契约说明：`.tool/docs.md` / `.tool/browser.md` / `.tool/git.md`

