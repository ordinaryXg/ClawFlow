#!/usr/bin/env node
/**
 * 离线采样：分析工作区 conversations.json 与 Hermes DB 体量（无需启动 Electron）。
 * 用法：node scripts/memory-diagnostics-snapshot.mjs [workspaceRoot]
 */
import fs from 'fs';
import path from 'path';

const ws = path.resolve(process.argv[2] ?? path.join(process.env.APPDATA ?? '', 'claw-flow', 'WorkSpace'));

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function dirSize(dir) {
  let t = 0;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) t += dirSize(p);
      else if (ent.isFile()) t += fs.statSync(p).size;
    }
  } catch {
    /* ignore */
  }
  return t;
}

function analyzeMessages(messages) {
  const byRole = {};
  let contentChars = 0;
  let reasoningChars = 0;
  let toolChars = 0;
  const sized = [];
  for (const m of messages) {
    const role = m.role ?? '?';
    byRole[role] = (byRole[role] ?? 0) + 1;
    const c = String(m.content ?? '').length;
    const r = String(m.reasoning_content ?? '').length;
    contentChars += c + r;
    if (role === 'tool') toolChars += c;
    reasoningChars += r;
    sized.push({ role, chars: c + r, preview: String(m.content ?? '').slice(0, 60) });
  }
  sized.sort((a, b) => b.chars - a.chars);
  return { total: messages.length, byRole, contentChars, reasoningChars, toolChars, top: sized.slice(0, 5) };
}

const convPath = path.join(ws, '.clawflow', 'conversations.json');
const hermesDb = path.join(ws, '.agent', '.hermes', 'index', 'hermes-memory.db');

console.log('ClawFlow memory snapshot');
console.log('workspace:', ws);
console.log('');

if (fs.existsSync(convPath)) {
  const bytes = fs.statSync(convPath).size;
  const raw = JSON.parse(fs.readFileSync(convPath, 'utf8'));
  const convs = Array.isArray(raw) ? raw : raw.conversations ?? [];
  const msgs = convs.flatMap((c) => c.messages ?? []);
  const a = analyzeMessages(msgs);
  console.log('conversations.json:', fmtBytes(bytes));
  console.log('  conversations:', convs.length, 'messages:', a.total);
  console.log('  by role:', JSON.stringify(a.byRole));
  console.log('  content chars:', a.contentChars, `(~${Math.round(a.contentChars / 4)} tokens est.)`);
  console.log('  tool chars:', a.toolChars, 'reasoning chars:', a.reasoningChars);
  console.log('  largest messages:');
  for (const x of a.top) console.log(`    [${x.role}] ${x.chars} chars — ${x.preview}`);
} else {
  console.log('conversations.json: (missing)');
}

console.log('');
if (fs.existsSync(hermesDb)) {
  console.log('hermes-memory.db:', fmtBytes(fs.statSync(hermesDb).size));
} else {
  console.log('hermes-memory.db: (missing)');
}

const userData = path.join(process.env.APPDATA ?? '', 'claw-flow');
if (fs.existsSync(userData)) {
  console.log('');
  console.log('Electron userData total:', fmtBytes(dirSize(userData)));
  for (const name of ['Code Cache', 'Service Worker', 'Cache', 'GPUCache']) {
    const p = path.join(userData, name);
    if (fs.existsSync(p)) console.log(`  ${name}:`, fmtBytes(dirSize(p)));
  }
}
