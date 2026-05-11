import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRoleTemplateId } from '../shared/sub-agent-types';
import { clawflowDir } from '../workspace-service';

/**
 * 子 Agent system 模板：优先读工作区可覆盖版本 `.clawflow/subagent-roles/<id>.md`；
 * 缺失时回退为旧版单文件 `.clawflow/subagent-roles/<id>.md`（兼容历史）。
 */
export async function buildSubAgentRoleSystemContent(
  workspaceRoot: string,
  roleTemplateId: SubAgentRoleTemplateId
): Promise<string> {
  const root = path.resolve(workspaceRoot);
  const cf = clawflowDir(root);
  const dir = path.join(cf, 'subagent-roles', roleTemplateId);
  const files = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md'] as const;
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
    const legacy = path.join(cf, 'subagent-roles', `${roleTemplateId}.md`);
    const body = await fs.promises.readFile(legacy, 'utf-8');
    return body.trimEnd();
  }
}

