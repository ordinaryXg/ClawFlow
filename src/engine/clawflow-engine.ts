import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import * as path from 'path';
import EventEmitter from 'events';
import { getDefaultWorkspacePath, readWorkspaceToolManifest } from '../workspace-service';
import { filterToolSchemasByWorkspaceManifest } from '../shared/workspace-tool-manifest-bridge';
import { STREAM_REASONING_END, STREAM_REASONING_START } from '../utils/reasoning-stream-demux';
import { mergeCompletionReasoning } from '../utils/split-reasoning-from-content';
import { createStreamReasoningPhaseEmitter } from '../utils/reasoning-stream-phase-emitter';
import { SessionStore, StoredConversation, StoredMessage } from './session-store';
import { ProviderRouter } from './provider-router';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import type { ModelProvider } from './providers/provider';
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatMessage,
  ModeConfig,
  ToolCall,
} from './providers/types';
import { getAuthStoreSummary, getAuthToken, setActiveAuthProfile } from './auth-store';
import { createDefaultToolRuntime } from './tool-runtime';
import { buildModeConfig, type ChatIntent } from './mode-policy';
import { buildRoleAgentSystemContent } from './role-agent-context';
import {
  resolveWebSearchConfig,
  sanitizeWebSearchForPublic,
  type ClawFlowWebSearchUserConfig,
  type PublicWebSearchConfig,
  type ResolvedClawFlowWebSearch,
} from './web-search';
import { resolveWorkspaceRootForWebContents } from '../electron-workspace-context';

export type { ClawFlowWebSearchUserConfig, PublicWebSearchConfig } from './web-search';

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
  /** 与 OpenClaw `tools.web.search` 类似：Brave API + 无密钥 DuckDuckGo 回退 */
  webSearch?: ClawFlowWebSearchUserConfig;
}

export interface ClawFlowEngineEvents {
  'engine:ready': [];
  'engine:error': [error: Error];
  'engine:message': [conversationId: string, message: StoredMessage];
}

export type ClawFlowEnginePublicConfig = {
  workspaceRoot: string;
  verbose: boolean;
  webSearch: PublicWebSearchConfig;
};

export type ToolApprovalToolSummary = { name: string; argumentsPreview: string };

export type ToolApprovalNeededPayload = {
  approvalId: string;
  requestId?: string;
  conversationId: string;
  tools: ToolApprovalToolSummary[];
};

export interface ClawFlowEngine {
  getConfig(): Readonly<ClawFlowEnginePublicConfig>;
  setWorkspaceRoot(workspaceRoot: string): void;

  listConversations(workspaceRoot?: string): Promise<StoredConversation[]>;
  upsertConversation(conversation: StoredConversation, workspaceRoot?: string): Promise<void>;
  deleteConversation(conversationId: string, workspaceRoot?: string): Promise<void>;

  sendMessage(params: {
    conversationId: string;
    userText: string;
    mode?: InteractionMode;
    modelId?: string;
    onDelta?: (delta: string) => void;
    abortSignal?: AbortSignal;
    intent?: ChatIntent;
    policyOverrides?: unknown;
    requestId?: string;
    /** 若提供：在每次执行工具前暂停并回调；未提供则视为自动同意（如 IPC 无 UI 场景） */
    onToolApprovalNeeded?: (payload: ToolApprovalNeededPayload) => void | Promise<void>;
    openEmbeddedBrowser?: (url: string) => void;
    /** 多窗口：会话与工具以此根目录为准；缺省用引擎当前 config */
    workspaceRoot?: string;
  }): Promise<{ message: string }>;

  /** Gateway / 主进程在用户确认或拒绝后调用，解除 sendMessage 内工具前等待 */
  resolveToolApproval(approvalId: string, approved: boolean): void;

  /**
   * Ask 单轮流式（SSE → onDelta）。Plan / Multitask 若需工具循环请用 sendMessage。
   */
  sendMessageTextStream(params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode: 'ask';
    onDelta: (delta: string) => void;
    workspaceRoot?: string;
  }): Promise<string>;

  listChatModelCatalog(): Promise<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  }>;
}

