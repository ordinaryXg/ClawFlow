import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'src/shared/workspace-tool-template-md.ts');
const outDir = path.join(root, 'src/shared/workspace-tool-docs');
fs.mkdirSync(outDir, { recursive: true });

const src = fs.readFileSync(srcPath, 'utf8');

const entries = [
  ['docs', 'buildWorkspaceToolDocsMd', 'docs'],
  ['browser', 'buildWorkspaceToolBrowserMd', 'browser'],
  ['shell', 'buildWorkspaceToolShellMd', 'shell'],
  ['git', 'buildWorkspaceToolGitMd', 'git'],
  ['todos', 'buildWorkspaceToolTodosMd', 'todos'],
  ['skills', 'buildWorkspaceToolSkillsMd', 'skills'],
  ['knowledge_base', 'buildWorkspaceToolKnowledgeBaseMd', 'knowledge_base'],
  ['feishu', 'buildWorkspaceToolFeishuMd', 'feishu'],
];

function parseStringArray(fnName) {
  const fnIdx = src.indexOf(`export function ${fnName}()`);
  if (fnIdx < 0) throw new Error(`missing ${fnName}`);
  const slice = src.slice(fnIdx);
  const start = slice.indexOf('return [');
  const end = slice.indexOf('].join', start);
  const arrText = slice.slice(start + 'return '.length, end + 1);
  const lines = [];
  const re = /`((?:\\.|[^`])*)`/g;
  let m;
  while ((m = re.exec(arrText))) {
    lines.push(m[1].replace(/\\n/g, '\n').replace(/\\`/g, '`'));
  }
  return lines.join('\n');
}

for (const [file, fn, capId] of entries) {
  let md = parseStringArray(fn);
  if (capId === 'browser') {
    md = md.replace(
      /bulletTools\(WORKSPACE_CAPABILITY_TOOL_NAMES\.web_search\)/,
      '{{TOOLS:web_search}}'
    );
    md = md.replace(
      /bulletTools\(WORKSPACE_CAPABILITY_TOOL_NAMES\.web_scrape\)/,
      '{{TOOLS:web_scrape}}'
    );
  } else {
    md = md.replace(
      new RegExp(`bulletTools\\(WORKSPACE_CAPABILITY_TOOL_NAMES\\.${capId}\\)`),
      `{{TOOLS:${capId}}}`
    );
  }
  md = md.replace(
    /\$\{WORKSPACE_TOOLS_ALWAYS_ALLOWED\.map\(\(n\) => `\\`\\$\{n\}\\``\)\.join\('、'\)\}/g,
    '{{ALWAYS_ALLOWED}}'
  );
  // leftover template literals from failed replace - manual fix for docs
  md = md.replace(/\$\{bulletTools\(WORKSPACE_CAPABILITY_TOOL_NAMES\.docs\)\}/g, '{{TOOLS:docs}}');
  md = md.replace(/\$\{bulletTools\(WORKSPACE_CAPABILITY_TOOL_NAMES\.[^}]+\)\}/g, (x) => {
    const id = x.match(/\.([a-z_]+)\)/)?.[1];
    return id ? `{{TOOLS:${id}}}` : x;
  });
  fs.writeFileSync(path.join(outDir, `${file}.md`), md.endsWith('\n') ? md : `${md}\n`);
  console.log('wrote', file, md.length);
}
