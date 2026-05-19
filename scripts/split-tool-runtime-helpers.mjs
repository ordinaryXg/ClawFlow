import fs from 'node:fs';

const trPath = 'src/engine/tool-runtime.ts';
const tr = fs.readFileSync(trPath, 'utf8');
const lines = tr.split(/\r?\n/);

// Helpers: lines 87-270 (1-based) -> index 86-269
const helperLines = lines.slice(86, 270);
const helperHeader = `import { shell } from 'electron';
import type { ToolSchema } from './providers/types';
import { isSafeHttpUrl, normalizeHttpUrl } from '../utils/normalize-http-url';
import * as workspaceExplorer from '../main/workspace/workspace-explorer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  previewExcelBuffer,
  previewPdfBuffer,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
} from '../main/workspace/workspace-office-preview';
import { clawflowDir } from '../main/workspace/workspace-service';
import { isWorkspaceRelativeUnderHermesIndexedTextTree, refreshHermesMemoryIndexBestEffort } from './hermes-memory-index-hooks';

const execFileAsync = promisify(execFile);

`;

const helperBody = helperLines
  .map((l) => {
    if (l.startsWith('function ')) return 'export ' + l;
    if (l.startsWith('async function ')) return 'export ' + l;
    if (l.startsWith('type OpMeta')) return 'export ' + l;
    return l;
  })
  .join('\n');

fs.writeFileSync('src/engine/tool-runtime-helpers.ts', helperHeader + helperBody + '\n');

// Remove helper lines from tool-runtime, add import
const newLines = [
  ...lines.slice(0, 86),
  "export * from './tool-runtime-helpers';",
  "import {",
  '  assertNoExistingPathAliases,',
  '  assertResolvedPathStillInsideRoot,',
  '  confirmRequiredMessage,',
  '  normalizePathForCompare,',
  '  readOpMeta,',
  '  resolveRealPathInsideWorkspace,',
  '  sanitizeRelForOp,',
  '  sha256,',
  '  truncateForToolLog,',
  '  validateStrictArgs,',
  '  assertStrictSchema,',
  '  writeOpRecord,',
  "} from './tool-runtime-helpers';",
  '',
  ...lines.slice(270),
];
fs.writeFileSync(trPath, newLines.join('\n'));
console.log('helpers split');
