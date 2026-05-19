/**
 * `.agent/.memory/*.md` 的 L0/L1 frontmatter 约定（YAML 子集，无外部依赖）。
 *
 * - **L0 `abstract`**：一句话摘要（检索与「要不要打开全文」）
 * - **L1 `overview`**：较短概览（背景 / 结论 / 待办）
 * - **L2**：frontmatter 之后的 Markdown 正文
 */

export type WorkspaceMemoryFrontmatter = {
  title?: string;
  abstract?: string;
  overview?: string;
};

export type ParsedWorkspaceMemoryMarkdown = WorkspaceMemoryFrontmatter & {
  body: string;
  /** 参与 FTS 的拼接文本：abstract + overview + body */
  ftsBody: string;
  hasFrontmatter: boolean;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquoteYamlScalar(raw: string): string {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 解析 frontmatter 块（仅支持 title / abstract / overview 与 overview 的 `|` 多行块） */
export function parseWorkspaceMemoryFrontmatterBlock(fm: string): WorkspaceMemoryFrontmatter {
  const out: WorkspaceMemoryFrontmatter = {};
  const lines = fm.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1].toLowerCase();
    let value = m[2];

    if (value === '|' || value === '|-') {
      const block: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === '' && block.length > 0) {
          const peek = lines[i + 1];
          if (peek !== undefined && /^(\s{2,}|\t)/.test(peek)) {
            block.push('');
            i++;
            continue;
          }
          break;
        }
        if (next.trim() !== '' && !/^(\s{2,}|\t)/.test(next)) break;
        const stripped = next.replace(/^\s{2}/, '').replace(/^\t/, '');
        block.push(stripped);
        i++;
      }
      value = block.join('\n').trimEnd();
    } else {
      value = unquoteYamlScalar(value);
      i++;
    }

    if (key === 'title') out.title = value.trim() || undefined;
    else if (key === 'abstract') out.abstract = value.trim() || undefined;
    else if (key === 'overview') out.overview = value.trim() || undefined;
  }
  return out;
}

export function parseWorkspaceMemoryMarkdown(raw: string): ParsedWorkspaceMemoryMarkdown {
  const text = String(raw ?? '');
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    const body = text.trim();
    return { body, ftsBody: body, hasFrontmatter: false };
  }
  const fm = parseWorkspaceMemoryFrontmatterBlock(m[1]);
  const body = m[2].replace(/^\s+/, '').trimEnd();
  const parts = [fm.abstract, fm.overview, body].map((p) => String(p ?? '').trim()).filter(Boolean);
  return {
    ...fm,
    body,
    ftsBody: parts.join('\n\n'),
    hasFrontmatter: true,
  };
}

/** 新建记忆笔记用的 frontmatter 模板（不含正文） */
export function buildWorkspaceMemoryNoteTemplate(params: {
  title: string;
  abstract: string;
  overview: string;
  bodyHeading?: string;
}): string {
  const title = params.title.replace(/\n/g, ' ').trim();
  const abstract = params.abstract.replace(/\n/g, ' ').trim();
  const overview = params.overview.trim();
  const bodyHeading = params.bodyHeading ?? '## 正文';
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `abstract: ${JSON.stringify(abstract)}`,
    'overview: |',
    ...overview.split('\n').map((l) => `  ${l}`),
    '---',
    '',
    bodyHeading,
    '',
    '（在此撰写 L2 全文。）',
    '',
  ].join('\n');
}