class ClawFlowEngineImpl extends EventEmitter implements ClawFlowEngine {
  private config: {
    workspaceRoot: string;
    verbose: boolean;
    webSearch: ResolvedClawFlowWebSearch;
  };
  private store: SessionStore;
  private sessionStores = new Map<string, SessionStore>();
  private router: ProviderRouter;
  private tools = createDefaultToolRuntime();
  private toolApprovalResolvers = new Map<string, (approved: boolean) => void>();

  private getSessionStore(workspaceRoot: string): SessionStore {
    const k = path.resolve(workspaceRoot);
    let s = this.sessionStores.get(k);
    if (!s) {
      s = new SessionStore(k);
      this.sessionStores.set(k, s);
    }
    return s;
  }

  resolveToolApproval(approvalId: string, approved: boolean): void {
    const fn = this.toolApprovalResolvers.get(approvalId);
    if (fn) fn(approved);
  }

  private toolArgumentsPreview(raw: string, max = 220): string {
    const s = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  }

  constructor(cfg: ClawFlowEngineConfig = {}) {
    super();
    const workspaceRoot = path.resolve(cfg.workspaceRoot ?? getDefaultWorkspacePath());
    this.config = {
      workspaceRoot,
      verbose: cfg.verbose ?? true,
      webSearch: resolveWebSearchConfig(cfg.webSearch, process.env),
    };
    this.store = this.getSessionStore(workspaceRoot);
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

  getConfig(): Readonly<ClawFlowEnginePublicConfig> {
    return {
      workspaceRoot: this.config.workspaceRoot,
      verbose: this.config.verbose,
      webSearch: sanitizeWebSearchForPublic(this.config.webSearch),
    };
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    const next = path.resolve(workspaceRoot);
    if (next === this.config.workspaceRoot) return;
    this.config.workspaceRoot = next;
    this.store = this.getSessionStore(next);
    if (this.config.verbose) console.log('[ClawFlowEngine] workspaceRoot=', next);
  }

  async listConversations(workspaceRoot?: string): Promise<StoredConversation[]> {
    const store = this.getSessionStore(workspaceRoot ?? this.config.workspaceRoot);
    return await store.normalizeToSingletonIfNeeded();
  }

  async upsertConversation(conversation: StoredConversation, workspaceRoot?: string): Promise<void> {
    const store = this.getSessionStore(workspaceRoot ?? this.config.workspaceRoot);
    await store.upsertConversation(conversation);
  }

  async deleteConversation(conversationId: string, workspaceRoot?: string): Promise<void> {
    const store = this.getSessionStore(workspaceRoot ?? this.config.workspaceRoot);
    await store.deleteConversation(conversationId);
  }

  private async buildHistoryMessages(
    conversationId: string,
    userText: string,
    store: SessionStore,
    roleWorkspaceRoot: string
  ): Promise<ChatMessage[]> {
    const roleSystem = await buildRoleAgentSystemContent(roleWorkspaceRoot);

    const convsBefore = await store.readAll();
    const conv = convsBefore.find((c) => c.id === conversationId) ?? null;
    const tail: ChatMessage[] = (conv?.messages ?? [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool'))
      .map((m) => ({
        role: m.role as ChatMessage['role'],
        content: String(m.content ?? ''),
        ...(typeof m.reasoning_content === 'string' ? { reasoning_content: m.reasoning_content } : {}),
        ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls as ChatMessage['tool_calls'] } : {}),
        ...(typeof m.tool_call_id === 'string' ? { tool_call_id: m.tool_call_id } : {}),
      }));

    const last = tail[tail.length - 1];
    const ut = String(userText ?? '');
    const alreadyHasUserTurn = last?.role === 'user' && String(last.content ?? '') === ut;
    if (!alreadyHasUserTurn) {
      tail.push({ role: 'user', content: ut });
    }

    // 每次请求固定携带 `.roleAgent/` 下 Markdown，作为 system（不写入会话持久化）
    return [{ role: 'system', content: roleSystem }, ...tail];
  }

  private async appendAssistantMessage(
    store: SessionStore,
    params: {
      conversationId: string;
      reply: string;
      mode: InteractionMode;
      modelIdHint: string | null;
      engine: 'clawflow' | 'clawflow-stub';
      reasoning_content?: string;
    }
  ): Promise<void> {
    const convs = await store.readAll();
    const idx = convs.findIndex((c) => c.id === params.conversationId);
    const now = Date.now();
    const rc =
      typeof params.reasoning_content === 'string' && params.reasoning_content.trim()
        ? params.reasoning_content.trim()
        : undefined;
    const assistantMsg: StoredMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: params.reply,
      timestamp: now,
      ...(rc ? { reasoning_content: rc } : {}),
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
      await store.writeAll(convs);
    }
    this.emit('engine:message', params.conversationId, assistantMsg);
  }

