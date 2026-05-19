/**
 * 主对话发送调试：在控制台输出即将交给模型的文本（渲染进程 DevTools / 主进程终端）。
 * 默认关闭。开启：渲染进程 `localStorage.setItem('clawflow.debugChatSend','1')` 或主进程环境变量 `CLAWFLOW_DEBUG_CHAT_SEND=1`。
 */

export const CHAT_SEND_DEBUG_TAG = '[ClawFlow:send]';
export const CHAT_SEND_DEBUG_STORAGE_KEY = 'clawflow.debugChatSend';

export function isChatSendDebugEnabled(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env?.CLAWFLOW_DEBUG_CHAT_SEND === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(CHAT_SEND_DEBUG_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function preview(text: string, max = 1200): string {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…（共 ${s.length} 字符，已截断）`;
}

export function logChatSendRenderer(payload: {
  conversationId: string;
  bubbleContent: string;
  textForMain: string;
  mode: string;
  modelId?: string | null;
  workspaceRoot?: string;
  classification?: { category: string; categoryLabel: string; mode: string; summary: string };
  expectationPlanningRan?: boolean;
}): void {
  if (!isChatSendDebugEnabled()) return;
  const tag = CHAT_SEND_DEBUG_TAG;
  const same = payload.bubbleContent === payload.textForMain;
  console.groupCollapsed(`${tag} 渲染进程 → Gateway/Engine`);
  console.log('conversationId', payload.conversationId);
  if (payload.workspaceRoot) console.log('workspaceRoot', payload.workspaceRoot);
  console.log('mode / modelId', payload.mode, payload.modelId ?? '(default)');
  if (payload.classification) {
    console.log('认知分配', payload.classification);
  }
  if (payload.expectationPlanningRan) {
    console.log('预期规划', '已执行（textForMain 可能含规划前缀）');
  }
  console.log('气泡 content（持久化）', preview(payload.bubbleContent));
  console.log('textForMain（发给引擎）', preview(payload.textForMain));
  if (!same) {
    console.warn(`${tag} 气泡与 textForMain 不一致：模型侧 user 文本含额外前缀或合并内容`);
  }
  console.groupEnd();
}

type SendMessageLike = {
  role: string;
  content?: string;
  reasoning_content?: string;
  tool_call_id?: string;
};

export function logChatSendComposedMessages(
  messages: readonly SendMessageLike[],
  meta: {
    conversationId: string;
    userText: string;
    mode: string;
    modelId: string;
    workspaceRoot: string;
    toolsEnabled?: boolean;
  }
): void {
  if (!isChatSendDebugEnabled()) return;
  const tag = CHAT_SEND_DEBUG_TAG;
  console.groupCollapsed(`${tag} 主进程 sendMessage → Provider`);
  console.log('meta', meta);
  const system = messages[0]?.role === 'system' ? String(messages[0].content ?? '') : '';
  if (system) {
    console.log(`system（${system.length} 字符）`, preview(system, 2000));
  }
  const tail = messages[0]?.role === 'system' ? messages.slice(1) : [...messages];
  console.log(`tail 消息数: ${tail.length}`);
  tail.forEach((m, i) => {
    const role = m.role;
    const content = String(m.content ?? '');
    const extra =
      role === 'tool'
        ? ` tool_call_id=${String((m as { tool_call_id?: string }).tool_call_id ?? '')}`
        : role === 'assistant' && (m as { tool_calls?: unknown }).tool_calls
          ? ' (含 tool_calls)'
          : '';
    console.log(
      `[${i}] ${role}${extra} len=${content.length}`,
      preview(content, role === 'user' ? 2000 : 600)
    );
    const rc = typeof m.reasoning_content === 'string' ? m.reasoning_content.trim() : '';
    if (rc) console.log(`    reasoning_content len=${rc.length}`, preview(rc, 400));
  });
  console.log('完整 messages[]（可展开）', messages);
  console.groupEnd();
}
