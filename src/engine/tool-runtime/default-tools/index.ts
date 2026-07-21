import { ToolRuntime } from '../tool-runtime-core';
import { registerMiscTools } from './register-misc-tools';
import { registerWorkspaceDocsTools } from './register-workspace-docs-tools';
import { registerWorkspaceShellGitTools } from './register-workspace-shell-git-tools';
import { registerSchedulingTools } from './register-scheduling-tools';
import { registerHermesMemoryTools } from './register-hermes-memory-tools';
import { registerWorkspaceSkillsTools } from './register-workspace-skills-tools';
import { registerFeishuTools } from './register-feishu-tools';

/** 注册的 `function.name` 须与 `shared/workspace-tool-manifest-bridge.ts` 中映射同步。 */
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
