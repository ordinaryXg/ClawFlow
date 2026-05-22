import fs from 'fs';

const p = 'src/engine/tool-runtime.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const core = lines.slice(0, 393).join('\n');
const defaultsBody = lines.slice(393).join('\n');

const exportHelpers = [
  'notifyWorkspaceTreeChanged',
  'isBlockedHermesMemoryDiskWrite',
  'truncateForToolLog',
  'normalizePathForCompare',
  'assertNoExistingPathAliases',
  'assertResolvedPathStillInsideRoot',
  'resolveRealPathInsideWorkspace',
  'sha256',
  'sanitizeRelForOp',
  'writeOpRecord',
  'readOpMeta',
  'confirmRequiredMessage',
];

let coreOut = core;
for (const name of exportHelpers) {
  coreOut = coreOut.replace(
    new RegExp(`^(async )?function ${name}\\b`, 'm'),
    (_, asyncKw) => `export ${asyncKw ?? ''}function ${name}`
  );
}
// core 仅保留类与路径/校验辅助，imports 由后续手工精简
fs.writeFileSync('src/engine/tool-runtime-core.ts', coreOut);

const importLines = lines
  .slice(0, 51)
  .filter((l) => !l.includes('toolNameAllowedByWorkspaceManifest') && !l.includes('ToolCall'))
  .join('\n');

const defaultsImports = `${importLines}
import {
  ToolRuntime,
  ${exportHelpers.join(',\n  ')},
} from './tool-runtime-core';

`;

fs.writeFileSync('src/engine/tool-runtime-default-tools.ts', defaultsImports + defaultsBody);
fs.writeFileSync(
  'src/engine/tool-runtime.ts',
  `export { ToolRuntime, type ToolExecutionContext, type ToolResult } from './tool-runtime-core';
export { createDefaultToolRuntime } from './tool-runtime-default-tools';
`
);
console.log('split ok', lines.length);
