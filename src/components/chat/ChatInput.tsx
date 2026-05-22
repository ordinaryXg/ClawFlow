import { FC, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShellLayoutVariant } from '../../context/ShellLayoutContext';
import { CfSelectWithHints } from '../CfSelectWithHints';
import ContextUsageRing from './ContextUsageRing';
import { formatUtf8Bytes } from '../../utils/format-bytes';
import { hasDataTransferFileDrag, pathsFromDataTransferFiles, posixBasename } from '../../utils/electron-data-transfer-files';
import { ChatInputAttachmentChip } from './ChatInputAttachmentChip';
import './chat.css';

function newAttachmentId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `att-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  } catch {
    return `att-${Date.now()}`;
  }
}

function pushChatToast(type: 'success' | 'error', title: string, message?: string): void {
  const api = (window as unknown as { __cf_toast?: { success: (t: string, m?: string) => void; error: (t: string, m?: string) => void } })
    .__cf_toast;
  if (!api) return;
  if (type === 'success') api.success(title, message);
  else api.error(title, message);
}

/** 模型：同心圆靶心，与原先 ⊚ 语义一致 */
function IconModel() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

type PendingAttachment = { id: string; name: string; absPath: string };

const STARTER_IDS = [1, 2, 3, 4, 5] as const;

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
  models?: Array<{ id: string; label: string }>;
  modelId?: string | null;
  onModelChange?: (modelId: string | null) => void;
  /** 0–1，当前会话相对模型上下文上限的粗略饱和度 */
  contextSaturation?: number;
  contextUsedApprox?: number;
  contextLimitApprox?: number;
  /** 主进程下一请求度量（与 sendMessage 组装一致） */
  contextMeterRatio?: number;
  contextMeterTitle?: string;
  nextContextPayload?: {
    utf8Bytes: number;
    loadUnits: number;
    budgetUnits: number;
    isOverflow: boolean;
    isNearOverflow: boolean;
    segments?: Array<{ id: 'role' | 'skills' | 'chat' | 'tools'; utf8Bytes: number; loadUnits: number }>;
  } | null;
  nextContextLoading?: boolean;
  nextContextError?: string | null;
  onDraftTextChange?: (text: string) => void;
  showStarterPrompts?: boolean;
}

const ChatInput: FC<Props> = ({
  disabled,
  onSend,
  models,
  modelId,
  onModelChange,
  showStarterPrompts,
  contextSaturation = 0,
  contextUsedApprox,
  contextLimitApprox,
  contextMeterRatio,
  contextMeterTitle,
  nextContextPayload,
  nextContextLoading,
  nextContextError,
  onDraftTextChange,
}) => {
  const { t } = useTranslation();
  const shellVariant = useShellLayoutVariant();
  const stickyCompactRow = shellVariant === 'alternate';
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileDragDepthRef = useRef(0);

  const canSend = useMemo(() => {
    return !disabled && !isSending && (value.trim().length > 0 || pendingAttachments.length > 0);
  }, [disabled, isSending, value, pendingAttachments.length]);

  const modelOptions = useMemo(() => {
    return (models ?? []).map((m) => ({
      value: m.id,
      label: m.label,
      hint: t('chat.modelProviderHint', { label: m.label }),
    }));
  }, [models, t]);

  useEffect(() => {
    if (disabled) {
      setIsSending(false);
    }
  }, [disabled]);

  const submit = async () => {
    if (!canSend) return;
    const userText = value.trim();
    const pathLines = pendingAttachments.map((a) => `\`${a.absPath}\``);
    const content = [userText, pathLines.join('\n')].filter((s) => s.length > 0).join('\n\n');
    setIsSending(true);
    try {
      await onSend(content);
      setValue('');
      onDraftTextChange?.('');
      setPendingAttachments([]);
    } catch {
      /* 发送失败时保留输入与附件，便于重试 */
    } finally {
      setIsSending(false);
    }
  };

  const importDroppedPathsToCache = useCallback(
    async (paths: string[]): Promise<PendingAttachment[] | null> => {
      const api = window.electronAPI;
      if (!api?.workspaceGetActive || !api?.workspaceCopyChatDropFiles) {
        pushChatToast('error', t('chat.dropErrTitle'), t('chat.dropCopyUnavailable'));
        return null;
      }
      const active = await api.workspaceGetActive();
      const root = typeof active?.path === 'string' ? active.path.trim() : '';
      if (!root) {
        pushChatToast('error', t('chat.dropErrTitle'), t('chat.dropNoWorkspace'));
        return null;
      }
      const uniq: string[] = [];
      const seen = new Set<string>();
      for (const p of paths) {
        const r = String(p ?? '').trim();
        if (!r) continue;
        const k = r.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(r);
      }
      if (uniq.length === 0) return null;
      const res = await api.workspaceCopyChatDropFiles({ sourceAbsolutePaths: uniq });
      if (!res || typeof res !== 'object' || !('ok' in res)) {
        pushChatToast('error', t('chat.dropErrTitle'), t('chat.dropCopyFail', { error: 'unknown' }));
        return null;
      }
      if (!res.ok) {
        pushChatToast('error', t('chat.dropErrTitle'), t('chat.dropCopyFail', { error: String(res.error ?? '') }));
        return null;
      }
      const raw = (res as { ok: true; items?: unknown }).items;
      const arr = Array.isArray(raw) ? raw : [];
      const out: PendingAttachment[] = [];
      for (const x of arr) {
        if (!x || typeof x !== 'object') continue;
        const destAbs = String((x as { destAbs?: unknown }).destAbs ?? '').trim();
        const displayName = String((x as { displayName?: unknown }).displayName ?? '').trim();
        if (!destAbs) continue;
        out.push({ id: newAttachmentId(), name: displayName || posixBasename(destAbs), absPath: destAbs });
      }
      return out.length ? out : null;
    },
    [t]
  );

  const handleFileDrop = useCallback(
    async (dt: DataTransfer) => {
      if (disabled || isSending) return;
      const paths = pathsFromDataTransferFiles(dt);
      if (paths.length === 0) {
        pushChatToast('error', t('chat.dropErrTitle'), t('chat.dropNoLocalPaths'));
        return;
      }
      const batch = await importDroppedPathsToCache(paths);
      if (!batch?.length) return;
      setPendingAttachments((prev) => {
        const existing = new Set(prev.map((p) => p.absPath.toLowerCase()));
        const next = [...prev];
        for (const a of batch) {
          const key = a.absPath.toLowerCase();
          if (existing.has(key)) continue;
          existing.add(key);
          next.push(a);
        }
        return next;
      });
    },
    [disabled, isSending, importDroppedPathsToCache, t]
  );

  const onFileDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!hasDataTransferFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      fileDragDepthRef.current += 1;
      setFileDragOver(true);
    },
    []
  );

  const onFileDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDataTransferFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current -= 1;
    if (fileDragDepthRef.current <= 0) {
      fileDragDepthRef.current = 0;
      setFileDragOver(false);
    }
  }, []);

  const onFileDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDataTransferFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onFileDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!hasDataTransferFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      fileDragDepthRef.current = 0;
      setFileDragOver(false);
      void handleFileDrop(e.dataTransfer);
    },
    [handleFileDrop]
  );

  return (
    <div
      className={[
        `cf-chatInput${stickyCompactRow ? ' cf-chatInput--stickyFoot' : ''}`,
        fileDragOver ? 'cf-chatInput--fileDrag' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragEnter={onFileDragEnter}
      onDragLeave={onFileDragLeave}
      onDragOver={onFileDragOver}
      onDrop={onFileDrop}
    >
      {fileDragOver ? (
        <div className="cf-chatInput__dropOverlay" aria-hidden>
          <span className="cf-chatInput__dropOverlayText">{t('chat.dropOverlayHint')}</span>
        </div>
      ) : null}
      {showStarterPrompts ? (
        <div className="cf-chatInput__starters" role="group" aria-label={t('chat.starterChipsAria')}>
          {STARTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="cf-chatInput__starterChip"
              disabled={disabled || isSending}
              onClick={() => setValue(t(`chat.starterPrompt${id}`))}
            >
              {t(`chat.starterChip${id}`)}
            </button>
          ))}
        </div>
      ) : null}
      {pendingAttachments.length > 0 ? (
        <div className="cf-chatInput__attachList" role="list" aria-label={t('chat.attachListAria')}>
          {pendingAttachments.map((a) => (
            <div key={a.id} className="cf-chatInput__attachListItem" role="listitem">
              <ChatInputAttachmentChip
                absPath={a.absPath}
                fileName={a.name}
                disabled={disabled || isSending}
                removeAriaLabel={t('chat.attachmentRemoveAria', { name: a.name })}
                onRemove={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              />
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        className="cf-textarea"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          onDraftTextChange?.(v);
        }}
        placeholder={t('chat.inputPlaceholder')}
        disabled={disabled || isSending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={2}
      />
      <div
        className={[
          'cf-chatInput__contextMeter',
          nextContextPayload?.isOverflow ? 'cf-chatInput__contextMeter--overflow' : '',
          nextContextPayload?.isNearOverflow ? 'cf-chatInput__contextMeter--warn' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="cf-chatInput__contextMeterText">
          {nextContextLoading ? <span className="cf-chatInput__contextMeterInner">{t('chat.nextContextLoading')}</span> : null}
          {!nextContextLoading && nextContextError ? (
            <span className="cf-chatInput__contextMeterInner cf-errorText">{nextContextError}</span>
          ) : null}
          {!nextContextLoading && !nextContextError && nextContextPayload ? (
            <span className="cf-chatInput__contextMeterInner" title={t('chat.nextContextHint')}>
              {t('chat.nextContextLine', {
                bytes: formatUtf8Bytes(nextContextPayload.utf8Bytes),
                load: nextContextPayload.loadUnits.toLocaleString(),
                budget: nextContextPayload.budgetUnits.toLocaleString(),
                pct: Math.min(999, Math.round((nextContextPayload.loadUnits / nextContextPayload.budgetUnits) * 100)),
              })}
              {nextContextPayload.isOverflow ? ` · ${t('chat.nextContextOverflow')}` : ''}
            </span>
          ) : null}
          {!nextContextLoading && !nextContextError && !nextContextPayload ? (
            <span className="cf-chatInput__contextMeterInner cf-chatInput__contextMeterInner--muted">{t('chat.nextContextIdle')}</span>
          ) : null}
        </div>
      </div>
      <div className="cf-chatInput__footer">
        <div className="cf-chatInput__footerLeft">
          <div className="cf-chatInput__fieldGroup cf-chatInput__fieldGroup--modelMeter" title={t('chat.model')}>
            <span className="cf-chatInput__fieldIco" aria-hidden>
              <IconModel />
            </span>
            <CfSelectWithHints
              className={stickyCompactRow ? 'cf-selectHint--compact cf-selectHint--chatModel' : 'cf-selectHint--chatModel'}
              popupClassName={stickyCompactRow ? 'cf-selectHintDropdown--sticky' : ''}
              value={modelId ?? ''}
              onChange={(v) => onModelChange?.(v ? v : null)}
              options={modelOptions}
              disabled={disabled || isSending || !models || models.length === 0}
              aria-label={t('chat.model')}
              hintIconAriaBase={t('common.selectOptionHintAria')}
              popupMatchSelectWidth={false}
            />
          </div>
        </div>
        <div className="cf-chatInput__actions">
          <ContextUsageRing
            ratio={typeof contextMeterRatio === 'number' ? contextMeterRatio : contextSaturation}
            usedTokensApprox={contextUsedApprox}
            limitTokensApprox={contextLimitApprox}
            titleOverride={contextMeterTitle}
            budgetUnits={nextContextPayload?.budgetUnits}
            segments={nextContextPayload?.segments}
          />
          <button
            className={canSend ? 'cf-btn cf-btnPrimary cf-chatSendBtn' : 'cf-btn cf-chatSendBtn'}
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={t('chat.send')}
            title={t('chat.send')}
          >
            <span className="cf-ico" aria-hidden="true">
              {isSending ? '…' : '➤'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
