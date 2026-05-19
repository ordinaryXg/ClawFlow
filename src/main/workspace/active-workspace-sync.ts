/**
 * 活动工作区根：注册表、主进程单例与 ClawFlow 引擎 SessionStore 对齐。
 */
import * as path from 'path';
import { setActiveWorkspaceRoot } from '../../engine/active-workspace-root';
import { syncClawFlowEngineWorkspaceRoot } from '../../engine/clawflow-engine';
import * as workspaceService from './workspace-service';

/** 仅更新内存根并同步引擎（注册表已由其它 API 写入时）。 */
export function syncActiveWorkspaceRootToEngine(workspacePath: string): void {
  const resolved = path.resolve(String(workspacePath || ''));
  setActiveWorkspaceRoot(resolved);
  syncClawFlowEngineWorkspaceRoot(resolved);
}

/** 写注册表 + 内存根 + 引擎 SessionStore。 */
export function applyActiveWorkspace(workspacePath: string): void {
  const resolved = path.resolve(String(workspacePath || ''));
  workspaceService.setActiveWorkspace(resolved);
  syncActiveWorkspaceRootToEngine(resolved);
}

export function clearActiveWorkspaceRootInMemory(): void {
  setActiveWorkspaceRoot('');
}
