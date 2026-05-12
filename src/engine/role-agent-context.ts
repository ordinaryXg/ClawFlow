/**
 * 每次对话请求前注入工作区 `.agent/.roleAgent/` 下的 Markdown，作为 system 上下文。
 */

import * as fs from 'fs';
import * as path from 'path';
import { WORKSPACE_ROLE_AGENT_DIR, WORKSPACE_ROLE_AGENT_FILES_ORDER } from '../workspace-agent-bootstrap';

const MAX_TOTAL_CHARS = 100_000;
const MAX_FILE_CHARS = 24_000;

function trimFileBody(name: string, body: string): string {
  const s = String(body ?? '');
  if (s.length <= MAX_FILE_CHARS) return s;
  return `${s.slice(0, MAX_FILE_CHARS)}\n\n…（已截断：${name} 超过 ${MAX_FILE_CHARS} 字符）…\n`;
}

/**
 * 读取 `.agent/.roleAgent/` 目录下全部 `.md` 文件，拼成一条 system 说明文本（含各文件边界）。
 * 目录不存在或无任何 md 时返回说明性占位内容，保证调用方仍可固定插入 system。
 */
export async function buildRoleAgentSystemContent(workspaceRoot: string): Promise<string> {
  const root = path.resolve(workspaceRoot);
  const roleDir = path.join(root, WORKSPACE_ROLE_AGENT_DIR);

  let extraMd: string[] = [];
  try {
    const entries = await fs.promises.readdir(roleDir, { withFileTypes: true });
    const known = new Set(WORKSPACE_ROLE_AGENT_FILES_ORDER);
    extraMd = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md') && !known.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [
      '[ClawFlow] 工作区角色目录缺失或无法读取。',
      `预期路径：${path.join(WORKSPACE_ROLE_AGENT_DIR, '*.md')}`,
      '请用 ClawFlow 打开本文件夹作为工作区，或在工作区创建 `.agent/.roleAgent/` 并放入 AGENTS.md、SOUL.md 等文件。',
    ].join('\n');
  }

  const orderedNames = [...WORKSPACE_ROLE_AGENT_FILES_ORDER, ...extraMd];
  const parts: string[] = [
    '以下内容来自工作区 `.agent/.roleAgent/` 目录下的 Markdown。请将其视为本会话中具有约束力的角色设定、身份与本地备忘。',
    '',
  ];

  let total = parts.join('\n').length;

  for (const name of orderedNames) {
    const fp = path.join(roleDir, name);
    let body: string;
    try {
      body = await fs.promises.readFile(fp, 'utf-8');
    } catch {
      continue;
    }
    const trimmed = trimFileBody(name, body);
    const block = [`### ${WORKSPACE_ROLE_AGENT_DIR}/${name}`, '', trimmed, ''].join('\n');
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push(`…（后续 ${WORKSPACE_ROLE_AGENT_DIR} 文件已省略：总上下文将超过 ${MAX_TOTAL_CHARS} 字符）…`);
      break;
    }
    parts.push(block);
    total += block.length;
  }

  const text = parts.join('\n').trim();
  if (text.length < 80) {
    return [
      '[ClawFlow] 在 `.agent/.roleAgent/` 下未发现任何 `.md` 文件。',
      '可在 ClawFlow 中初始化工作区以生成角色模板，或自行在该目录添加 AGENTS.md、SOUL.md 等。',
    ].join('\n');
  }
  return text;
}
