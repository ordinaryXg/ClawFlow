#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/download-lark-cli.mjs           # current host platform/arch
 *   node scripts/download-lark-cli.mjs --all     # all release targets (CI / cross-pack)
 */

import {
  ALL_TARGETS,
  defaultHostPlatformArch,
  fetchOne,
  LARK_CLI_VERSION,
} from './lark-cli-download-lib.mjs';

const args = process.argv.slice(2);
const fetchAll = args.includes('--all');

async function main() {
  const targets = fetchAll ? ALL_TARGETS : [defaultHostPlatformArch()];
  console.log(`[lark-cli:fetch] version v${LARK_CLI_VERSION}, targets=${targets.length}`);
  for (const t of targets) {
    await fetchOne(t.platformKey, t.archKey);
  }
}

main().catch((e) => {
  console.error('[lark-cli:fetch] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
