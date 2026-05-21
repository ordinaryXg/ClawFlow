/**
 * 新建工作区安装飞书 lark-cli 集成 Skill（ClawFlow 封装版）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes-memory-index-hooks';
import { syncWorkspaceSkillManifest } from '../workspace/workspace-skill-manifest';
import { workspaceSkillsDirAbs } from '../workspace/workspace-agent-layout';

export const LARK_CLI_SKILL_DIR = '.agent/.skills/feishu-lark';
export const LARK_CLI_SKILL_MD = `${LARK_CLI_SKILL_DIR}/SKILL.md`;

const SKILL_MD = `---
name: feishu-lark
description: "飞书 / Lark Open Platform：云文档、多维表格、Drive、Wiki、IM。通过 ClawFlow 工具 workspace_feishu_invoke 调用 lark-cli（凭证在应用设置中配置）。"
metadata:
  requires:
    tools: ["workspace_feishu_invoke"]
---

# 飞书 / Lark（ClawFlow + lark-cli）

## 前置

1. 用户在 **设置 → 通讯集成** 配置 App ID / Secret，并完成 **用户 OAuth 登录**（请求 \`--domain all\` + 含 \`docx:document:readonly\`、\`wiki:node:retrieve\` 等 scope；云文档与多维表格需 \`--as user\`）。
2. 使用工具 **\`workspace_feishu_invoke\`**，不要直接 \`workspace_run_shell\` 调用 lark-cli。

## 工具参数

\`\`\`json
{
  "domain": "docs | base | drive | wiki | im | auth",
  "args": ["+fetch", "--api-version", "v2", "--doc", "URL或token"],
  "as": "user",
  "botId": "可选，多机器人时指定",
  "yes": false,
  "dryRun": false
}
\`\`\`

## 常用示例（args 数组）

| 场景 | domain | args（节选） |
|------|--------|----------------|
| 读云文档 | docs | \`["+fetch","--api-version","v2","--doc","<url>"]\` |
| 写云文档 | docs | \`["+update","--api-version","v2","--doc","<url>","--command","append","--content","<p>...</p>"]\` |
| 列 Base 表 | base | \`["+table-list","--base-token","<token>"]\` |
| 搜 Base | drive | \`["+search","--query","名称","--doc-types","bitable"]\` |
| Wiki→Base | wiki | \`["+node-get","--token","<wiki_token>"]\` |
| 发 IM（bot） | im | \`["+messages-send","--chat-id","oc_xxx","--text","hello"]\` |
| 查登录 | auth | \`["status"]\` |

## 身份

- **默认 \`as: "user"\`**：读/写用户云文档、多维表格。
- **\`as: "bot"\`**：IM 桥接、以应用身份发消息。

## 错误

- 返回 \`confirmation_required\`：向用户确认后 \`yes: true\` 重试。
- scope 不足：引导用户在设置页完成 OAuth 或开放平台开通权限。
`;

async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return false;
  } catch {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  }
}

export async function installLarkCliSkillsPackage(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const skillDir = path.join(workspaceSkillsDirAbs(root), 'feishu-lark');
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const created: string[] = [];
  if (await writeFileIfMissing(skillMdPath, SKILL_MD)) {
    created.push(LARK_CLI_SKILL_MD);
    refreshHermesMemoryIndexBestEffort(root);
    void syncWorkspaceSkillManifest(root).catch(() => undefined);
  }
  return { created };
}
