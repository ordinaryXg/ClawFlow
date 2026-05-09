/**
 * 每次对话请求前注入工作区 `.roleAgent/` 下的 Markdown，作为 system 上下文。
 */

import * as fs from 'fs';
import * as path from 'path';
import { WORKSPACE_ROLE_AGENT_DIR, WORKSPACE_ROLE_AGENT_FILES_ORDER } from '../workspace-agent-bootstrap';

const MAX_TOTAL_CHARS = 100_000;
const MAX_FILE_CHARS = 24_000;

function trimFileBody(name: string, body: string): string {
  const s = String(body ?? '');
  if (s.length <= MAX_FILE_CHARS) return s;
  return `${s.slice(0, MAX_FILE_CHARS)}\n\n… (truncated, ${name} exceeds ${MAX_FILE_CHARS} chars) …\n`;
}

/**
 * 读取 `.roleAgent/` 目录下全部 `.md` 文件，拼成一条 system 说明文本（含各文件边界）。
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
      '[ClawFlow] Workspace role directory is missing or unreadable.',
      `Expected path: ${path.join(WORKSPACE_ROLE_AGENT_DIR, '*.md')}`,
      'Open this folder as a ClawFlow workspace or create `.roleAgent/` with AGENTS.md, SOUL.md, etc.',
    ].join('\n');
  }

  const orderedNames = [...WORKSPACE_ROLE_AGENT_FILES_ORDER, ...extraMd];
  const parts: string[] = [
    'The following files are from the workspace `.roleAgent/` directory. Treat them as binding role, identity, and local notes for this session.',
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
    const block = [`### .roleAgent/${name}`, '', trimmed, ''].join('\n');
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push(
        `… (further .roleAgent files omitted: total context would exceed ${MAX_TOTAL_CHARS} characters) …`
      );
      break;
    }
    parts.push(block);
    total += block.length;
  }

  const text = parts.join('\n').trim();
  if (text.length < 80) {
    return [
      '[ClawFlow] No `.md` files were found under `.roleAgent/`.',
      'Initialize the workspace in ClawFlow to create role templates, or add AGENTS.md / SOUL.md there.',
    ].join('\n');
  }
  return text;
}
