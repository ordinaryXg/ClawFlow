import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { dedupeStoredToolMessages } from './dedupe-tool-messages';
import * as path from 'path';
import EventEmitter from 'events';
import { getDefaultWorkspacePath, readWorkspaceToolManifest } from '../main/workspace/workspace-service';
import { filterToolSchemasByWorkspaceManifest } from '../shared/workspace-tool-manifest-bridge';
import { STREAM_REASONING_END, STREAM_REASONING_START } from '../utils/reasoning-stream-demux';
import { mergeCompletionReasoning } from '../utils/split-reasoning-from-content';
import { createStreamReasoningPhaseEmitter } from '../utils/reasoning-stream-phase-emitter';
import { SessionStore, StoredConversation, StoredMessage } from './session-store';
import { broadcastChatConversationsDirty } from '../messaging/chat-broadcast';
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
import { composeNextRequestChatMessages, computeNextRequestContextStats } from './next-request-context';
import {
  resolveWebSearchConfig,
  sanitizeWebSearchForPublic,
  type ClawFlowWebSearchUserConfig,
  type PublicWebSearchConfig,
  type ResolvedClawFlowWebSearch,
} from './web-search';
import { resolveWorkspaceRootForWebContents } from '../main/electron-workspace-context';
import {
  mergeWebSearchBootstrapWithFile,
  readWebSearchPrefsFile,
  writeWebSearchPrefsFile,
  type WebSearchPrefsStored,
} from '../main/prefs/web-search-prefs';
import { maybeScheduleSkillEvolutionAfterMainTurn } from '../main/skill/skill-evolution-scheduler';
import { SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID } from '../shared/skill-agent-constants';

export type { ClawFlowWebSearchUserConfig, PublicWebSearchConfig } from './web-search';

/** Chat 下拉：内置引擎可用模型 ID（`/ 前即为 provider router id） */
const BUILTIN_CHAT_MODEL_CATALOG: Record<string, readonly string[]> = {
  deepseek: [
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-reasoner',
    'deepseek/deepseek-chat',
  ],
  openai: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
  anthropic: ['anthropic/claude-3-5-sonnet-20241022', 'anthropic/claude-3-5-haiku-20241022'],
};

export type InteractionMode = 'ask' | 'plan' | 'multitask';

export interface ClawFlowEngineConfig {
  workspaceRoot?: string;
  verbose?: boolean;
  /** Bocha / Brave / SearXNG / DuckDuckGo HTML；用户偏好见 userData cf.web-search-prefs.json */
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
  /** 风险级别：用于 UI 倒计时与默认动作 */
  riskLevel: 'medium' | 'high';
  /** UI 倒计时毫秒（例如 20000 / 60000） */
  timeoutMs: number;
  /** 超时默认动作：true=默认同意执行；false=默认拒绝 */
  defaultApproved: boolean;
};

export interface ClawFlowEngine {
  getConfig(): Readonly<ClawFlowEnginePublicConfig>;
  setWorkspaceRoot(workspaceRoot: string): void;
  /** 启动时环境/bootstrap 中的 webSearch（不含仅磁盘覆盖项的语义：合并由内部完成） */
  getWebSearchBootstrap(): ClawFlowWebSearchUserConfig;
  /** 重读 cf.web-search-prefs.json 并合并 */
  refreshWebSearchFromDisk(): void;

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
    /** 可选：覆盖 assistant 消息的 channel（用于子 Agent 等产物与主对话区分） */
    assistantMessageChannel?: StoredMessage['channel'];
    /** 可选：合并写入 assistant 消息 meta */
    assistantMessageMeta?: Record<string, unknown>;
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

