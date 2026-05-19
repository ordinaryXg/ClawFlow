/**
 * ClawFlow 引擎与鉴权 IPC（app.whenReady 内 registerClawFlowIPC）。
 */
import { ipcMain } from 'electron';
import type { InteractionMode } from './providers/types';
import { StoredConversation } from './session-store';
import {
  resolveWorkspaceRootForWebContents,
  workspaceRootOrUndefined,
} from '../main/electron-workspace-context';
import { getGlobalClawFlowEngine, type ClawFlowEngineConfig } from './clawflow-engine';
import { getAuthStoreSummary, getAuthToken, setActiveAuthProfile } from './auth-store';
import {
  DEFAULT_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
  DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
  MAX_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
  MAX_OUTBOUND_MERGE_WINDOW_MS,
  MIN_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
  MIN_OUTBOUND_MERGE_WINDOW_MS,
  readEngineRuntimePrefsFile,
  resolveMaxSendMessageToolLoopSteps,
  resolveOutboundMergeWindowMs,
  writeEngineRuntimePrefsFile,
  type EngineRuntimePrefsStored,
} from '../main/prefs/engine-runtime-prefs';
import {
  mergeWebSearchBootstrapWithFile,
  readWebSearchPrefsFile,
  writeWebSearchPrefsFile,
  type WebSearchPrefsStored,
} from '../main/prefs/web-search-prefs';
import { resolveWebSearchConfig, sanitizeWebSearchForPublic } from './web-search';

export function registerClawFlowIPC(config?: ClawFlowEngineConfig): void {

  getGlobalClawFlowEngine(config);

  ipcMain.handle('engine:getRuntimeSettings', async () => {
    const file = readEngineRuntimePrefsFile();
    return {
      maxSendMessageToolLoopSteps: resolveMaxSendMessageToolLoopSteps(file),
      defaultMaxSendMessageToolLoopSteps: DEFAULT_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
      minMaxSendMessageToolLoopSteps: MIN_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
      maxMaxSendMessageToolLoopSteps: MAX_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
      outboundMergeWindowMs: resolveOutboundMergeWindowMs(file),
      defaultOutboundMergeWindowMs: DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
      minOutboundMergeWindowMs: MIN_OUTBOUND_MERGE_WINDOW_MS,
      maxOutboundMergeWindowMs: MAX_OUTBOUND_MERGE_WINDOW_MS,
    };
  });

  ipcMain.handle('engine:saveRuntimeSettings', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const raw = p.maxSendMessageToolLoopSteps;
    const rawMerge = p.outboundMergeWindowMs;
    if (raw !== undefined && (typeof raw !== 'number' || !Number.isFinite(raw))) {
      return { ok: false as const, error: 'invalid_steps' };
    }
    if (rawMerge !== undefined && (typeof rawMerge !== 'number' || !Number.isFinite(rawMerge))) {
      return { ok: false as const, error: 'invalid_merge_window' };
    }
    const cur = readEngineRuntimePrefsFile() ?? {};
    const next: EngineRuntimePrefsStored = { ...cur };
    if (raw !== undefined) {
      next.maxSendMessageToolLoopSteps = resolveMaxSendMessageToolLoopSteps({
        maxSendMessageToolLoopSteps: raw,
      });
    }
    if (rawMerge !== undefined) {
      next.outboundMergeWindowMs = resolveOutboundMergeWindowMs({ outboundMergeWindowMs: rawMerge });
    }
    writeEngineRuntimePrefsFile(next);
    return {
      ok: true as const,
      maxSendMessageToolLoopSteps: resolveMaxSendMessageToolLoopSteps(next),
      outboundMergeWindowMs: resolveOutboundMergeWindowMs(next),
    };
  });

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
  ipcMain.handle('engine:getConversations', async (event) => {
    const root = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
    try {
      const conversations = await getGlobalClawFlowEngine().listConversations(root);
      return { conversations };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[engine:getConversations]', msg);
      return { conversations: [], error: msg };
    }
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
      if (!root) return { ok: false as const, error: 'no_workspace' };
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
    const root = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
    await getGlobalClawFlowEngine().upsertConversation(conversation, root);
    return { success: true };
  });
  ipcMain.handle('engine:deleteConversation', async (event, conversationId: string) => {
    const root = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
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
      const catalog = await getGlobalClawFlowEngine().listChatModelCatalog();
      const modelId = catalog.models.find((m) => m.id.startsWith(`${providerId}/`))?.id ?? '';
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
      const workspaceRoot = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
      const res = await getGlobalClawFlowEngine().sendMessage({
        ...params,
        workspaceRoot,
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
      const workspaceRoot = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
      const sendDelta = (text: string) => {
        event.sender.send('engine:chatStream', {
          kind: 'delta',
          conversationId: params.conversationId,
          text,
        });
      };

      const mode = params.mode === 'plan' ? 'plan' : params.mode === 'multitask' ? 'multitask' : 'ask';

      const res = await getGlobalClawFlowEngine().sendMessage({
        conversationId: params.conversationId,
        userText: params.userText,
        modelId: params.modelId,
        mode,
        workspaceRoot,
        onDelta: sendDelta,
      });
      return { success: true, message: res.message ?? '' };
    }
  );

}
