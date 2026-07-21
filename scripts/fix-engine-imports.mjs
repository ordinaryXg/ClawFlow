/**
 * Fix relative imports after engine/ subdirectory move (+1 depth).
 */
import fs from 'node:fs';
import path from 'node:path';

const engineRoot = path.resolve('src/engine');

function walk(dir, base = dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, base, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push({ file: p, rel: path.relative(base, p) });
  }
  return acc;
}

function depthFromEngine(relPath) {
  return relPath.split(/[/\\]/).length - 1;
}

const files = walk(engineRoot);
for (const { file, rel } of files) {
  const depth = depthFromEngine(rel);
  if (depth === 0) continue;

  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  // Fix sibling engine module imports that stayed at old relative paths
  const siblingFixes = [
    ["from './hermes-memory-store'", "from '../hermes/hermes-memory-store'"],
    ["from './hermes-memory-db'", "from '../hermes/hermes-memory-db'"],
    ["from './hermes-memory-service'", "from '../hermes/hermes-memory-service'"],
    ["from './hermes-memory-index-hooks'", "from '../hermes/hermes-memory-index-hooks'"],
    ["from './hermes-memory-embeddings'", "from '../hermes/hermes-memory-embeddings'"],
    ["from './session-store'", "from '../session/session-store'"],
    ["from './auth-store'", "from '../session/auth-store'"],
    ["from './clawflow-engine'", "from '../core/clawflow-engine'"],
    ["from './active-workspace-root'", "from '../core/active-workspace-root'"],
    ["from './provider-router'", "from '../core/provider-router'"],
    ["from './gateway-daemon'", "from '../gateway/gateway-daemon'"],
    ["from './mode-policy'", "from '../mode/mode-policy'"],
    ["from './mode-defaults'", "from '../mode/mode-defaults'"],
    ["from './web-search'", "from '../search/web-search'"],
    ["from './persist-notify-coalescer'", "from '../util/persist-notify-coalescer'"],
    ["from './memory-diagnostics'", "from '../hermes/memory-diagnostics'"],
    ["from './dedupe-tool-messages'", "from '../tool-runtime/dedupe-tool-messages'"],
    ["from './repair-tool-call-message-chain'", "from '../tool-runtime/repair-tool-call-message-chain'"],
    ["from './tool-runtime-core'", "from '../tool-runtime/tool-runtime-core'"],
    ["from './apply-patch'", "from '../tool-runtime/apply-patch'"],
    ["from './atomic-write'", "from '../tool-runtime/atomic-write'"],
    ["from './skills-guard'", "from '../tool-runtime/skills-guard'"],
    ["from './workspace-skill-paths'", "from '../tool-runtime/workspace-skill-paths'"],
    ["from './workspace-shell-exec'", "from '../tool-runtime/workspace-shell-exec'"],
    ["from './chat-model-catalog'", "from '../mode/chat-model-catalog'"],
    ["from './conversation-mode-classifier'", "from '../mode/conversation-mode-classifier'"],
    ["from './next-request-context'", "from '../core/next-request-context'"],
    ["from './role-agent-context'", "from '../core/role-agent-context'"],
  ];

  for (const [from, to] of siblingFixes) {
    content = content.split(from).join(to);
  }

  // Prefix src-level imports: engine/<subdir>/file needs depth+1 to reach src/
  const srcUp = '../'.repeat(depth + 1);
  const staleUp = '../'.repeat(depth);
  const srcPrefixes = ['main/', 'shared/', 'utils/', 'messaging/'];
  for (const prefix of srcPrefixes) {
    content = content.split(`from '${staleUp}${prefix}`).join(`from '${srcUp}${prefix}`);
  }

  // providers/ streaming/ stay under engine/ — one level up from subfolder
  if (depth >= 1) {
    content = content.replace(/from '\.\/providers\//g, "from '../providers/");
    content = content.replace(/from '\.\/streaming\//g, "from '../streaming/");
  }

  if (content !== original) fs.writeFileSync(file, content, 'utf8');
}

console.log('fixed engine relative imports');