  /**
   * 外部渠道（飞书事件等）写入一条用户消息并落盘；不触发模型。
   * `channel` 建议使用 `user_feishu` 等与 UI 对齐。
   */
  appendPersistedUserMessage(params: {
    workspaceRoot: string;
    conversationId: string;
    content: string;
    channel?: string;
    meta?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * 按与下一发 sendMessage 相同的规则组装 messages，度量 UTF-8 与「当量/预算」用于溢出判断（非账单）。
   */
  estimateNextRequestContext(params: {
    workspaceRoot: string;
    conversationId: string;
    pendingUserText: string;
    modelId?: string | null;
  }): Promise<
    | {
        ok: true;
        utf8Bytes: number;
        loadUnits: number;
        budgetUnits: number;
        ratio: number;
        isOverflow: boolean;
        isNearOverflow: boolean;
      }
    | { ok: false; error: string }
  >;
}

class ClawFlowEngineImpl extends EventEmitter implements ClawFlowEngine {
  private webSearchBootstrap: ClawFlowWebSearchUserConfig = {};
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

  /** 会话落盘后广播，便于侧栏「未读汇总」等从磁盘重算 */
  private notifyConversationsPersisted(store: SessionStore): void {
    try {
      broadcastChatConversationsDirty({ workspaceRoot: store.resolvedWorkspaceRoot() });
    } catch {
      /* ignore */
    }
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
    this.webSearchBootstrap = { ...(cfg.webSearch ?? {}) };
    this.config = {
      workspaceRoot,
      verbose: cfg.verbose ?? false,
      webSearch: resolveWebSearchConfig(
        mergeWebSearchBootstrapWithFile(this.webSearchBootstrap, readWebSearchPrefsFile()),
        process.env
      ),
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
    if (this.config.verbose) {
      console.log('[ClawFlowEngine] init', {
        workspaceRoot: this.config.workspaceRoot,
        verbose: this.config.verbose,
        webSearch: sanitizeWebSearchForPublic(this.config.webSearch),
      });
    }
  }

  getWebSearchBootstrap(): ClawFlowWebSearchUserConfig {
    return { ...this.webSearchBootstrap };
  }

  refreshWebSearchFromDisk(): void {
    this.config.webSearch = resolveWebSearchConfig(
      mergeWebSearchBootstrapWithFile(this.webSearchBootstrap, readWebSearchPrefsFile()),
      process.env
    );
    if (this.config.verbose) {
      console.log('[ClawFlowEngine] webSearch refreshed', sanitizeWebSearchForPublic(this.config.webSearch));
    }
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

  async appendPersistedUserMessage(params: {
    workspaceRoot: string;
    conversationId: string;
    content: string;
    channel?: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const effRoot = path.resolve(params.workspaceRoot);
    const store = this.getSessionStore(effRoot);
    const msg: StoredMessage = {
      id: randomUUID(),
      role: 'user',
      content: String(params.content ?? ''),
      timestamp: Date.now(),
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.meta && Object.keys(params.meta).length ? { meta: params.meta } : {}),
    };
    await this.appendMessages(params.conversationId, [msg], store);
  }

  async estimateNextRequestContext(params: {
    workspaceRoot: string;
    conversationId: string;
    pendingUserText: string;
    modelId?: string | null;
  }): Promise<
    | {
        ok: true;
        utf8Bytes: number;
        loadUnits: number;
        budgetUnits: number;
        ratio: number;
        isOverflow: boolean;
        isNearOverflow: boolean;
      }
    | { ok: false; error: string }
  > {
    const effRoot = path.resolve(String(params.workspaceRoot ?? '').trim());
    if (!effRoot) return { ok: false, error: 'missing_workspace' };
    const convId = String(params.conversationId ?? '').trim();
    if (!convId) return { ok: false, error: 'missing_conversation' };
    const store = this.getSessionStore(effRoot);
    try {
      const convs = await store.readAll();
      const conv = convs.find((c) => c.id === convId) ?? null;
      const messages = await composeNextRequestChatMessages({
        workspaceRoot: effRoot,
        conversation: conv,
        pendingUserText: params.pendingUserText,
      });
      const s = computeNextRequestContextStats(messages, params.modelId ?? null);
      return { ok: true, ...s };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async upsertConversation(conversation: StoredConversation, workspaceRoot?: string): Promise<void> {
    const store = this.getSessionStore(workspaceRoot ?? this.config.workspaceRoot);
    await store.upsertConversation(conversation);
    this.notifyConversationsPersisted(store);
  }

  async deleteConversation(conversationId: string, workspaceRoot?: string): Promise<void> {
    const store = this.getSessionStore(workspaceRoot ?? this.config.workspaceRoot);
    await store.deleteConversation(conversationId);
    this.notifyConversationsPersisted(store);
  }

  private async buildHistoryMessages(
    conversationId: string,
    userText: string,
    store: SessionStore,
    roleWorkspaceRoot: string
  ): Promise<ChatMessage[]> {
    const convsBefore = await store.readAll();
    const conv = convsBefore.find((c) => c.id === conversationId) ?? null;
    return composeNextRequestChatMessages({
      workspaceRoot: roleWorkspaceRoot,
      conversation: conv,
      pendingUserText: userText,
    });
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
      channel?: StoredMessage['channel'];
      meta?: Record<string, unknown>;
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
      ...(params.channel ? { channel: params.channel } : {}),
      ...(rc ? { reasoning_content: rc } : {}),
      meta: { engine: params.engine, mode: params.mode, modelId: params.modelIdHint, ...(params.meta ?? {}) },
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
      this.notifyConversationsPersisted(store);
    }
    this.emit('engine:message', params.conversationId, assistantMsg);
  }

  /** 主会话 assistant 落盘后：按轮次调度 Skill Agent（手动与通讯端轮次均计入；子 Agent / 审计会话不计入）。 */
  private fireSkillEvolutionHookIfNeeded(
    effRoot: string,
    conversationId: string,
    assistantMessageMeta?: Record<string, unknown>,
    assistantMessageChannel?: string
  ): void {
    const meta0 = assistantMessageMeta;
    if (meta0 && typeof meta0 === 'object' && 'subAgent' in meta0) return;
    if (assistantMessageChannel === 'assistant_tool_summary') return;
    if (conversationId === SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID) return;
    void maybeScheduleSkillEvolutionAfterMainTurn({
      workspaceRoot: effRoot,
      mainConversationId: conversationId,
    }).catch(() => undefined);
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
      this.notifyConversationsPersisted(store);
      for (const m of msgs) {
        this.emit('engine:message', conversationId, m);
      }
    } else {
      console.warn(
        `[ClawFlowEngine] appendMessages: conversation ${conversationId} not found in workspace store; skip persist (${msgs.length} msg)`,
      );
    }
  }

  /** 同一 tool_call_id 只保留一条 tool 消息，避免 running/success/result 多条并列 */
  private async appendToolMessagesUpsert(
    conversationId: string,
    msgs: StoredMessage[],
    store: SessionStore
  ): Promise<void> {
    if (!msgs.length) return;
    const convs = await store.readAll();
    const idx = convs.findIndex((c) => c.id === conversationId);
    const now = Date.now();
    if (idx < 0) return;
    const c = convs[idx];
    const replaceIds = new Set(
      msgs
        .filter((m) => m.role === 'tool')
        .map((m) => String((m as { tool_call_id?: string }).tool_call_id ?? '').trim())
        .filter(Boolean)
    );
    const base = (c.messages ?? []).filter((m) => {
      if (m.role !== 'tool' || replaceIds.size === 0) return true;
      const tid = String((m as { tool_call_id?: string }).tool_call_id ?? '').trim();
      if (!tid || !replaceIds.has(tid)) return true;
      return false;
    });
    const next: StoredConversation = {
      ...c,
      messages: dedupeStoredToolMessages([...base, ...msgs]),
      updatedAt: now,
    };
    convs[idx] = next;
    await store.writeAll(convs);
    this.notifyConversationsPersisted(store);
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

  private toStoredToolMessage(params: { tool_call_id: string; content: string; meta?: Record<string, unknown> }): StoredMessage {
    const now = Date.now();
    return {
      id: randomUUID(),
      role: 'tool',
      content: String(params.content ?? ''),
      timestamp: now,
      tool_call_id: String(params.tool_call_id ?? ''),
      ...(params.meta && typeof params.meta === 'object' ? { meta: params.meta } : {}),
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
      models.find((m) => m.available && m.id === 'deepseek/deepseek-v4-pro') ??
      models.find((m) => m.available && m.id === 'deepseek/deepseek-v4-flash') ??
      models.find((m) => m.available && m.id === 'deepseek/deepseek-reasoner') ??
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
    assistantMessageChannel?: StoredMessage['channel'];
    assistantMessageMeta?: Record<string, unknown>;
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
    let lastAssistantTurnText = '';
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
        const dispTrim = displayContent.trim();
        const reasonTrim = reasoningCombined.trim();
        // DeepSeek-R1 / reasoner：可能仅有 reasoning_content 而 content 仍为空；若不把 reasoning 计入 reply，会误判为空并落入 stub。
        if (reasonTrim && dispTrim) {
          reasoningSteps.push(reasoningCombined);
        }

        const toolCalls = res.tool_calls ?? null;
        // For DeepSeek thinking mode: if API returned reasoning_content, it MUST be sent back on subsequent turns.
        // Also avoid stuffing reasoning into `content` when `content` is empty; keep the split fields for providers.
        const contentForLoop = dispTrim || reasonTrim;
        lastAssistantTurnText = contentForLoop;
        const reasoningForLoop = reasonTrim ? reasoningCombined : undefined;
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: dispTrim,
          ...(reasoningForLoop ? { reasoning_content: reasoningForLoop } : {}),
          ...(toolCalls ? { tool_calls: toolCalls as any } : {}),
        };
        loopMessages.push(assistantMsg);

        if (!toolCalls || toolCalls.length === 0) {
          reply = dispTrim || reasonTrim;
          break;
        }

        // Persist this assistant turn (tool_calls + reasoning) so replay/history stays complete.
        try {
          const storedAssistant = this.toStoredAssistantMessage({
            content: contentForLoop,
            reasoning_content: reasoningForLoop || undefined,
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
        const toolCallMetaById = new Map<string, { toolName: string; argsPreview: string }>();
        for (const tc of toolCalls as ToolCall[]) {
          toolCallMetaById.set(tc.id, {
            toolName: tc.function?.name ?? 'unknown',
            argsPreview: this.toolArgumentsPreview(tc.function?.arguments ?? ''),
          });
        }

        const toolCardForName = (toolName: string): { kind: string; title: string } => {
          const n = String(toolName ?? '').trim();
          if (n === 'web_search') return { kind: 'tool.network.search', title: '网络搜索' };
          if (n === 'web_scrape') return { kind: 'tool.network.scrape', title: '网页爬取' };
          if (n === 'delegate_to_subagent') return { kind: 'tool.subagent.run', title: '子 Agent 调用' };
          if (n.startsWith('workspace_todo_')) return { kind: 'tool.todo.receipt', title: '待办/回执' };
          if (n.startsWith('workspace_git_')) return { kind: 'tool.exec.git', title: '命令行：git' };
          if (n === 'workspace_rg_search') return { kind: 'tool.exec.rg', title: '命令行：rg' };
          if (n === 'workspace_run_tsc_no_emit') return { kind: 'tool.exec.tsc', title: '命令行：tsc' };
          if (n.startsWith('workspace_')) return { kind: 'tool.exec.fs', title: '工作区操作' };
          return { kind: 'tool.exec', title: '工具调用' };
        };

        const appendToolEvent = async (ev: {
          phase: 'start' | 'done' | 'fail';
          tool_call_id: string;
          toolName: string;
          argumentsText: string;
          outputText?: string;
          ts: number;
          statusOverride?: 'running' | 'success' | 'error' | 'result';
        }) => {
          // 普通工具：仅依赖本回合末尾的 tool result 落盘（appendToolMessagesUpsert），此处不写多条 running/success。
          // 子 Agent：异步完成后需单独 upsert 同 tool_call_id，否则会话里永远停在 running 回执。
          if (ev.toolName !== 'delegate_to_subagent') return;
          if (ev.phase === 'start') return;
          const out = String(ev.outputText ?? '');
          if (ev.phase === 'done' && /"state"\s*:\s*"running"/.test(out)) return;
          const card = toolCardForName(ev.toolName);
          const riskLevel = toolRiskForName(ev.toolName);
          const uiStatus = ev.statusOverride ?? (ev.phase === 'fail' ? 'error' : 'success');
          const msg: StoredMessage = this.toStoredToolMessage({
            tool_call_id: ev.tool_call_id,
            content: out,
            meta: {
              kind: card.kind,
              title: card.title,
              riskLevel,
              status: ev.phase === 'fail' ? 'error' : 'result',
              uiStatus,
              toolName: ev.toolName,
              argumentsPreview: this.toolArgumentsPreview(ev.argumentsText ?? ''),
              phase: ev.phase,
              ts: ev.ts,
            },
          });
          try {
            await this.appendToolMessagesUpsert(params.conversationId, [msg], store);
          } catch (e: any) {
            console.warn('[ClawFlowEngine] persist subagent tool event failed:', e?.message ?? e);
          }
        };

        type Risk = 'low' | 'medium' | 'high';
        const toolRiskForName = (toolName: string): Risk => {
          const n = String(toolName ?? '').trim();
          // 文档/目录读取：低风险（白名单自动放行）
          if (n === 'workspace_list_dir' || n === 'workspace_read_file_preview' || n === 'workspace_read_file') return 'low';
          // 写文件/打补丁/重命名/建目录/回滚：中风险（20s 默认执行）
          if (
            n === 'workspace_write_file' ||
            n === 'workspace_apply_patch' ||
            n === 'workspace_mkdir' ||
            n === 'workspace_rename_path' ||
            n === 'workspace_rollback_op'
          )
            return 'medium';
          // 删除 / destructive patch：高风险（60s 默认不执行）
          if (n === 'workspace_delete_path' || n === 'workspace_apply_patch_v2') return 'high';
          // 其它工具默认低风险（未来可按需提升）
          return 'low';
        };

        const toolTimeoutForRisk = (risk: Exclude<Risk, 'low'>): { timeoutMs: number; defaultApproved: boolean } => {
          if (risk === 'high') return { timeoutMs: 60_000, defaultApproved: false };
          return { timeoutMs: 20_000, defaultApproved: true };
        };

        const allCalls = toolCalls as ToolCall[];
        const indexed = allCalls.map((tc, idx) => ({
          idx,
          call: tc,
          name: tc.function?.name ?? 'unknown',
          risk: toolRiskForName(tc.function?.name ?? 'unknown'),
        }));
        const lowCalls = indexed.filter((x) => x.risk === 'low');
        const gatedCalls = indexed.filter((x) => x.risk !== 'low');

        const executeCalls = async (list: typeof indexed) =>
          this.tools.executeToolCalls(
            list.map((x) => x.call) as any,
            {
              workspaceRoot: effRoot,
              config: toolRuntimeConfig,
              onDelta: params.onDelta,
              onToolEvent: appendToolEvent,
              abortSignal: params.abortSignal,
              openEmbeddedBrowser: params.openEmbeddedBrowser,
              workspaceToolSelection,
            }
          );

        if (params.onToolApprovalNeeded && gatedCalls.length > 0) {
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
            const maxRisk: Exclude<Risk, 'low'> = gatedCalls.some((x) => x.risk === 'high') ? 'high' : 'medium';
            const { timeoutMs, defaultApproved } = toolTimeoutForRisk(maxRisk);
            void Promise.resolve(
              params.onToolApprovalNeeded({
                approvalId,
                requestId: params.requestId,
                conversationId: params.conversationId,
                tools: gatedCalls.map((x) => ({
                  name: x.name,
                  argumentsPreview: this.toolArgumentsPreview(x.call.function?.arguments ?? ''),
                })),
                riskLevel: maxRisk,
                timeoutMs,
                defaultApproved,
              })
            ).catch(() => undefined);
          }

          const approved = await waitApproval;
          const lowRes = lowCalls.length ? await executeCalls(lowCalls) : [];
          const gatedRes = approved
            ? await executeCalls(gatedCalls)
            : gatedCalls.map((x) => ({ tool_call_id: x.call.id, content: 'User declined tool execution; tools were not run.' }));
          const merged = [
            ...lowCalls.map((x, i) => ({ idx: x.idx, res: lowRes[i] })),
            ...gatedCalls.map((x, i) => ({ idx: x.idx, res: gatedRes[i] })),
          ]
            .filter((x) => x.res)
            .sort((a, b) => a.idx - b.idx)
            .map((x) => x.res);
          toolResults = merged;
        } else {
          // 无 UI（或无需要确认的工具）：全部直接执行
          toolResults = await executeCalls(indexed);
        }
        const toolMsgs: ChatMessage[] = [];
        const storedTools: StoredMessage[] = [];
        for (const tr of toolResults) {
          toolMsgs.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
          const meta0 = toolCallMetaById.get(tr.tool_call_id);
          storedTools.push(
            this.toStoredToolMessage({
              tool_call_id: tr.tool_call_id,
              content: tr.content,
              meta: meta0
                ? {
                    kind: toolCardForName(meta0.toolName).kind,
                    title: toolCardForName(meta0.toolName).title,
                    riskLevel: toolRiskForName(meta0.toolName),
                    status: 'result',
                    toolName: meta0.toolName,
                    argumentsPreview: meta0.argsPreview,
                  }
                : undefined,
            })
          );
        }
        for (const tm of toolMsgs) loopMessages.push(tm);

        // Persist tool results（按 tool_call_id 合并为单条，避免与生命周期事件重复）
        try {
          await this.appendToolMessagesUpsert(params.conversationId, storedTools, store);
        } catch (e: any) {
          console.warn('[ClawFlowEngine] persist tool results failed:', e?.message ?? e);
        }
      }
    }

    if (!reply) {
      const last = String(lastAssistantTurnText ?? '').trim();
      reply = last
        ? last
        : `【ClawFlowEngine:stub】mode=${mode} model=${modelId}\n\n你说：${params.userText}`;
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
      channel: params.assistantMessageChannel,
      meta: params.assistantMessageMeta,
    });
    this.fireSkillEvolutionHookIfNeeded(
      effRoot,
      params.conversationId,
      params.assistantMessageMeta,
      params.assistantMessageChannel
    );
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
    assistantMessageChannel?: StoredMessage['channel'];
    assistantMessageMeta?: Record<string, unknown>;
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
        channel: params.assistantMessageChannel,
        meta: params.assistantMessageMeta,
      });
      this.fireSkillEvolutionHookIfNeeded(
        effRoot,
        params.conversationId,
        params.assistantMessageMeta,
        params.assistantMessageChannel
      );
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
        channel: params.assistantMessageChannel,
        meta: params.assistantMessageMeta,
      });
      this.fireSkillEvolutionHookIfNeeded(
        effRoot,
        params.conversationId,
        params.assistantMessageMeta,
        params.assistantMessageChannel
      );
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
      channel: params.assistantMessageChannel,
      meta: params.assistantMessageMeta,
    });
    this.fireSkillEvolutionHookIfNeeded(
      effRoot,
      params.conversationId,
      params.assistantMessageMeta,
      params.assistantMessageChannel
    );
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

  ipcMain.handle('engine:getWebSearchSettings', async () => {
    const eng = getGlobalClawFlowEngine();
    const file = readWebSearchPrefsFile();
    const merged = mergeWebSearchBootstrapWithFile(eng.getWebSearchBootstrap(), file);
    const resolved = resolveWebSearchConfig(merged, process.env);
    return {
      ...sanitizeWebSearchForPublic(resolved),
      braveApiKeySavedInFile: Boolean(file && Object.prototype.hasOwnProperty.call(file, 'braveApiKey')),
      bochaApiKeySavedInFile: Boolean(file && Object.prototype.hasOwnProperty.call(file, 'bochaApiKey')),
      searxngApiKeySavedInFile: Boolean(file && Object.prototype.hasOwnProperty.call(file, 'searxngApiKey')),
    };
  });

  ipcMain.handle('engine:saveWebSearchSettings', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const cur = readWebSearchPrefsFile() ?? {};
    const next: WebSearchPrefsStored = { ...cur };
    if (typeof p.enabled === 'boolean') next.enabled = p.enabled;
    if (
      p.provider === 'auto' ||
      p.provider === 'bocha' ||
      p.provider === 'brave' ||
      p.provider === 'duckduckgo' ||
      p.provider === 'searxng'
    ) {
      next.provider = p.provider;
    }
    if (typeof p.bochaBaseUrl === 'string') {
      const bt = p.bochaBaseUrl.trim();
      if (bt) next.bochaBaseUrl = bt;
      else delete next.bochaBaseUrl;
    }
    if (typeof p.braveBaseUrl === 'string') {
      const bt = p.braveBaseUrl.trim();
      if (bt) next.braveBaseUrl = bt;
      else delete next.braveBaseUrl;
    }
    if (typeof p.searxngBaseUrl === 'string') {
      const st = p.searxngBaseUrl.trim();
      if (st) next.searxngBaseUrl = st;
      else delete next.searxngBaseUrl;
    }
    if (typeof p.bochaApiKey === 'string' && p.bochaApiKey.trim()) {
      next.bochaApiKey = p.bochaApiKey.trim();
    } else if (p.clearBochaApiKey === true) {
      delete next.bochaApiKey;
    }
    if (typeof p.braveApiKey === 'string' && p.braveApiKey.trim()) {
      next.braveApiKey = p.braveApiKey.trim();
    } else if (p.clearBraveApiKey === true) {
      delete next.braveApiKey;
    }
    if (typeof p.searxngApiKey === 'string' && p.searxngApiKey.trim()) {
      next.searxngApiKey = p.searxngApiKey.trim();
    } else if (p.clearSearxngApiKey === true) {
      delete next.searxngApiKey;
    }
    if (typeof p.timeoutSeconds === 'number' && Number.isFinite(p.timeoutSeconds)) {
      next.timeoutSeconds = Math.max(5, Math.min(120, p.timeoutSeconds));
    }
    writeWebSearchPrefsFile(next);
    getGlobalClawFlowEngine().refreshWebSearchFromDisk();
    return { ok: true as const };
  });
  ipcMain.handle('engine:setWorkspaceRoot', async (_e, workspaceRoot: string) => {
    getGlobalClawFlowEngine().setWorkspaceRoot(workspaceRoot);
    return { success: true };
  });

  ipcMain.handle('engine:getConversations', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    const conversations = await getGlobalClawFlowEngine().listConversations(root);
    return { conversations };
  });
  ipcMain.handle(
    'engine:estimateNextRequestContext',
    async (
      event,
      payload: { conversationId?: string; pendingUserText?: string; modelId?: string | null } | undefined
    ) => {
      const root = resolveWorkspaceRootForWebContents(event.sender);
      const p = payload && typeof payload === 'object' ? payload : {};
      const conversationId = String(p.conversationId ?? '').trim();
      const pendingUserText = typeof p.pendingUserText === 'string' ? p.pendingUserText : '';
      const modelId = p.modelId === null || typeof p.modelId === 'string' ? p.modelId : undefined;
      if (!conversationId) return { ok: false as const, error: 'missing_conversation' };
      return getGlobalClawFlowEngine().estimateNextRequestContext({
        workspaceRoot: root,
        conversationId,
        pendingUserText,
        modelId,
      });
    }
  );
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

  ipcMain.handle('engine:resolveToolApproval', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { ok: false as const };
    const p = payload as Record<string, unknown>;
    const approvalId = typeof p.approvalId === 'string' ? p.approvalId.trim() : '';
    const approved = Boolean(p.approved);
    if (!approvalId) return { ok: false as const };
    getGlobalClawFlowEngine().resolveToolApproval(approvalId, approved);
    return { ok: true as const };
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

