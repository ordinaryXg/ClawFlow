/**
 * `.agent/knowledge/` 初始目录与说明（仅缺失时写入）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildWorkspaceMemoryNoteTemplate } from '../../shared/workspace-memory-frontmatter';
import { workspaceAgentKnowledgeDirAbs } from './workspace-agent-layout';
import { rebuildKnowledgeManifest } from './workspace-knowledge-manifest';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes-memory-index-hooks';

const README = `# 工作区知识库（.agent/knowledge）

本目录用于**用户策展**的可检索文档（规范、参考资料、导入摘录等），与 \`.agent/.memory/\`（跨会话记忆/进化整理）分工不同。

## 子目录

| 目录 | 用途 |
|------|------|
| \`docs/\` | 长文、规范、说明 |
| \`notes/\` | 速记、待整理草稿 |
| \`data/\` | 结构化内容的 Markdown 摘录 |
| \`uploads/\` | 原始附件（PDF 等；Phase 2 起支持抽取文本索引） |

## 检索

启用 \`tools.knowledge_base\` 后，\`.md\` / \`.txt\` 会进入 Hermes FTS（\`.agent/.clawflow/hermes-memory.db\`），与 \`.agent/.memory\`、\`.agent/.skills\` 一并检索。

建议在 \`.md\` 文首使用与记忆笔记相同的 frontmatter（\`title\` / \`abstract\` / \`overview\`），便于 Hub 列表与检索摘要展示。
`;

async function writeIfMissing(absPath: string, content: string): Promise<boolean> {
  try {
    await fs.promises.access(absPath);
    return false;
  } catch {
    /* missing */
  }
  await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, content, 'utf8');
  return true;
}

export async function ensureWorkspaceKnowledgeTemplates(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const base = workspaceAgentKnowledgeDirAbs(root);
  const created: string[] = [];

  const subdirs = ['docs', 'notes', 'data', 'uploads'] as const;
  for (const sub of subdirs) {
    const d = path.join(base, sub);
    try {
      await fs.promises.mkdir(d, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  if (await writeIfMissing(path.join(base, 'README.md'), README.endsWith('\n') ? README : `${README}\n`)) {
    created.push('.agent/knowledge/README.md');
  }

  const example = buildWorkspaceMemoryNoteTemplate({
    title: '知识库示例笔记',
    abstract: '演示 L0：一句话说明本文档用途。',
    overview: '演示 L1：可写背景与要点。',
    bodyHeading: '## 正文',
  });
  if (
    await writeIfMissing(
      path.join(base, 'notes', 'example-knowledge-note.md'),
      example.endsWith('\n') ? example : `${example}\n`
    )
  ) {
    created.push('.agent/knowledge/notes/example-knowledge-note.md');
  }

  try {
    rebuildKnowledgeManifest(root);
    refreshHermesMemoryIndexBestEffort(root);
  } catch {
    /* ignore */
  }

  return { created };
}

function slugifyTitle(title: string): string {
  const s = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/gi, '')
    .slice(0, 48);
  return s || 'note';
}

export async function createKnowledgeNote(
  workspaceRoot: string,
  opts?: { title?: string; subdir?: 'notes' | 'docs' }
): Promise<{ ok: true; relativePath: string } | { ok: false; error: string }> {
  const root = path.resolve(workspaceRoot);
  const subdir = opts?.subdir === 'docs' ? 'docs' : 'notes';
  const title = String(opts?.title ?? '').trim() || 'Untitled';
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugifyTitle(title);
  const relPosix = `.agent/knowledge/${subdir}/${date}-${slug}.md`;
  const abs = path.join(root, ...relPosix.split('/'));

  try {
    await fs.promises.access(abs);
    return { ok: false, error: 'file_exists' };
  } catch {
    /* new */
  }

  const body = buildWorkspaceMemoryNoteTemplate({
    title,
    abstract: '',
    overview: '',
    bodyHeading: '## 正文',
  });
  try {
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
    rebuildKnowledgeManifest(root);
    refreshHermesMemoryIndexBestEffort(root);
    return { ok: true, relativePath: relPosix };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
