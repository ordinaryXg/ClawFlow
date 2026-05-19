import fs from 'node:fs';

const trPath = 'src/engine/tool-runtime.ts';
let tr = fs.readFileSync(trPath, 'utf8');
const marker = 'export function createDefaultToolRuntime(): ToolRuntime {';
const i = tr.indexOf(marker);
if (i < 0) {
  console.error('marker missing');
  process.exit(1);
}
const before = tr.slice(0, i).trimEnd();
const body = tr.slice(i + marker.length);
const regStart = body.indexOf('rt.register(');
if (regStart < 0) {
  console.error('rt.register missing');
  process.exit(1);
}
const registerBlock = body.slice(regStart, body.lastIndexOf('return rt;')).trimEnd();

const regFile = `/**
 * 内置工具注册；\`function.name\` 须与 \`workspace-tool-manifest-bridge\` 同步。
 */
import { ToolRuntime } from './tool-runtime';

export function registerDefaultTools(rt: ToolRuntime): void {
  ${registerBlock}
}
`;
fs.writeFileSync('src/engine/register-default-tools.ts', regFile);

const newTr = `${before}

import { registerDefaultTools } from './register-default-tools';

/** 注册的 \`function.name\` 须与 \`shared/workspace-tool-manifest-bridge.ts\` 中映射同步。 */
export function createDefaultToolRuntime(): ToolRuntime {
  const rt = new ToolRuntime();
  registerDefaultTools(rt);
  return rt;
}
`;
fs.writeFileSync(trPath, newTr);
console.log('ok', registerBlock.length);
