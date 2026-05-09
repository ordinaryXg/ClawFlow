import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import * as path from 'path';
import EventEmitter from 'events';
import { getDefaultWorkspacePath } from '../workspace-service';
import { SessionStore, StoredConversation, StoredMessage } from './session-store';
import { ProviderRouter } from './provider-router';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import type { ModelProvider } from './providers/provider';
import type { ChatCompletionRequest, ChatMessage, ModeConfig } from './providers/types';
import { getAuthToken, listAuthProfiles } from './auth-store';
import { createDefaultToolRuntime } from './tool-runtime';

/** Chat 下拉：内置引擎可用模型 ID（`/ 前即为 provider router id） */
const BUILTIN_CHAT_MODEL_CATALOG: Record<string, readonly string[]> = {
  deepseek: ['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner'],
  openai: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
  anthropic: ['anthropic/claude-3-5-sonnet-20241022', 'anthropic/claude-3-5-haiku-20241022'],
};

export type InteractionMode = 'ask' | 'plan' | 'multitask';

export interface ClawFlowEngineConfig {
  workspaceRoot?: string;
  verbose?: boolean;
}

export interface ClawFlowEngineEvents {
  'engine:ready': [];
  'engine:error': [error: Error];
  'engine:message': [conversationId: string, message: StoredMessage];
}

export interface ClawFlowEngine {
  getConfig(): Readonly<Required<ClawFlowEngineConfig> & { workspaceRoot: string }>;
  setWorkspaceRoot(workspaceRoot: string): void;

  listConversations(): Promise<StoredConversation[]>;
  upsertConversation(conversation: StoredConversation): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;

  sendMessage(params: {
    conversationId: string;
    userText: string;
    mode?: InteractionMode;
    modelId?: string;
    onDelta?: (delta: string) => void;
  }): Promise<{ message: string }>;

  /**
   * Ask / Plan 单轮流式（SSE → onDelta）；Multitask（工具循环）请用 sendMessage。
   */
  sendMessageTextStream(params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode: 'ask' | 'plan';
    onDelta: (delta: string) => void;
  }): Promise<string>;

  listChatModelCatalog(): Promise<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  }>;
}

class ClawFlowEngineImpl extends EventEmitter implements ClawFlowEngine {
  private config: Required<ClawFlowEngineConfig> & { workspaceRoot: string };
  private store: SessionStore;
  private router: ProviderRouter;
  private tools = createDefaultToolRuntime();

