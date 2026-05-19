/**
 * 主 Agent `.agent/.memory/` 初始模板（仅缺失时写入，不覆盖用户内容）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes-memory-index-hooks';
import { buildWorkspaceMemoryNoteTemplate } from '../../shared/workspace-memory-frontmatter';
import { workspaceAgentDotMemoryDirAbs } from './workspace-agent-layout';

const README = `# 主 Agent 记忆目录（.agent/.memory）

本目录用于**跨会话**可检索的片段笔记与整理稿，与对话 UI 中的气泡分离。

## L0 / L1 / L2（frontmatter 约定）

每个 \`.md\` 笔记建议在文首使用 YAML frontmatter（\`---\` 包裹）：

| 层级 | 字段 | 作用 |
|------|------|------|
| **L0** | \`abstract\` | 一句话摘要；参与 FTS，便于检索时快速判断 |
| **L1** | \`overview\` | 较短概览（可用 \`overview: |\` 多行）；参与 FTS |
| **L2** | frontmatter 之后正文 | 完整内容；同样进入 FTS |

可选 \`title\` 用于展示标题；未写时以文件名为准。

示例见同目录 \`memory-note.example.md\`（缺失时由应用补写）。

## 建议用法

- **当日 / 速记**：\`YYYY-MM-DD.md\`（按本地日期命名）
- **主题长文**：\`topic-<slug>.md\`
- **从对话提炼**：由进化 Agent 或你本人将可复用结论写入此目录；模型不会「自动记住」未落盘内容。

## 检索

启用 \`tools.knowledge_base\` 后，\`workspace_memory_search\` / \`workspace_knowledge_query\` 会检索本目录与 \`.agent/.skills\`（SQLite FTS5，\`.agent/.clawflow/hermes-memory.db\`）。修改笔记后写入磁盘即会增量索引；亦可调用 \`workspace_memory_rebuild_index\`。

## 与进化流程

启用 \`tools.skills\` 后，系统会周期性调度 **Skill Agent（进化）** 汇总「自上次进化以来」的主对话与旧记忆，做瘦身与再编排，并回写技能与角色文档。请勿在此目录存放密钥或超大二进制。
`;

const INDEX = `# 记忆索引（模板）

| 文件 | 说明 |
|------|------|
| （待补充） | 由你或进化流程维护 |

> 可删除本文件；保留 \`README.md\` 即可。
`;

const EXAMPLE_NOTE = buildWorkspaceMemoryNoteTemplate({
  title: '示例记忆笔记',
  abstract: '演示 L0：一句话说明本笔记用途，供检索命中后判断是否打开全文。',
  overview: `演示 L1：可写背景、结论与下一步。
进化 Agent 或你本人维护真实笔记时请替换本文件内容。`,
  bodyHeading: '## 正文（L2）',
});

async function writeIfMissing(abs: string, body: string): Promise<boolean> {
  try {
    await fs.promises.writeFile(abs, body.endsWith('\n') ? body : `${body}\n`, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'EEXIST') return false;
    throw e;
  }
}

export async function ensureWorkspaceMainMemoryTemplates(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const dir = workspaceAgentDotMemoryDirAbs(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const created: string[] = [];
  const r1 = await writeIfMissing(path.join(dir, 'README.md'), README);
  if (r1) created.push('.agent/.memory/README.md');
  const r2 = await writeIfMissing(path.join(dir, 'INDEX.md'), INDEX);
  if (r2) created.push('.agent/.memory/INDEX.md');
  const r3 = await writeIfMissing(path.join(dir, 'memory-note.example.md'), EXAMPLE_NOTE);
  if (r3) created.push('.agent/.memory/memory-note.example.md');

  if (created.length) {
    refreshHermesMemoryIndexBestEffort(root);
  }

  return { created };
}
