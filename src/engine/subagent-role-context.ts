import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRoleTemplateId } from '../shared/sub-agent-types';
import { workspaceSubagentRolesDirAbs } from '../main/workspace/workspace-agent-layout';

/**
 * 子 Agent system 模板：优先读工作区可覆盖版本 `.subagent/.subroleAgent/<id>/`；
 * 缺失时回退为旧版单文件同目录下 `<id>.md`（兼容历史）。
 */
export async function buildSubAgentRoleSystemContent(
  workspaceRoot: string,
  roleTemplateId: SubAgentRoleTemplateId
): Promise<string> {
  const root = path.resolve(workspaceRoot);
  const baseDir = workspaceSubagentRolesDirAbs(root);
  const dir = path.join(baseDir, roleTemplateId);
  const files = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'] as const;
  try {
    const parts: string[] = [];
    for (const name of files) {
      const p = path.join(dir, name);
      const body = await fs.promises.readFile(p, 'utf-8');
      parts.push(body.trimEnd());
    }
    return parts.join('\n\n');
  } catch {
    // 兼容旧版单文件
    const legacy = path.join(baseDir, `${roleTemplateId}.md`);
    const body = await fs.promises.readFile(legacy, 'utf-8');
    return body.trimEnd();
  }
}