  constructor(cfg: ClawFlowEngineConfig = {}) {
    super();
    const workspaceRoot = path.resolve(cfg.workspaceRoot ?? getDefaultWorkspacePath());
    this.config = {
      workspaceRoot,
      verbose: cfg.verbose ?? true,
    };
    this.store = new SessionStore(workspaceRoot);
    this.router = new ProviderRouter();
    // Provider instances are registered here; auth is resolved per-request.
    // Phase 1: DeepSeek is fully implemented. Others are stubs.
    // Always register DeepSeek; key may come only from auth-store later.
    this.router.register(
      new DeepSeekProvider({
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        resolveApiKey: async () => (await getAuthToken('deepseek')) || process.env.DEEPSEEK_API_KEY || '',
      })
    );
    this.router.register(
      new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY || '',
        resolveApiKey: async () => (await getAuthToken('openai')) || process.env.OPENAI_API_KEY || '',
      })
    );
    this.router.register(
      new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        resolveApiKey: async () =>
          (await getAuthToken('anthropic')) || process.env.ANTHROPIC_API_KEY || '',
      })
    );
    if (this.config.verbose) console.log('[ClawFlowEngine] init', this.config);
  }

  getConfig() {
    return { ...this.config };
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    const next = path.resolve(workspaceRoot);
    if (next === this.config.workspaceRoot) return;
    this.config.workspaceRoot = next;
    this.store = new SessionStore(next);
    if (this.config.verbose) console.log('[ClawFlowEngine] workspaceRoot=', next);
  }

  async listConversations(): Promise<StoredConversation[]> {
    return await this.store.readAll();
  }

  async upsertConversation(conversation: StoredConversation): Promise<void> {
    await this.store.upsertConversation(conversation);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.store.deleteConversation(conversationId);
  }

  private async buildHistoryMessages(conversationId: string, userText: string): Promise<ChatMessage[]> {
    const convsBefore = await this.store.readAll();
    const conv = convsBefore.find((c) => c.id === conversationId) ?? null;
    const history: ChatMessage[] = (conv?.messages ?? [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool'))
      .map((m) => ({
        role: m.role as ChatMessage['role'],
        content: String(m.content ?? ''),
        ...(typeof m.reasoning_content === 'string' ? { reasoning_content: m.reasoning_content } : {}),
        ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls as ChatMessage['tool_calls'] } : {}),
        ...(typeof m.tool_call_id === 'string' ? { tool_call_id: m.tool_call_id } : {}),
      }));

    const last = history[history.length - 1];
    const ut = String(userText ?? '');
    const alreadyHasUserTurn = last?.role === 'user' && String(last.content ?? '') === ut;
    if (!alreadyHasUserTurn) {
      history.push({ role: 'user', content: ut });
    }
    return history;
  }

  private async appendAssistantMessage(params: {
    conversationId: string;
    reply: string;
    mode: InteractionMode;
    modelIdHint: string | null;
    engine: 'clawflow' | 'clawflow-stub';
  }): Promise<void> {
    const convs = await this.store.readAll();
    const idx = convs.findIndex((c) => c.id === params.conversationId);
    const now = Date.now();
    const assistantMsg: StoredMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: params.reply,
      timestamp: now,
      meta: { engine: params.engine, mode: params.mode, modelId: params.modelIdHint },
    };
    if (idx >= 0) {
      const c = convs[idx];
      const next: StoredConversation = {
        ...c,
        messages: [...(c.messages ?? []), assistantMsg],
        updatedAt: now,
      };
      convs[idx] = next;
      await this.store.writeAll(convs);
    }
    this.emit('engine:message', params.conversationId, assistantMsg);
  }

  private async appendMessages(conversationId: string, msgs: StoredMessage[]): Promise<void> {
    if (!msgs.length) return;
    const convs = await this.store.readAll();
    const idx = convs.findIndex((c) => c.id === conversationId);
    const now = Date.now();
    if (idx >= 0) {
      const c = convs[idx];
      const next: StoredConversation = {
        ...c,
        messages: [...(c.messages ?? []), ...msgs],
        updatedAt: now,
      };
      convs[idx] = next;
      await this.store.writeAll(convs);
    }
    for (const m of msgs) {
      this.emit('engine:message', conversationId, m);
    }
  }

  private toStoredAssistantMessage(params: {
    content: string;
    mode: InteractionMode;
    modelIdHint: string | null;
    engine: 'clawflow' | 'clawflow-stub';
    reasoning_content?: string;
    tool_calls?: StoredMessage['tool_calls'];
  }): StoredMessage {
    const now = Date.now();
    return {
      id: randomUUID(),
      role: 'assistant',
      content: String(params.content ?? ''),
      timestamp: now,
      ...(typeof params.reasoning_content === 'string' && params.reasoning_content
        ? { reasoning_content: params.reasoning_content }
        : {}),
      ...(Array.isArray(params.tool_calls) && params.tool_calls.length ? { tool_calls: params.tool_calls } : {}),
      meta: { engine: params.engine, mode: params.mode, modelId: params.modelIdHint },
    };
  }

  private toStoredToolMessage(params: { tool_call_id: string; content: string }): StoredMessage {
    const now = Date.now();
    return {
      id: randomUUID(),
      role: 'tool',
      content: String(params.content ?? ''),
      timestamp: now,
      tool_call_id: String(params.tool_call_id ?? ''),
    };
  }

  /** 内置 Chat UI：下拉模型列表（不依赖 OpenClaw CLI） */
  async listChatModelCatalog(): Promise<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  }> {
    const profiles = await listAuthProfiles();
    const labelByProvider = new Map<string, string>();
    for (const p of profiles) {
      const prov = String(p.provider ?? '').trim();
      if (!prov || labelByProvider.has(prov)) continue;
      const lbl = typeof p.label === 'string' ? p.label.trim() : '';
      if (lbl) labelByProvider.set(prov, lbl);
    }

    const models: Array<{ id: string; label: string; available: boolean }> = [];
    const registered = this.router.listRegisteredIds();

    for (const providerId of registered) {
      const mids = BUILTIN_CHAT_MODEL_CATALOG[providerId];
      if (!mids?.length) continue;

      let hasKey = false;
      if (providerId === 'deepseek') {
        hasKey = Boolean((await getAuthToken('deepseek')) || process.env.DEEPSEEK_API_KEY);
      } else if (providerId === 'openai') {
        hasKey = Boolean((await getAuthToken('openai')) || process.env.OPENAI_API_KEY);
      } else if (providerId === 'anthropic') {
        hasKey = Boolean((await getAuthToken('anthropic')) || process.env.ANTHROPIC_API_KEY);
      }

      const extra = labelByProvider.get(providerId);
      for (const id of mids) {
        models.push({
          id,
          label: extra ? `${id} · ${extra}` : id,
          available: hasKey,
        });
      }
    }

    const firstAvail = models.find((m) => m.available) ?? null;
    const preferred =
      models.find((m) => m.available && m.id === 'deepseek/deepseek-chat') ??
      firstAvail ??
      models[0] ??
      null;

    return {
      defaultModelId: preferred?.id ?? null,
      models,
    };
  }

  async sendMessage(params: {
    conversationId: string;
    userText: string;
    mode?: InteractionMode;
    modelId?: string;
    onDelta?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<{ message: string }> {
    // Phase 0/1 bridge:
    // - If a model provider is available and configured, use it
    // - Otherwise return a deterministic stub
    const mode = params.mode ?? 'ask';
    const modelId = params.modelId ?? 'deepseek/deepseek-chat';

    const providerId = this.router.resolveProviderIdFromModelId(modelId);
    const provider = providerId ? this.router.get(providerId) : null;

    let reply = '';
    if (provider && providerId) {
      const loopMessages: ChatMessage[] = await this.buildHistoryMessages(
        params.conversationId,
        params.userText
      );

      const baseModeConfig: ModeConfig = {
        mode,
        ...(mode === 'ask'
          ? { thinking: { type: 'disabled' } }
          : { thinking: { type: 'enabled' }, reasoning_effort: 'max' }),
        ...(mode === 'multitask' ? { tools: this.tools.listSchemas(), useBetaBaseUrl: true } : {}),
      };
      for (let step = 0; step < 6; step++) {
        if (params.abortSignal?.aborted) throw new Error('CANCELLED');
        const req: ChatCompletionRequest = {
          model: modelId,
          messages: loopMessages,
          modeConfig: baseModeConfig,
        };
        const res = await provider.chatCompletion(req, { signal: params.abortSignal });

        const toolCalls = res.tool_calls ?? null;
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: res.content ?? '',
          ...(res.reasoning_content ? { reasoning_content: res.reasoning_content } : {}),
          ...(toolCalls ? { tool_calls: toolCalls as any } : {}),
        };
        loopMessages.push(assistantMsg);

        if (!toolCalls || toolCalls.length === 0) {
          reply = res.content || '';
          break;
        }

        // Persist this assistant turn (tool_calls + reasoning) so replay/history stays complete.
        try {
          const storedAssistant = this.toStoredAssistantMessage({
            content: res.content ?? '',
            reasoning_content: typeof res.reasoning_content === 'string' ? res.reasoning_content : undefined,
            tool_calls: toolCalls as any,
            mode,
            modelIdHint: modelId,
            engine: 'clawflow',
          });
          await this.appendMessages(params.conversationId, [storedAssistant]);
        } catch (e: any) {
          console.warn('[ClawFlowEngine] persist assistant(tool_calls) failed:', e?.message ?? e);
        }

        const toolResults = await this.tools.executeToolCalls(toolCalls as any, {
          workspaceRoot: this.config.workspaceRoot,
          config: this.config,
          onDelta: params.onDelta,
          abortSignal: params.abortSignal,
        });
        const toolMsgs: ChatMessage[] = [];
        const storedTools: StoredMessage[] = [];
        for (const tr of toolResults) {
          toolMsgs.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
          storedTools.push(this.toStoredToolMessage({ tool_call_id: tr.tool_call_id, content: tr.content }));
        }
        for (const tm of toolMsgs) loopMessages.push(tm);

        // Persist tool results as discrete messages.
        try {
          await this.appendMessages(params.conversationId, storedTools);
        } catch (e: any) {
          console.warn('[ClawFlowEngine] persist tool results failed:', e?.message ?? e);
        }
      }
    }

    if (!reply) {
      reply = `【ClawFlowEngine:stub】mode=${mode} model=${modelId}\n\n你说：${params.userText}`;
    }

    // Persist final assistant reply as its own message.
    // (Tool-calls + tool results are persisted per-step above for multitask.)
    await this.appendAssistantMessage({
      conversationId: params.conversationId,
      reply,
      mode,
      modelIdHint: modelId,
      engine: reply.startsWith('【ClawFlowEngine:stub】') ? 'clawflow-stub' : 'clawflow',
    });
    return { message: reply };
  }

  async sendMessageTextStream(params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode: 'ask' | 'plan';
    onDelta: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const emitChunked = async (text: string) => {
      const full = String(text ?? '');
      if (!full) return;
      // Make streaming visible even for stub / non-stream responses.
      // Keep chunks small enough to feel progressive but not too slow.
      const chunkSize = 28;
      for (let i = 0; i < full.length; i += chunkSize) {
        params.onDelta(full.slice(i, i + chunkSize));
        // Yield to the event loop so renderer can paint.
        await new Promise((r) => setTimeout(r, 15));
      }
    };

    const modelId = params.modelId ?? 'deepseek/deepseek-chat';
    const providerId = this.router.resolveProviderIdFromModelId(modelId);
    const provider = providerId ? this.router.get(providerId) : null;
    const streamMode = params.mode;
    const mode: InteractionMode = streamMode;
    const baseModeConfig: ModeConfig = {
      mode,
      ...(streamMode === 'ask'
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, reasoning_effort: 'max' }),
    };

    if (!provider || !providerId) {
      const reply = `【ClawFlowEngine:stub】mode=${streamMode} model=${modelId}\n\n你说：${params.userText}`;
      await emitChunked(reply);
      await this.appendAssistantMessage({
        conversationId: params.conversationId,
        reply,
        mode,
        modelIdHint: modelId,
        engine: 'clawflow-stub',
      });
      return reply;
    }

    const loopMessages = await this.buildHistoryMessages(params.conversationId, params.userText);
    const req: ChatCompletionRequest = {
      model: modelId,
      messages: loopMessages,
      modeConfig: baseModeConfig,
    };

    const p = provider as ModelProvider;
    let reply = '';
    if (typeof p.streamChatCompletion === 'function') {
      const res = await p.streamChatCompletion(req, params.onDelta, { signal: params.abortSignal });
      reply = res.content || '';
    } else {
      const res = await provider.chatCompletion(req, { signal: params.abortSignal });
      reply = res.content || '';
      if (reply) await emitChunked(reply);
    }

    if (!reply.trim()) {
      reply = `【ClawFlowEngine:stub】mode=${streamMode} model=${modelId}\n\n你说：${params.userText}`;
      await emitChunked(reply);
    }

    await this.appendAssistantMessage({
      conversationId: params.conversationId,
      reply,
      mode,
      modelIdHint: modelId,
      engine: reply.startsWith('【ClawFlowEngine:stub】') ? 'clawflow-stub' : 'clawflow',
    });
    return reply;
  }
}

