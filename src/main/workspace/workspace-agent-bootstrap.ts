/**
 * 工作区 Agent 角色模板：按需写入 `.agent/.roleAgent/` 等约定文件
 * 统一放在工作区 `.agent/.roleAgent/`，仅在文件不存在时创建（flag wx），不覆盖用户已有内容。
 */

import * as fs from 'fs';
import * as path from 'path';
import templateAgents from '../../workspace-templates/role-agent/AGENTS.md';
import templateSoul from '../../workspace-templates/role-agent/SOUL.md';
import templateTools from '../../workspace-templates/role-agent/TOOLS.md';
import { WORKSPACE_ROLE_AGENT_DIR, workspaceRoleAgentDirAbs } from './workspace-agent-layout';

export { WORKSPACE_ROLE_AGENT_DIR };

export const WORKSPACE_AGENT_AGENTS_MD = 'AGENTS.md';
export const WORKSPACE_AGENT_SOUL_MD = 'SOUL.md';
export const WORKSPACE_AGENT_TOOLS_MD = 'TOOLS.md';

/** 注入模型上下文时按此顺序读取；其余 `.md` 按名字排序追加 */
export const WORKSPACE_ROLE_AGENT_FILES_ORDER: readonly string[] = [
  WORKSPACE_AGENT_AGENTS_MD,
  WORKSPACE_AGENT_SOUL_MD,
  WORKSPACE_AGENT_TOOLS_MD,
];

/** 角色模板正文见 `src/workspace-templates/role-agent/*.md`（Webpack 以纯文本打入主进程） */
const TEMPLATES_IN_ORDER: Array<{ name: string; content: string }> = [
  { name: WORKSPACE_AGENT_AGENTS_MD, content: templateAgents },
  { name: WORKSPACE_AGENT_SOUL_MD, content: templateSoul },
  { name: WORKSPACE_AGENT_TOOLS_MD, content: templateTools },
];

async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.promises.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (e: any) {
    if (e?.code === 'EEXIST') return false;
    throw e;
  }
}

/**
 * 在工作区 `.agent/.roleAgent/` 中写入 agent 角色模板（缺失则创建）。
 */
export async function ensureWorkspaceAgentRoleTemplates(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const roleDir = workspaceRoleAgentDirAbs(root);
  await fs.promises.mkdir(roleDir, { recursive: true });

  const created: string[] = [];

  for (const { name, content } of TEMPLATES_IN_ORDER) {
    const filePath = path.join(roleDir, name);
    const body = content.endsWith('\n') ? content : `${content}\n`;
    if (await writeFileIfMissing(filePath, body)) {
      created.push(path.join(WORKSPACE_ROLE_AGENT_DIR, name).replace(/\\/g, '/'));
    }
  }

  await patchRoleAgentToolsMdIfStale(root).catch(() => undefined);

  return { created };
}

const ROLE_TOOLS_FEISHU_ROW =
  '| **`feishu.md`** | 飞书 / Lark（lark-cli）；云文档、多维表格、Drive、Wiki、IM（与 `tools.feishu` 对应）。 |';

/** 既有工作区 TOOLS.md 补全 feishu 行（不覆盖用户自定义备忘）。 */
export async function patchRoleAgentToolsMdIfStale(workspaceRoot: string): Promise<boolean> {
  const fp = path.join(workspaceRoleAgentDirAbs(workspaceRoot), WORKSPACE_AGENT_TOOLS_MD);
  let body: string;
  try {
    body = await fs.promises.readFile(fp, 'utf-8');
  } catch {
    return false;
  }
  if (body.includes('feishu.md') || body.includes('tools.feishu')) return false;

  let next = body;
  next = next.replace(
    '`tools.knowledge_base` 等。',
    '`tools.knowledge_base`、`tools.feishu` 等。'
  );
  const kbRow =
    '| **`knowledge_base.md`** | 知识库检索（与 `tools.knowledge_base` 对应）。 |';
  if (next.includes(kbRow)) {
    next = next.replace(kbRow, `${kbRow}\n${ROLE_TOOLS_FEISHU_ROW}`);
  } else {
    next = `${next.trimEnd()}\n\n${ROLE_TOOLS_FEISHU_ROW}\n`;
  }
  await fs.promises.writeFile(fp, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
  return true;
}
