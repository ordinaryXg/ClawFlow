/**
 * Reorganize src/engine/ into categorized subfolders and update import paths.
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const engineRoot = path.join(repoRoot, 'src/engine');

const MOVES = [
  ['clawflow-engine.ts', 'core/clawflow-engine.ts'],
  ['active-workspace-root.ts', 'core/active-workspace-root.ts'],
  ['engine-ipc.ts', 'core/engine-ipc.ts'],
  ['provider-router.ts', 'core/provider-router.ts'],
  ['next-request-context.ts', 'core/next-request-context.ts'],
  ['role-agent-context.ts', 'core/role-agent-context.ts'],
  ['gateway-daemon.ts', 'gateway/gateway-daemon.ts'],
  ['session-store.ts', 'session/session-store.ts'],
  ['session-store.cache.test.ts', 'session/session-store.cache.test.ts'],
  ['auth-store.ts', 'session/auth-store.ts'],
  ['hermes-memory-db.ts', 'hermes/hermes-memory-db.ts'],
  ['hermes-memory-db.test.ts', 'hermes/hermes-memory-db.test.ts'],
  ['hermes-memory-store.ts', 'hermes/hermes-memory-store.ts'],
  ['hermes-memory-service.ts', 'hermes/hermes-memory-service.ts'],
  ['hermes-memory-embeddings.ts', 'hermes/hermes-memory-embeddings.ts'],
  ['hermes-memory-index-hooks.ts', 'hermes/hermes-memory-index-hooks.ts'],
  ['hermes-skill-index-hooks.test.ts', 'hermes/hermes-skill-index-hooks.test.ts'],
  ['memory-diagnostics.ts', 'hermes/memory-diagnostics.ts'],
  ['memory-diagnostics.test.ts', 'hermes/memory-diagnostics.test.ts'],
  ['mode-policy.ts', 'mode/mode-policy.ts'],
  ['mode-policy.test.ts', 'mode/mode-policy.test.ts'],
  ['mode-defaults.ts', 'mode/mode-defaults.ts'],
  ['mode-defaults.test.ts', 'mode/mode-defaults.test.ts'],
  ['conversation-mode-classifier.ts', 'mode/conversation-mode-classifier.ts'],
  ['conversation-mode-classifier.test.ts', 'mode/conversation-mode-classifier.test.ts'],
  ['conversation-mode-classifier-parsers.test.ts', 'mode/conversation-mode-classifier-parsers.test.ts'],
  ['chat-model-catalog.ts', 'mode/chat-model-catalog.ts'],
  ['chat-model-catalog.test.ts', 'mode/chat-model-catalog.test.ts'],
  ['tool-runtime.ts', 'tool-runtime/index.ts'],
  ['tool-runtime-core.ts', 'tool-runtime/tool-runtime-core.ts'],
  ['apply-patch.ts', 'tool-runtime/apply-patch.ts'],
  ['workspace-shell-exec.ts', 'tool-runtime/workspace-shell-exec.ts'],
  ['workspace-shell-exec.test.ts', 'tool-runtime/workspace-shell-exec.test.ts'],
  ['skills-guard.ts', 'tool-runtime/skills-guard.ts'],
  ['skills-guard.test.ts', 'tool-runtime/skills-guard.test.ts'],
  ['workspace-skill-paths.ts', 'tool-runtime/workspace-skill-paths.ts'],
  ['workspace-skill-paths.test.ts', 'tool-runtime/workspace-skill-paths.test.ts'],
  ['dedupe-tool-messages.ts', 'tool-runtime/dedupe-tool-messages.ts'],
  ['repair-tool-call-message-chain.ts', 'tool-runtime/repair-tool-call-message-chain.ts'],
  ['repair-tool-call-message-chain.test.ts', 'tool-runtime/repair-tool-call-message-chain.test.ts'],
  ['atomic-write.ts', 'tool-runtime/atomic-write.ts'],
  ['web-search.ts', 'search/web-search.ts'],
  ['persist-notify-coalescer.ts', 'util/persist-notify-coalescer.ts'],
  ['persist-notify-coalescer.test.ts', 'util/persist-notify-coalescer.test.ts'],
];

/** Longest-first: old path segment after `engine/` */
const IMPORT_REPLACEMENTS = [
  ['engine/tool-runtime-default-tools', 'engine/tool-runtime/default-tools'],
  ['engine/tool-runtime-core', 'engine/tool-runtime/tool-runtime-core'],
  ['engine/conversation-mode-classifier-parsers.test', 'engine/mode/conversation-mode-classifier-parsers.test'],
  ['engine/conversation-mode-classifier.test', 'engine/mode/conversation-mode-classifier.test'],
  ['engine/conversation-mode-classifier', 'engine/mode/conversation-mode-classifier'],
  ['engine/repair-tool-call-message-chain.test', 'engine/tool-runtime/repair-tool-call-message-chain.test'],
  ['engine/repair-tool-call-message-chain', 'engine/tool-runtime/repair-tool-call-message-chain'],
  ['engine/workspace-shell-exec.test', 'engine/tool-runtime/workspace-shell-exec.test'],
  ['engine/workspace-shell-exec', 'engine/tool-runtime/workspace-shell-exec'],
  ['engine/workspace-skill-paths.test', 'engine/tool-runtime/workspace-skill-paths.test'],
  ['engine/workspace-skill-paths', 'engine/tool-runtime/workspace-skill-paths'],
  ['engine/hermes-memory-index-hooks', 'engine/hermes/hermes-memory-index-hooks'],
  ['engine/hermes-memory-embeddings', 'engine/hermes/hermes-memory-embeddings'],
  ['engine/hermes-skill-index-hooks.test', 'engine/hermes/hermes-skill-index-hooks.test'],
  ['engine/hermes-memory-service', 'engine/hermes/hermes-memory-service'],
  ['engine/persist-notify-coalescer.test', 'engine/util/persist-notify-coalescer.test'],
  ['engine/persist-notify-coalescer', 'engine/util/persist-notify-coalescer'],
  ['engine/hermes-memory-store', 'engine/hermes/hermes-memory-store'],
  ['engine/dedupe-tool-messages', 'engine/tool-runtime/dedupe-tool-messages'],
  ['engine/session-store.cache.test', 'engine/session/session-store.cache.test'],
  ['engine/chat-model-catalog.test', 'engine/mode/chat-model-catalog.test'],
  ['engine/memory-diagnostics.test', 'engine/hermes/memory-diagnostics.test'],
  ['engine/hermes-memory-db.test', 'engine/hermes/hermes-memory-db.test'],
  ['engine/skills-guard.test', 'engine/tool-runtime/skills-guard.test'],
  ['engine/mode-defaults.test', 'engine/mode/mode-defaults.test'],
  ['engine/mode-policy.test', 'engine/mode/mode-policy.test'],
  ['engine/active-workspace-root', 'engine/core/active-workspace-root'],
  ['engine/hermes-memory-db', 'engine/hermes/hermes-memory-db'],
  ['engine/memory-diagnostics', 'engine/hermes/memory-diagnostics'],
  ['engine/chat-model-catalog', 'engine/mode/chat-model-catalog'],
  ['engine/clawflow-engine', 'engine/core/clawflow-engine'],
  ['engine/provider-router', 'engine/core/provider-router'],
  ['engine/next-request-context', 'engine/core/next-request-context'],
  ['engine/role-agent-context', 'engine/core/role-agent-context'],
  ['engine/gateway-daemon', 'engine/gateway/gateway-daemon'],
  ['engine/engine-ipc', 'engine/core/engine-ipc'],
  ['engine/session-store', 'engine/session/session-store'],
  ['engine/mode-defaults', 'engine/mode/mode-defaults'],
  ['engine/mode-policy', 'engine/mode/mode-policy'],
  ['engine/auth-store', 'engine/session/auth-store'],
  ['engine/skills-guard', 'engine/tool-runtime/skills-guard'],
  ['engine/apply-patch', 'engine/tool-runtime/apply-patch'],
  ['engine/atomic-write', 'engine/tool-runtime/atomic-write'],
  ['engine/web-search', 'engine/search/web-search'],
];