let globalEngine: ClawFlowEngineImpl | null = null;

export function getGlobalClawFlowEngine(): ClawFlowEngineImpl {
  if (!globalEngine) globalEngine = new ClawFlowEngineImpl();
  return globalEngine;
}

/** Called when Electron active workspace switches so SessionStore stays aligned */
export function syncClawFlowEngineWorkspaceRoot(workspaceRoot: string): void {
  try {
    getGlobalClawFlowEngine().setWorkspaceRoot(workspaceRoot);
  } catch (e: any) {
    console.warn('[ClawFlowEngine] sync workspace root failed:', e?.message ?? e);
  }
}

export function registerClawFlowIPC(config?: ClawFlowEngineConfig): void {
  if (config) {
    getGlobalClawFlowEngine().setWorkspaceRoot(config.workspaceRoot ?? getGlobalClawFlowEngine().getConfig().workspaceRoot);
  }

  ipcMain.handle('engine:getConfig', async () => getGlobalClawFlowEngine().getConfig());
  ipcMain.handle('engine:setWorkspaceRoot', async (_e, workspaceRoot: string) => {
    getGlobalClawFlowEngine().setWorkspaceRoot(workspaceRoot);
    return { success: true };
  });

  ipcMain.handle('engine:getConversations', async () => {
    const conversations = await getGlobalClawFlowEngine().listConversations();
    return { conversations };
  });
  ipcMain.handle('engine:getChatModels', async () => getGlobalClawFlowEngine().listChatModelCatalog());
  ipcMain.handle('engine:upsertConversation', async (_e, conversation: StoredConversation) => {
    await getGlobalClawFlowEngine().upsertConversation(conversation);
    return { success: true };
  });
  ipcMain.handle('engine:deleteConversation', async (_e, conversationId: string) => {
    await getGlobalClawFlowEngine().deleteConversation(conversationId);
    return { success: true };
  });
  ipcMain.handle(
    'engine:sendMessage',
    async (
      _e,
      params: { conversationId: string; userText: string; mode?: InteractionMode; modelId?: string }
    ) => {
      const res = await getGlobalClawFlowEngine().sendMessage(params);
      return { success: true, message: res.message };
    }
  );
  ipcMain.handle(
    'engine:sendMessageStream',
    async (
      event,
      params: { conversationId: string; userText: string; modelId?: string; mode?: 'ask' | 'plan' | 'multitask' }
    ) => {
      const sendDelta = (text: string) => {
        event.sender.send('engine:chatStream', {
          kind: 'delta',
          conversationId: params.conversationId,
          text,
        });
      };

      const mode = params.mode === 'plan' ? 'plan' : params.mode === 'multitask' ? 'multitask' : 'ask';

      // Multitask may involve tools and long execution; stream a small status first,
      // then chunk the final reply for a consistent streaming UX.
      if (mode === 'multitask') {
        sendDelta('（执行中…）\n');
        const res = await getGlobalClawFlowEngine().sendMessage({
          conversationId: params.conversationId,
          userText: params.userText,
          modelId: params.modelId,
          mode,
          onDelta: sendDelta,
        });
        const full = res.message ?? '';
        const chunkSize = 28;
        for (let i = 0; i < full.length; i += chunkSize) {
          sendDelta(full.slice(i, i + chunkSize));
          await new Promise((r) => setTimeout(r, 15));
        }
        return { success: true, message: full };
      }

      const full = await getGlobalClawFlowEngine().sendMessageTextStream({
        conversationId: params.conversationId,
        userText: params.userText,
        modelId: params.modelId,
        mode,
        onDelta: (text) => sendDelta(text),
      });
      return { success: true, message: full };
    }
  );
}