  private async appendMessages(conversationId: string, msgs: StoredMessage[], store: SessionStore): Promise<void> {
    if (!msgs.length) return;
    const convs = await store.readAll();
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
      await store.writeAll(convs);
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
    const authSummary = await getAuthStoreSummary().catch(() => null);
    const labelByProvider = new Map<string, string>();
    if (authSummary?.profiles?.length) {
      const activeByProv = authSummary.activeProfileIdByProvider ?? {};
      for (const p of authSummary.profiles) {
        const prov = String(p.provider ?? '').trim();
        if (!prov) continue;
        // Prefer active profile label for provider.
        if (activeByProv[prov] && String(p.profileId) === String(activeByProv[prov])) {
          const lbl = typeof p.label === 'string' ? p.label.trim() : '';
          if (lbl) labelByProvider.set(prov, lbl);
        }
      }
      // Fallback: first label we see.
      for (const p of authSummary.profiles) {
        const prov = String(p.provider ?? '').trim();
        if (!prov || labelByProvider.has(prov)) continue;
        const lbl = typeof p.label === 'string' ? p.label.trim() : '';
        if (lbl) labelByProvider.set(prov, lbl);
      }
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
    intent?: ChatIntent;
    policyOverrides?: unknown;
    /** 工具 open_embedded_browser：在主进程通过 IPC 通知渲染进程打开右侧内嵌浏览器 */
    openEmbeddedBrowser?: (url: string) => void;
    requestId?: string;
    onToolApprovalNeeded?: (payload: ToolApprovalNeededPayload) => void | Promise<void>;
    workspaceRoot?: string;
  }): Promise<{ message: string }> {
    // Phase 0/1 bridge:
    // - If a model provider is available and configured, use it
    // - Otherwise return a deterministic stub
    const mode = params.mode ?? 'ask';
    const modelId = params.modelId ?? 'deepseek/deepseek-chat';
    const effRoot = path.resolve(params.workspaceRoot ?? this.config.workspaceRoot);
    const store = this.getSessionStore(effRoot);
    const toolRuntimeConfig = { ...this.config, workspaceRoot: effRoot };

    const providerId = this.router.resolveProviderIdFromModelId(modelId);
    const provider = providerId ? this.router.get(providerId) : null;

    let reply = '';
    const reasoningSteps: string[] = [];
    if (provider && providerId) {
      const loopMessages: ChatMessage[] = await this.buildHistoryMessages(
        params.conversationId,
        params.userText,
        store,
        effRoot
      );

      const overridesForMode = (() => {
        const o: any = params.policyOverrides && typeof params.policyOverrides === 'object' ? (params.policyOverrides as any) : null;
        const byMode = o && typeof o[mode] === 'object' ? o[mode] : null;
        return byMode ?? undefined;
      })();
      const baseModeConfig: ModeConfig = buildModeConfig({
        mode,
        intent: params.intent ?? 'strong',
        overrides: overridesForMode,
      });
      const workspaceToolSelection = await readWorkspaceToolManifest(effRoot);
      // Ensure tools come from the current runtime (avoid creating a second runtime for schemas).
      if (baseModeConfig.toolsEnabled) {
        baseModeConfig.tools = filterToolSchemasByWorkspaceManifest(this.tools.listSchemas(), workspaceToolSelection);
      }
      for (let step = 0; step < 6; step++) {
        if (params.abortSignal?.aborted) throw new Error('CANCELLED');
        const req: ChatCompletionRequest = {
          model: modelId,
          messages: loopMessages,
          modeConfig: baseModeConfig,
        };

        let res: ChatCompletionResult;
        if (typeof provider.agentStreamChatCompletion === 'function') {
          const phase = createStreamReasoningPhaseEmitter(params.onDelta);
          try {
            res = await provider.agentStreamChatCompletion(req, {
              signal: params.abortSignal,
              onReasoningDelta: phase.onReasoningDelta,
              onContentDelta: phase.onContentDelta,
            });
          } finally {
            phase.close();
          }
        } else {
          res = await provider.chatCompletion(req, { signal: params.abortSignal });
          const rcStep = typeof res.reasoning_content === 'string' ? res.reasoning_content.trim() : '';
          if (rcStep) {
            params.onDelta?.(`${STREAM_REASONING_START}${rcStep}${STREAM_REASONING_END}`);
          }
        }

        const { displayContent, reasoningCombined } = mergeCompletionReasoning(res.content, res.reasoning_content);
        if (reasoningCombined) {
          reasoningSteps.push(reasoningCombined);
        }

        const toolCalls = res.tool_calls ?? null;
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: displayContent,
          ...(reasoningCombined ? { reasoning_content: reasoningCombined } : {}),
          ...(toolCalls ? { tool_calls: toolCalls as any } : {}),
        };
        loopMessages.push(assistantMsg);

        if (!toolCalls || toolCalls.length === 0) {
          reply = displayContent || '';
          break;
        }

        // Persist this assistant turn (tool_calls + reasoning) so replay/history stays complete.
        try {
          const storedAssistant = this.toStoredAssistantMessage({
            content: displayContent,
            reasoning_content: reasoningCombined || undefined,
            tool_calls: toolCalls as any,
            mode,
            modelIdHint: modelId,
            engine: 'clawflow',
          });
          await this.appendMessages(params.conversationId, [storedAssistant], store);
        } catch (e: any) {
          console.warn('[ClawFlowEngine] persist assistant(tool_calls) failed:', e?.message ?? e);
        }

        let toolResults: Array<{ tool_call_id: string; content: string }>;

        if (params.onToolApprovalNeeded && toolCalls.length > 0) {
          const approvalId = randomUUID();
          let settled = false;
          let resolveApproval!: (v: boolean) => void;
          const waitApproval = new Promise<boolean>((resolve) => {
            resolveApproval = resolve;
          });
          const settleApproval = (v: boolean) => {
            if (settled) return;
            settled = true;
            this.toolApprovalResolvers.delete(approvalId);
            params.abortSignal?.removeEventListener('abort', onApprovalAbort);
            resolveApproval(v);
          };
          const onApprovalAbort = () => settleApproval(false);
          this.toolApprovalResolvers.set(approvalId, (v) => settleApproval(v));

          if (params.abortSignal?.aborted) {
            settleApproval(false);
          } else {
            params.abortSignal?.addEventListener('abort', onApprovalAbort, { once: true });
            void Promise.resolve(
              params.onToolApprovalNeeded({
                approvalId,
                requestId: params.requestId,
                conversationId: params.conversationId,
                tools: (toolCalls as ToolCall[]).map((tc) => ({
                  name: tc.function?.name ?? 'unknown',
                  argumentsPreview: this.toolArgumentsPreview(tc.function?.arguments ?? ''),
                })),
              })
            ).catch(() => undefined);
          }

          const approved = await waitApproval;
          if (!approved) {
            toolResults = (toolCalls as ToolCall[]).map((tc) => ({
              tool_call_id: tc.id,
              content: 'User declined tool execution; tools were not run.',
            }));
          } else {
            toolResults = await this.tools.executeToolCalls(toolCalls as any, {
              workspaceRoot: effRoot,
              config: toolRuntimeConfig,
              onDelta: params.onDelta,
              abortSignal: params.abortSignal,
              openEmbeddedBrowser: params.openEmbeddedBrowser,
              workspaceToolSelection,
            });
          }
        } else {
          toolResults = await this.tools.executeToolCalls(toolCalls as any, {
            workspaceRoot: effRoot,
            config: toolRuntimeConfig,
            onDelta: params.onDelta,
            abortSignal: params.abortSignal,
            openEmbeddedBrowser: params.openEmbeddedBrowser,
            workspaceToolSelection,
          });
        }
        const toolMsgs: ChatMessage[] = [];
        const storedTools: StoredMessage[] = [];
        for (const tr of toolResults) {
          toolMsgs.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
          storedTools.push(this.toStoredToolMessage({ tool_call_id: tr.tool_call_id, content: tr.content }));
        }
        for (const tm of toolMsgs) loopMessages.push(tm);

        // Persist tool results as discrete messages.
        try {
          await this.appendMessages(params.conversationId, storedTools, store);
        } catch (e: any) {
          console.warn('[ClawFlowEngine] persist tool results failed:', e?.message ?? e);
        }
      }
    }

