/** 系统子 Agent 单次运行请求/结果。 */

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
