# 飞书 / Lark 能力（feishu）

## 是什么

通过 **`workspace_feishu_invoke`** 调用 ClawFlow 内置 **lark-cli**，访问飞书开放平台：云文档（docx）、多维表格（Base）、云空间（Drive）、Wiki、IM 等。

- 凭证、App 配置、用户 OAuth 由**应用在后台**注入；你**不**读写密钥，也**不**用 `workspace_run_shell` 拼 lark-cli。
- 更细的 lark-cli 子命令可参考工作区 `.agent/.skills/feishu-lark/SKILL.md`（若存在）；**本文件优先**。

> 开关：`.agent/.tool/manifest.json` → `tools.feishu`

## 边界（能做 / 不能做）

**能做**

- 读/写**用户云空间**内的 docx、Base（需 `as: "user"`，且用户已在应用内完成 OAuth）
- Drive 搜索、Wiki 节点解析
- 以 **bot** 身份发 IM（需 `as: "bot"`）

**不能做 / 勿误用**

- 用 **bot** 读用户私人云文档 → 会失败；云文档与 Base 必须 **`as: "user"`**
- 用本能力读写**工作区磁盘文件** → 用 `tools.docs` 的 `workspace_*`
- 用户只闲聊飞书、未给链接且任务不需要飞书数据 → **不要**调工具
- 工具未返回正文时**不得**声称已读过文档

## 工具与参数

唯一入口：**`workspace_feishu_invoke`**。

| 字段 | 约束 |
|------|------|
| `domain` | `docs` / `base` / `drive` / `wiki` / `im` / `auth` 等；须为白名单域 |
| `args` | lark-cli 子参数数组；**不含** domain；优先 `+` 快捷命令 |
| `as` | 默认 `"user"`；IM 与 bot 资源用 `"bot"` |
| `botId` | 多机器人时可选 |
| `yes` | 仅当上次返回 `confirmation_required` 且**用户已明确同意**写操作 |
| `dryRun` | 需预览请求时用 |

返回 JSON 含 `ok`、`exitCode`、`json`、`stdout`、`stderr`；**以工具输出为唯一事实来源**。

## 身份选择

| 任务 | `as` |
|------|------|
| docx 读/写、Base、Drive 搜索、Wiki | `user` |
| IM 发消息 | `bot` |
| 检查 OAuth | `user`，`domain: "auth"`, `args: ["status"]` |

不确定登录状态时，**先** `auth` + `status`，再执行业务调用。

## 该怎么用

1. **只读优先**：`+fetch` / `+node-get` / `+search` / `+table-list` → 确认 token 与内容后再写。
2. **`--doc`**：可传完整 URL（`https://*.feishu.cn/docx/…`）或 token。
3. **Wiki URL**：先 `wiki` + `+node-get` 解析节点，再按节点类型走 `docs` 或 `base`。
4. **写操作**：遇 `confirmation_required` → 向用户说明将改什么 → 用户同意 → 同参数 + `yes: true` 重试。
5. **回复用户**：摘要/结论用自然语言；**不要**整段粘贴工具 raw JSON；失败时说明原因与需用户配合的一步（如重新 OAuth）。

## 什么时候用

- 用户消息含 **飞书 / docx / wiki / 多维表格 / Base** 链接或 token，且任务依赖**线上文档内容**
- 用户要求在飞书云空间**搜索**文档/表格，或**读/写**已授权资源
- 用户要求用**机器人**发飞书消息（且上下文表明 IM 已配置）

## 意图 → 调用（`args` 节选）

| 用户意图 / 输入 | domain | args（示例） | as |
|-----------------|--------|--------------|-----|
| 读 docx 正文 | `docs` | `["+fetch","--api-version","v2","--doc","<url或token>"]` | user |
| 追加 docx 段落 | `docs` | `["+update","--api-version","v2","--doc","<url>","--command","append","--content","<p>…</p>"]` | user |
| 解析 Wiki 链接 | `wiki` | `["+node-get","--token","<wiki_token>"]` | user |
| 搜多维表格 | `drive` | `["+search","--query","<关键词>","--doc-types","bitable"]` | user |
| 列 Base 表 | `base` | `["+table-list","--base-token","<app_token>"]` | user |
| 查 Base 记录 | `base` | 按 lark-cli `+record-*` 子命令（见 feishu-lark skill） | user |
| 发群/单聊消息 | `im` | `["+messages-send","--chat-id","oc_xxx","--text","…"]` | bot |
| 探活 OAuth | `auth` | `["status"]` | user |

## 典型序列

**A. 读 docx**

1. （可选）`auth` / `status`
2. `docs` / `+fetch` / `--api-version v2` / `--doc <用户提供的 url>`
3. 从 `json` 提取正文作答

**B. Wiki 链 → 文档**

1. `wiki` / `+node-get` / `--token <从 url 提取>`
2. 若节点为 docx → 序列 A；若为 bitable → `base` 相关命令

**C. 按名称找 Base 再读**

1. `drive` / `+search` / `--doc-types bitable`
2. `base` / `+table-list` → 再读记录

## 失败时你怎么做

| 工具信号 | 你的下一步 |
|----------|------------|
| auth 未登录 | 说明需用户在 **ClawFlow 设置 → 通讯集成** 完成 OAuth；勿反复盲调 |
| scope / 999916xx | 提示开放平台权限或需**退出用户授权后重新 OAuth** |
| 403 / 无权限 | 说明文档可能未共享给当前授权用户；勿编造内容 |
| `confirmation_required` | 向用户确认写 scope；未确认不得 `yes: true` |
| `domain_not_allowed` / 参数校验失败 | 修正 domain/args；勿改走 shell |
| `ok: false` 且无正文 | 报告 stderr 要点；不要假装成功 |

## 工具清单（受 `tools.feishu` 关断）

{{TOOLS:feishu}}
