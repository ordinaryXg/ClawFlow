/**
 * 子 Agent 运行请求类型（系统级 Agent 与历史 IPC 共用）。
 * 工作区委派子 Agent（`.subagent/`）已移除；请使用 `runSystemSubAgentOnce`。
 */

import type { ToolApprovalNeededPayload } from '../../engine/clawflow-engine';

export type SubAgentRunRequest = {
  workspaceRoot: string;
  slotId: string;
  taskText: string;
  conversationId: string;
  modelId?: string;
  oneOff?: boolean;
  onToolApprovalNeeded?: (p: ToolApprovalNeededPayload & { runId: string; slotId: string }) => void | Promise<void>;
  onDelta?: (p: { runId: string; slotId: string; text: string }) => void;
};

export type SubAgentRunResult =
  | { ok: true; runId: string; message: string }
  | { ok: false; runId: string; error: string };

export { runSystemSubAgentOnce as runSubAgentOnce } from '../system-agents/system-sub-agent-runner';