/** Relative import fixes inside moved engine modules (from './x' patterns) */
const RELATIVE_REPLACEMENTS = [
  ["from './dedupe-tool-messages'", "from '../tool-runtime/dedupe-tool-messages'"],
  ["from './session-store'", "from '../session/session-store'"],
  ["from './persist-notify-coalescer'", "from '../util/persist-notify-coalescer'"],
  ["from './memory-diagnostics'", "from '../hermes/memory-diagnostics'"],
  ["from './auth-store'", "from '../session/auth-store'"],
  ["from './mode-policy'", "from '../mode/mode-policy'"],
  ["from './chat-model-catalog'", "from '../mode/chat-model-catalog'"],
  ["from './mode-defaults'", "from '../mode/mode-defaults'"],
  ["from './repair-tool-call-message-chain'", "from '../tool-runtime/repair-tool-call-message-chain'"],
  ["from './web-search'", "from '../search/web-search'"],
  ["from './clawflow-engine'", "from './clawflow-engine'"],
  ["from './active-workspace-root'", "from './active-workspace-root'"],
  ["from './provider-router'", "from './provider-router'"],
  ["from './next-request-context'", "from './next-request-context'"],
  ["from './tool-runtime'", "from '../tool-runtime'"],
  ["from './tool-runtime-core'", "from './tool-runtime-core'"],
  ["from './providers/", "from '../providers/"],
  ["from '../tool-runtime-core'", "from '../tool-runtime-core'"],
  ["from '../web-search'", "from '../../search/web-search'"],
  ["from '../apply-patch'", "from '../apply-patch'"],
  ["from '../atomic-write'", "from '../atomic-write'"],
  ["from '../hermes-memory-db'", "from '../hermes/hermes-memory-db'"],
  ["from '../hermes-memory-store'", "from '../hermes/hermes-memory-store'"],
  ["from '../hermes-memory-index-hooks'", "from '../hermes/hermes-memory-index-hooks'"],
  ["from '../hermes-memory-service'", "from '../hermes/hermes-memory-service'"],
  ["from '../hermes-memory-embeddings'", "from '../hermes/hermes-memory-embeddings'"],
  ["from '../skills-guard'", "from '../skills-guard'"],
  ["from '../workspace-skill-paths'", "from '../workspace-skill-paths'"],
  ["from '../tool-runtime-core'", "from '../tool-runtime-core'"],
  ["from '../../main/", "from '../../../main/"],
  ["from '../../shared/", "from '../../../shared/"],
  ["from '../../utils/", "from '../../../utils/"],
  ["from '../main/", "from '../../main/"],
  ["from '../shared/", "from '../../shared/"],
  ["from '../utils/", "from '../../utils/"],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

function applyReplacements(content, replacements) {
  let out = content;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

// 1) Move tool-runtime-default-tools dir
const oldToolsDir = path.join(engineRoot, 'tool-runtime-default-tools');
const newToolsDir = path.join(engineRoot, 'tool-runtime', 'default-tools');
if (fs.existsSync(oldToolsDir)) {
  fs.mkdirSync(path.join(engineRoot, 'tool-runtime'), { recursive: true });
  fs.renameSync(oldToolsDir, newToolsDir);
  console.log('moved tool-runtime-default-tools -> tool-runtime/default-tools');
}

// 2) Move individual files
for (const [from, to] of MOVES) {
  const src = path.join(engineRoot, from);
  const dest = path.join(engineRoot, to);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', from);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  console.log('moved', from, '->', to);
}

// 3) Fix tool-runtime/index.ts internal paths
const trIndex = path.join(engineRoot, 'tool-runtime/index.ts');
if (fs.existsSync(trIndex)) {
  let content = fs.readFileSync(trIndex, 'utf8');
  content = content
    .replace("from './tool-runtime-core'", "from './tool-runtime-core'")
    .replace("from './tool-runtime-default-tools/index'", "from './default-tools/index'");
  fs.writeFileSync(trIndex, content, 'utf8');
}

// 4) Fix default-tools/index imports
const dtIndex = path.join(engineRoot, 'tool-runtime/default-tools/index.ts');
if (fs.existsSync(dtIndex)) {
  let content = fs.readFileSync(dtIndex, 'utf8');
  content = content.replace("from '../tool-runtime-core'", "from '../tool-runtime-core'");
  fs.writeFileSync(dtIndex, content, 'utf8');
}

// 5) Update all source files
const srcRoot = path.join(repoRoot, 'src');
const files = walk(srcRoot);
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  content = applyReplacements(content, IMPORT_REPLACEMENTS);
  if (file.includes(`${path.sep}engine${path.sep}`)) {
    content = applyReplacements(content, RELATIVE_REPLACEMENTS);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
}

console.log('engine reorganize complete');
