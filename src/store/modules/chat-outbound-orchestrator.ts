import { v4 as uuidv4 } from 'uuid';

/** 默认合并窗口（毫秒）；实际值见系统设置 → 对话引擎 */
export const DEFAULT_OUTBOUND_MERGE_WINDOW_MS = 3000;

export type SendMessageOpts = {
  userChannel?: string;
  scheduleFireReceipt?: { triggerId: string };
};

export type PendingSendItem = {
  id: string;
  content: string;
  modelId?: string | null;
  opts?: SendMessageOpts;
  enqueuedAt: number;
};

export type OutboundTurn = {
  conversationId: string;
  userTexts: string[];
  startedAt: number;
  abortController: AbortController;
  generation: number;
  modelId?: string | null;
  opts?: SendMessageOpts;
};

const activeTurnByConversation = new Map<string, OutboundTurn>();
const pendingSendByConversation = new Map<string, PendingSendItem[]>();

export function getMergedOutboundText(turn: OutboundTurn): string {
  return turn.userTexts
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function getPendingSends(conversationId: string): readonly PendingSendItem[] {
  return pendingSendByConversation.get(conversationId) ?? [];
}

export function removePendingSend(conversationId: string, id: string): void {
  const list = pendingSendByConversation.get(conversationId);
  if (!list?.length) return;
  const next = list.filter((x) => x.id !== id);
  if (next.length) pendingSendByConversation.set(conversationId, next);
  else pendingSendByConversation.delete(conversationId);
}

export function clearOutboundStateForConversation(conversationId: string): void {
  activeTurnByConversation.delete(conversationId);
  pendingSendByConversation.delete(conversationId);
}

export type RouteOutboundSendResult =
  | { action: 'start'; turn: OutboundTurn }
  | { action: 'merge'; turn: OutboundTurn }
  | { action: 'queue' };

export function routeOutboundSend(params: {
  conversationId: string;
  content: string;
  modelId?: string | null;
  opts?: SendMessageOpts;
  now?: number;
  mergeWindowMs?: number;
}): RouteOutboundSendResult {
  const now = params.now ?? Date.now();
  const content = String(params.content ?? '').trim();
  const { conversationId, modelId, opts } = params;
  const mergeWindowMs = Math.max(
    0,
    Math.floor(params.mergeWindowMs ?? DEFAULT_OUTBOUND_MERGE_WINDOW_MS)
  );

  const existing = activeTurnByConversation.get(conversationId);
  if (existing) {
    if (now - existing.startedAt <= mergeWindowMs) {
      existing.userTexts.push(content);
      existing.generation += 1;
      existing.abortController.abort();
      existing.abortController = new AbortController();
      if (modelId != null) existing.modelId = modelId;
      if (opts) existing.opts = opts;
      return { action: 'merge', turn: existing };
    }
    const list = pendingSendByConversation.get(conversationId) ?? [];
    list.push({
      id: uuidv4(),
      content,
      modelId,
      opts,
      enqueuedAt: now,
    });
    pendingSendByConversation.set(conversationId, list);
    return { action: 'queue' };
  }

  const turn: OutboundTurn = {
    conversationId,
    userTexts: [content],
    startedAt: now,
    abortController: new AbortController(),
    generation: 0,
    modelId,
    opts,
  };
  activeTurnByConversation.set(conversationId, turn);
  return { action: 'start', turn };
}

/** 当前 generation 的回合正常结束；返回是否由本回合收尾 */
export function finishOutboundTurn(conversationId: string, generation: number): boolean {
  const turn = activeTurnByConversation.get(conversationId);
  if (!turn || turn.generation !== generation) return false;
  activeTurnByConversation.delete(conversationId);
  return true;
}

export function takePendingSends(conversationId: string): PendingSendItem[] {
  const q = pendingSendByConversation.get(conversationId) ?? [];
  pendingSendByConversation.delete(conversationId);
  return q;
}

export function startOutboundTurnFromPending(conversationId: string, items: PendingSendItem[]): OutboundTurn {
  const last = items[items.length - 1];
  const turn: OutboundTurn = {
    conversationId,
    userTexts: items.map((i) => i.content),
    startedAt: Date.now(),
    abortController: new AbortController(),
    generation: 0,
    modelId: last?.modelId,
    opts: last?.opts,
  };
  activeTurnByConversation.set(conversationId, turn);
  return turn;
}

export function getActiveOutboundTurn(conversationId: string): OutboundTurn | undefined {
  return activeTurnByConversation.get(conversationId);
}
