import type { ConversationModeClassification } from '../../../engine/mode/conversation-mode-classifier';
import type { StreamToolHint } from '../../../utils/stream-activity-sanitize';

export type { ConversationModeClassification };

export type PendingSendDisplayItem = {
  id: string;
  content: string;
  enqueuedAt: number;
};

export type ToolApprovalPendingState = {
  requestId: string;
  conversationId: string;
  approvalId: string;
  tools: Array<{ name: string; argumentsPreview: string }>;
  riskLevel: 'medium' | 'high';
  timeoutMs: number;
  defaultApproved: boolean;
  startedAt: number;
};

/** 对话气泡来源渠道：用于区分样式；未填写时按 role 推导默认外观 */
export type MessageChannel =
  | 'user_manual'
  | 'user_feishu'
  | 'user_scheduling_auto'
  | 'user_tool_delegate'
  | 'user_workflow'
  | 'user_system'
  | 'assistant_llm'
  | 'assistant_tool_summary'
  | 'assistant_evolution';

const MESSAGE_CHANNELS: readonly MessageChannel[] = [
  'user_manual',
  'user_feishu',
  'user_scheduling_auto',
  'user_tool_delegate',
  'user_workflow',
  'user_system',
  'assistant_llm',
  'assistant_tool_summary',
  'assistant_evolution',
];

function coerceMessageChannel(_role: Message['role'], raw: unknown): MessageChannel | undefined {
  if (typeof raw !== 'string') return undefined;
  if ((MESSAGE_CHANNELS as readonly string[]).includes(raw)) return raw as MessageChannel;
  return undefined;
}

/** UI：缺省渠道与手写消息、模型回复对齐 */
export function resolveMessagePresentationChannel(message: Message): MessageChannel {
  return message.channel ?? (message.role === 'user' ? 'user_manual' : 'assistant_llm');
}

export function shouldShowMessageChannelStrip(message: Message): boolean {
  const ch = resolveMessagePresentationChannel(message);
  if (ch === 'assistant_evolution') return false;
  return ch !== 'user_manual' && ch !== 'assistant_llm';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  /** 模型思考过程（DeepSeek reasoning 等），与正文分开展示 */
  reasoningContent?: string;
  /** 消息渠道（样式与角标）；缺省时 UI 视作 user_manual / assistant_llm */
  channel?: MessageChannel;
  /** tool 消息：与 tool_calls 对齐的 id（用于聚合/追溯） */
  toolCallId?: string;
  /** 原样透传 stored meta（用于工具卡片渲染） */
  meta?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  /** 流式：工具进度等非思考文本 */
  streamingActivity: string | null;
  /** 流式：进行中的工具名（用于占位，避免展示 raw JSON） */
  streamingToolHints: StreamToolHint[];
  /** 流式：思考过程（已由 demux 剥离标记） */
  streamingThinking: string | null;
  error: string | null;
  /** 最近一次发送前的模式分类（测试展示，不落消息列表） */
  activeModeClassification: ConversationModeClassification | null;
  isClassifyingMode: boolean;
  /** M3/M4 预期规划进行中 */
  isExpectationPlanning: boolean;
  /** 规划流式原始输出（编排中） */
  expectationPlanStream: string | null;
  /** 规划完成后的展示文本（Markdown 风格纯文本） */
  activeExpectationPlanDisplay: string | null;
  /** 本轮触发预期规划的用户消息 id（面板插在该条消息之后） */
  expectationPlanAnchorMessageId: string | null;
  /** 模型回复中挂起、待自动发送的用户消息（当前会话） */
  pendingSendQueue: PendingSendDisplayItem[];
  /** Gateway 工具执行前待用户确认（仅当前连接会话） */
  toolApprovalPending: ToolApprovalPendingState | null;
  /** 最近一次 fetchConversations 对应的工作区路径（用于禁止跨工作区合并本地 messages） */
  conversationFetchWorkspaceKey: string | null;

  // Actions
  fetchConversations: (opts?: { immediate?: boolean }) => Promise<void>;
  /** 进化卡片增量更新（不全量 fetch） */
  applyEvolutionChatUpdate: (payload: {
    conversationId: string;
    kind: 'append' | 'patch';
    message: Message;
  }) => void;
  sendMessage: (
    content: string,
    modelId?: string | null,
    opts?: { userChannel?: MessageChannel; scheduleFireReceipt?: { triggerId: string } }
  ) => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  removePendingSend: (id: string) => void;
  respondToolApproval: (approved: boolean) => void;
  /** 周期调度：向当前会话写入用户消息，可选走与手动发送相同的模型请求 */
  applyScheduleTrigger: (payload: {
    workspaceRoot: string;
    text: string;
    submitToModel: boolean;
    triggerId?: string;
  }) => Promise<void>;
}

/** @internal for normalizeConversation */
export { coerceMessageChannel };
