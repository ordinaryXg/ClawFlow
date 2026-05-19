import fs from 'node:fs';

const trPath = 'src/engine/tool-runtime.ts';
const regPath = 'src/engine/register-default-tools.ts';
const reg = fs.readFileSync(regPath, 'utf8');
const start = reg.indexOf('export function registerDefaultTools');
const open = reg.indexOf('{', start);
let depth = 0;
let i = open;
for (; i < reg.length; i++) {
  if (reg[i] === '{') depth++;
  else if (reg[i] === '}') {
    depth--;
    if (depth === 0) break;
  }
}
const registerBlock = reg.slice(open + 1, i).trim();

let tr = fs.readFileSync(trPath, 'utf8');
tr = tr.replace(/\nimport \{ registerDefaultTools \} from '\.\/register-default-tools';\n/g, '\n');
const fnMarker = 'export function createDefaultToolRuntime(): ToolRuntime {';
const fnIdx = tr.indexOf(fnMarker);
if (fnIdx < 0) throw new Error('fn missing');
const before = tr.slice(0, fnIdx).trimEnd();
const newTr = `${before}

/** 注册的 \`function.name\` 须与 \`shared/workspace-tool-manifest-bridge.ts\` 中映射同步。 */
export function createDefaultToolRuntime(): ToolRuntime {
  const rt = new ToolRuntime();
${registerBlock}
  return rt;
}
`;
fs.writeFileSync(trPath, newTr);
fs.unlinkSync(regPath);
console.log('merged', registerBlock.length);
