/**
 * One-off splitter: extracts register blocks from tool-runtime-default-tools.ts
 * into domain modules under src/engine/tool-runtime-default-tools/
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(repoRoot, 'src/engine/tool-runtime-default-tools.ts');
const outDir = path.join(repoRoot, 'src/engine/tool-runtime-default-tools');

const segments = [
  {
    file: 'register-misc-tools.ts',
    ranges: [[73, 200]],
    header: `import type { ToolRuntime } from '../tool-runtime-core';
import { runClawFlowWebSearch, WEB_SEARCH_MAX_COUNT } from '../web-search';
import { runWebScrapeForTool } from '../../main/scrape/scrape-runner';

export function registerMiscTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-workspace-docs-tools.ts',
    ranges: [[202, 841]],
    header: `import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import * as workspaceExplorer from '../../main/workspace/workspace-explorer';
import { applyUpdateHunk, formatSummary, parsePatchText } from '../apply-patch';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  previewExcelBuffer,
  previewPdfBuffer,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
} from '../../main/workspace/workspace-office-preview';
import { clawflowDir, CLAWFLOW_DIR } from '../../main/workspace/workspace-service';
import { atomicWriteUtf8File } from '../atomic-write';
import {
  refreshHermesMemoryIndexBestEffort,
  isWorkspaceRelativeUnderHermesIndexedTextTree,
  patchSummaryTouchesHermesIndexedText,
} from '../hermes-memory-index-hooks';
import {
  ToolRuntime,
  notifyWorkspaceTreeChanged,
  isBlockedHermesMemoryDiskWrite,
  truncateForToolLog,
  normalizePathForCompare,
  assertNoExistingPathAliases,
  assertResolvedPathStillInsideRoot,
  resolveRealPathInsideWorkspace,
  sha256,
  sanitizeRelForOp,
  writeOpRecord,
  readOpMeta,
  confirmRequiredMessage,
} from '../tool-runtime-core';

export function registerWorkspaceDocsTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-workspace-shell-git-tools.ts',
    ranges: [[843, 1105]],
    header: `import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { ToolRuntime } from '../tool-runtime-core';
import { truncateForToolLog } from '../tool-runtime-core';
import { runWorkspaceShellCommand } from '../workspace-shell-exec';

const execFileAsync = promisify(execFile);

export function registerWorkspaceShellGitTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-scheduling-tools.ts',
    ranges: [[1107, 1351]],
    header: `import type { ToolRuntime } from '../tool-runtime-core';
import { truncateForToolLog } from '../tool-runtime-core';
import { readScheduleTriggers, writeScheduleTriggers, ensureScheduleNextFire } from '../../main/scheduling/schedule-triggers-service';
import { rescheduleScheduleTriggersForWorkspace } from '../../main/scheduling/schedule-triggers-scheduler';
import { broadcastScheduleTriggersUpdated } from '../../main/scheduling/schedule-triggers-broadcast';
import { defaultScheduleTrigger, type ScheduleTriggerRecord } from '../../shared/schedule-triggers';

export function registerSchedulingTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-hermes-memory-tools.ts',
    ranges: [[1353, 1562], [1828, 1849]],
    header: `import type { ToolRuntime } from '../tool-runtime-core';
import { notifyWorkspaceTreeChanged } from '../tool-runtime-core';
import { rebuildHermesSkillFtsIndex, searchHermesMemory, type HermesMemorySearchHit } from '../hermes-memory-db';
import {
  deleteHermesMemoryDocument,
  listHermesMemoryDocuments,
  upsertHermesMemoryDocument,
} from '../hermes-memory-store';
import { HERMES_MEMORY_REL_PREFIX } from '../../main/workspace/workspace-hermes-layout';
import { refreshHermesMemoryIndexBestEffort } from '../hermes-memory-index-hooks';

export function registerHermesMemoryTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-workspace-skills-tools.ts',
    ranges: [[1564, 1826]],
    header: `import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import {
  ToolRuntime,
  notifyWorkspaceTreeChanged,
  resolveRealPathInsideWorkspace,
  confirmRequiredMessage,
} from '../tool-runtime-core';
import { readWorkspaceSkillTextFile } from '../../main/workspace/workspace-skills-read';
import { syncWorkspaceSkillManifest } from '../../main/workspace/workspace-skill-manifest';
import { atomicWriteUtf8File } from '../atomic-write';
import { assertValidSkillFolderName, guardHermesSkillTextContent } from '../skills-guard';
import { refreshHermesMemoryIndexBestEffort } from '../hermes-memory-index-hooks';
import {
  isSkillIndexedDocumentRel,
  isSkillReferencesOnlyDocRel,
  normalizeSkillWorkspaceRel,
  normalizeWorkspaceRel,
} from '../workspace-skill-paths';
import { WORKSPACE_AGENT_SKILLS_REL } from '../../main/workspace/workspace-agent-layout';
import { applyUpdateHunk, parsePatchText } from '../apply-patch';

export function registerWorkspaceSkillsTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
  {
    file: 'register-feishu-tools.ts',
    ranges: [[1851, 1934]],
    header: `import type { ToolRuntime } from '../tool-runtime-core';
import { formatFeishuInvokeToolResult } from '../../utils/tool-result-truncate';
import { larkCliDomainSupportsFormatFlag } from '../../main/lark-cli/lark-cli-whitelist';

export function registerFeishuTools(rt: ToolRuntime): void {
`,
    footer: `}
`,
  },
];

const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

fs.mkdirSync(outDir, { recursive: true });

for (const seg of segments) {
  const body = seg.ranges
    .map(([start, end]) => lines.slice(start - 1, end).join('\n'))
    .join('\n\n');
  fs.writeFileSync(path.join(outDir, seg.file), `${seg.header}${body}\n${seg.footer}`, 'utf8');
  const lineCount = seg.ranges.reduce((n, [a, b]) => n + (b - a + 1), 0);
  console.log('wrote', seg.file, lineCount, 'lines');
}

const index = `import { ToolRuntime } from '../tool-runtime-core';
import { registerMiscTools } from './register-misc-tools';
import { registerWorkspaceDocsTools } from './register-workspace-docs-tools';
import { registerWorkspaceShellGitTools } from './register-workspace-shell-git-tools';
import { registerSchedulingTools } from './register-scheduling-tools';
import { registerHermesMemoryTools } from './register-hermes-memory-tools';
import { registerWorkspaceSkillsTools } from './register-workspace-skills-tools';
import { registerFeishuTools } from './register-feishu-tools';

/** 注册的 \\\`function.name\\\` 须与 \\\`shared/workspace-tool-manifest-bridge.ts\\\` 中映射同步。 */
export function createDefaultToolRuntime(): ToolRuntime {
  const rt = new ToolRuntime();
  registerMiscTools(rt);
  registerWorkspaceDocsTools(rt);
  registerWorkspaceShellGitTools(rt);
  registerSchedulingTools(rt);
  registerHermesMemoryTools(rt);
  registerWorkspaceSkillsTools(rt);
  registerFeishuTools(rt);
  return rt;
}
`;

fs.writeFileSync(path.join(outDir, 'index.ts'), index, 'utf8');
console.log('wrote index.ts');