    if (!reply) {
      reply = `【ClawFlowEngine:stub】mode=${mode} model=${modelId}\n\n你说：${params.userText}`;
    }

    // Persist final assistant reply as its own message.
    // (Tool-calls + tool results are persisted per-step above for plan/multitask.)
    await this.appendAssistantMessage(store, {
      conversationId: params.conversationId,
      reply,
      mode,
      modelIdHint: modelId,
      engine: reply.startsWith('【ClawFlowEngine:stub】') ? 'clawflow-stub' : 'clawflow',
      reasoning_content: reasoningSteps.length ? reasoningSteps.join('\n\n—\n\n') : undefined,
    });
    return { message: reply };
  }

  async sendMessageTextStream(params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode: 'ask';
    onDelta: (delta: string) => void;
    abortSignal?: AbortSignal;
    intent?: ChatIntent;
    policyOverrides?: unknown;
    workspaceRoot?: string;
  }): Promise<string> {
    const effRoot = path.resolve(params.workspaceRoot ?? this.config.workspaceRoot);
    const store = this.getSessionStore(effRoot);

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
    const overridesForMode = (() => {
      const o: any = params.policyOverrides && typeof params.policyOverrides === 'object' ? (params.policyOverrides as any) : null;
      const byMode = o && typeof o[mode] === 'object' ? o[mode] : null;
      return byMode ?? undefined;
    })();
    const baseModeConfig: ModeConfig = buildModeConfig({
      mode,
      intent: params.intent ?? 'strong',
      overrides: overridesForMode,
    });

    if (!provider || !providerId) {
      const reply = `【ClawFlowEngine:stub】mode=${streamMode} model=${modelId}\n\n你说：${params.userText}`;
      await emitChunked(reply);
      await this.appendAssistantMessage(store, {
        conversationId: params.conversationId,
        reply,
        mode,
        modelIdHint: modelId,
        engine: 'clawflow-stub',
      });
      return reply;
    }

    const loopMessages = await this.buildHistoryMessages(params.conversationId, params.userText, store, effRoot);
    const req: ChatCompletionRequest = {
      model: modelId,
      messages: loopMessages,
      modeConfig: baseModeConfig,
    };

    const p = provider as ModelProvider;
    let reply = '';
    let apiReasoning = '';
    if (typeof p.streamChatCompletion === 'function') {
      const res = await p.streamChatCompletion(req, params.onDelta, { signal: params.abortSignal });
      reply = res.content || '';
      apiReasoning = typeof res.reasoning_content === 'string' ? res.reasoning_content : '';
    } else {
      const res = await provider.chatCompletion(req, { signal: params.abortSignal });
      reply = res.content || '';
      apiReasoning = typeof res.reasoning_content === 'string' ? res.reasoning_content : '';
      if (reply) await emitChunked(reply);
    }

    if (!reply.trim()) {
      reply = `【ClawFlowEngine:stub】mode=${streamMode} model=${modelId}\n\n你说：${params.userText}`;
      await emitChunked(reply);
      await this.appendAssistantMessage(store, {
        conversationId: params.conversationId,
        reply,
        mode,
        modelIdHint: modelId,
        engine: 'clawflow-stub',
      });
      return reply;
    }

    const merged = mergeCompletionReasoning(reply, apiReasoning);
    const replyPersist = merged.displayContent.trim() ? merged.displayContent : reply;
    await this.appendAssistantMessage(store, {
      conversationId: params.conversationId,
      reply: replyPersist,
      mode,
      modelIdHint: modelId,
      engine: reply.startsWith('【ClawFlowEngine:stub】') ? 'clawflow-stub' : 'clawflow',
      reasoning_content: merged.reasoningCombined || undefined,
    });
    return replyPersist;
  }
}

let globalEngine: ClawFlowEngineImpl | null = null;

export function getGlobalClawFlowEngine(bootstrap?: ClawFlowEngineConfig): ClawFlowEngineImpl {
  if (!globalEngine) globalEngine = new ClawFlowEngineImpl(bootstrap ?? {});
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
  getGlobalClawFlowEngine(config);

  ipcMain.handle('engine:getConfig', async () => getGlobalClawFlowEngine().getConfig());
  ipcMain.handle('engine:setWorkspaceRoot', async (_e, workspaceRoot: string) => {
    getGlobalClawFlowEngine().setWorkspaceRoot(workspaceRoot);
    return { success: true };
  });

  ipcMain.handle('engine:getConversations', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    const conversations = await getGlobalClawFlowEngine().listConversations(root);
    return { conversations };
  });
  ipcMain.handle('engine:getChatModels', async () => getGlobalClawFlowEngine().listChatModelCatalog());
  ipcMain.handle('engine:upsertConversation', async (event, conversation: StoredConversation) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    await getGlobalClawFlowEngine().upsertConversation(conversation, root);
    return { success: true };
  });
  ipcMain.handle('engine:deleteConversation', async (event, conversationId: string) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    await getGlobalClawFlowEngine().deleteConversation(conversationId, root);
    return { success: true };
  });

  // D1: provider profiles + secure token storage
  ipcMain.handle('engineAuth:listProfiles', async () => {
    return await getAuthStoreSummary();
  });
  ipcMain.handle(
    'engineAuth:upsertProfile',
    async (
      _e,
      params: {
        provider: string;
        token: string;
        profileId?: string;
        label?: string;
        environment?: 'personal' | 'work' | 'custom';
      }
    ) => {
      const { upsertAuthProfile } = await import('./auth-store');
      return await upsertAuthProfile(params);
    }
  );
  ipcMain.handle('engineAuth:removeProfile', async (_e, params: { provider: string; profileId: string }) => {
    const { removeAuthProfile } = await import('./auth-store');
    return await removeAuthProfile(params);
  });
  ipcMain.handle(
    'engineAuth:updateProfileMeta',
    async (_e, params: { provider: string; profileId: string; label?: string; environment?: 'personal' | 'work' | 'custom' }) => {
      const { updateAuthProfileMeta } = await import('./auth-store');
      return await updateAuthProfileMeta(params);
    }
  );
  ipcMain.handle('engineAuth:setActiveProfile', async (_e, params: { provider: string; profileId: string }) => {
    return await setActiveAuthProfile(params);
  });
  ipcMain.handle(
    'engineAuth:testConnection',
    async (_e, params: { provider: 'deepseek' | 'openai' | 'anthropic'; profileId: string }) => {
      const providerId = params.provider;
      const profileId = params.profileId;
      const token = await getAuthToken(providerId, profileId);
      if (!token) return { ok: false as const, errorCode: 'missing_key', message: '缺少 Key' };
      const modelId = BUILTIN_CHAT_MODEL_CATALOG[providerId]?.[0] ?? '';
      if (!modelId) return { ok: false as const, errorCode: 'model_not_found', message: '未找到可测试模型' };

      const { DeepSeekProvider } = await import('./providers/deepseek');
      const { OpenAIProvider } = await import('./providers/openai');
      const { AnthropicProvider } = await import('./providers/anthropic');
      const t0 = Date.now();
      try {
        const p =
          providerId === 'deepseek'
            ? new DeepSeekProvider({ apiKey: token })
            : providerId === 'openai'
              ? new OpenAIProvider({ apiKey: token })
              : new AnthropicProvider({ apiKey: token });
        const res = await p.chatCompletion({
          model: modelId,
          messages: [{ role: 'user', content: 'ping' }],
          modeConfig: { mode: 'ask' },
        });
        const latencyMs = Date.now() - t0;
        return { ok: true as const, latencyMs, sample: (res?.content ?? '').slice(0, 80) };
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        const latencyMs = Date.now() - t0;
        const m = String(msg).toLowerCase();
        const statusMatch = String(msg).match(/HTTP\s+(\d{3})/i);
        const status = statusMatch ? Number(statusMatch[1]) : null;
        const errorCode =
          status === 401 || status === 403 || m.includes('invalid') || m.includes('api key is not configured')
            ? 'invalid_key'
            : status === 429 || m.includes('rate')
              ? 'rate_limited'
              : m.includes('quota') || m.includes('insufficient')
                ? 'quota'
                : m.includes('econnrefused') || m.includes('timeout') || m.includes('network')
                  ? 'network'
                  : 'unknown';
        return { ok: false as const, latencyMs, errorCode, message: msg };
      }
    }
  );
  ipcMain.handle(
    'engine:sendMessage',
    async (
      event,
      params: { conversationId: string; userText: string; mode?: InteractionMode; modelId?: string }
    ) => {
      const workspaceRoot = resolveWorkspaceRootForWebContents(event.sender);
      const res = await getGlobalClawFlowEngine().sendMessage({
        ...params,
        workspaceRoot,
        openEmbeddedBrowser: (url: string) => {
          event.sender.send('embedded-browser:navigate', { url });
        },
      });
      return { success: true, message: res.message };
    }
  );
  ipcMain.handle(
    'engine:sendMessageStream',
    async (
      event,
      params: { conversationId: string; userText: string; modelId?: string; mode?: 'ask' | 'plan' | 'multitask' }
    ) => {
      const workspaceRoot = resolveWorkspaceRootForWebContents(event.sender);
      const sendDelta = (text: string) => {
        event.sender.send('engine:chatStream', {
          kind: 'delta',
          conversationId: params.conversationId,
          text,
        });
      };

      const mode = params.mode === 'plan' ? 'plan' : params.mode === 'multitask' ? 'multitask' : 'ask';

      // Plan / Multitask may involve tools and long execution; stream a small status first,
      // then chunk the final reply for a consistent streaming UX.
      if (mode === 'multitask' || mode === 'plan') {
        sendDelta('（执行中…）\n');
        const res = await getGlobalClawFlowEngine().sendMessage({
          conversationId: params.conversationId,
          userText: params.userText,
          modelId: params.modelId,
          mode,
          workspaceRoot,
          onDelta: sendDelta,
          openEmbeddedBrowser: (url: string) => {
            event.sender.send('embedded-browser:navigate', { url });
          },
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
        workspaceRoot,
        onDelta: (text) => sendDelta(text),
      });
      return { success: true, message: full };
    }
  );
}

