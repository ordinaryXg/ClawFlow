import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { CfSelectWithHints } from '../../components/CfSelectWithHints';

type FeishuRecvUi = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';

export type FeishuBotUiRow = {
  id: string;
  name: string;
  appId: string;
  secretDraft: string;
  clearSecretOnSave: boolean;
  defaultReceiveId: string;
  receiveIdType: FeishuRecvUi;
  appSecretConfigured: boolean;
  appSecretSavedInFile: boolean;
  bridgeEnabled: boolean;
  bridgeWorkspacePath: string;
  bridgeConversationId: string;
  bridgeSenderLabel: string;
};

type LarkCliRuntime = {
  installed: boolean;
  version: string;
  source: 'userData' | 'bundled-packaged' | 'bundled-dev' | 'remote' | null;
};

type BotConnectionState = 'unknown' | 'ok' | 'fail';

type Props = {
  activeWorkspacePath: string | null;
};

const FeishuSettingsPanel: FC<Props> = ({ activeWorkspacePath }) => {
  const { t } = useTranslation();

  const [feishuBots, setFeishuBots] = useState<FeishuBotUiRow[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [feishuSaving, setFeishuSaving] = useState(false);
  const [feishuTestText, setFeishuTestText] = useState('');
  const [feishuTestingBotId, setFeishuTestingBotId] = useState<string | null>(null);
  const [feishuSendingBotId, setFeishuSendingBotId] = useState<string | null>(null);
  const [larkCliRuntime, setLarkCliRuntime] = useState<LarkCliRuntime | null>(null);
  const [feishuUserAuthLoggedIn, setFeishuUserAuthLoggedIn] = useState<Record<string, boolean>>({});
  const [feishuAuthDeviceCode, setFeishuAuthDeviceCode] = useState<Record<string, string>>({});
  const [feishuAuthVerifyUrl, setFeishuAuthVerifyUrl] = useState<Record<string, string>>({});
  const [feishuAuthBusyBotId, setFeishuAuthBusyBotId] = useState<string | null>(null);
  const [botConnectionState, setBotConnectionState] = useState<Record<string, BotConnectionState>>({});
  const feishuTestDefaultAppliedRef = useRef(false);

  const activeBot = useMemo(
    () => feishuBots.find((b) => b.id === activeBotId) ?? feishuBots[0] ?? null,
    [feishuBots, activeBotId],
  );

  useEffect(() => {
    if (feishuTestDefaultAppliedRef.current) return;
    feishuTestDefaultAppliedRef.current = true;
    setFeishuTestText((p) => p.trim() || t('settings.messagingFeishuTestMsgDefault'));
  }, [t]);

  const feishuReceiveIdSelectOptions = useMemo(
    () => [
      { value: 'chat_id', label: 'chat_id', hint: t('settings.messagingFeishuRecvHint_chat_id') },
      { value: 'open_id', label: 'open_id', hint: t('settings.messagingFeishuRecvHint_open_id') },
      { value: 'user_id', label: 'user_id', hint: t('settings.messagingFeishuRecvHint_user_id') },
      { value: 'union_id', label: 'union_id', hint: t('settings.messagingFeishuRecvHint_union_id') },
      { value: 'email', label: 'email', hint: t('settings.messagingFeishuRecvHint_email') },
    ],
    [t],
  );

  const reloadFeishuMessaging = useCallback(async () => {
    try {
      const res = await window.electronAPI?.messagingGetFeishuBots?.();
      const bots = res?.bots;
      if (!Array.isArray(bots)) return;
      const rows: FeishuBotUiRow[] = [];
      for (const b of bots) {
        const id = String(b.id ?? '').trim();
        if (!id) continue;
        const rt = b.receiveIdType;
        const receiveIdType: FeishuRecvUi =
          rt === 'open_id' || rt === 'user_id' || rt === 'union_id' || rt === 'email' || rt === 'chat_id' ? rt : 'chat_id';
        rows.push({
          id,
          name: String(b.name ?? '').trim() || t('settings.messagingFeishuDefaultBotName'),
          appId: String(b.appId ?? ''),
          secretDraft: '',
          clearSecretOnSave: false,
          defaultReceiveId: String(b.defaultReceiveId ?? ''),
          receiveIdType,
          appSecretConfigured: Boolean(b.appSecretConfigured),
          appSecretSavedInFile: Boolean(b.appSecretSavedInFile),
          bridgeEnabled: Boolean(b.bridgeEnabled),
          bridgeWorkspacePath: String(b.bridgeWorkspacePath ?? ''),
          bridgeConversationId: String(b.bridgeConversationId ?? ''),
          bridgeSenderLabel: String(b.bridgeSenderLabel ?? ''),
        });
      }
      setFeishuBots(rows);
      setActiveBotId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
      const authMap: Record<string, boolean> = {};
      for (const row of rows) {
        try {
          const st = await window.electronAPI?.larkCliGetAuthStatus?.({ botId: row.id, as: 'user' });
          if (st && 'ok' in st && st.ok) authMap[row.id] = Boolean(st.status?.loggedIn);
        } catch {
          /* ignore */
        }
      }
      setFeishuUserAuthLoggedIn(authMap);
    } catch {
      /* ignore */
    }
  }, [t]);

  const refreshLarkCliRuntime = useCallback(async () => {
    try {
      const r = await window.electronAPI?.larkCliGetRuntimeStatus?.();
      if (r && 'ok' in r && r.ok) {
        setLarkCliRuntime({ installed: r.installed, version: r.version, source: r.source ?? null });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadFeishuMessaging();
    void refreshLarkCliRuntime();
  }, [reloadFeishuMessaging, refreshLarkCliRuntime]);

  const patchFeishuBotRow = useCallback((id: string, patch: Partial<FeishuBotUiRow>) => {
    setFeishuBots((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const addFeishuBot = useCallback(() => {
    setFeishuBots((prev) => {
      const n = prev.length + 1;
      const id =
        typeof globalThis !== 'undefined' &&
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `feishu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const row: FeishuBotUiRow = {
        id,
        name: t('settings.messagingFeishuNewBotName', { n }),
        appId: '',
        secretDraft: '',
        clearSecretOnSave: false,
        defaultReceiveId: '',
        receiveIdType: 'chat_id',
        appSecretConfigured: false,
        appSecretSavedInFile: false,
        bridgeEnabled: false,
        bridgeWorkspacePath: '',
        bridgeConversationId: '',
        bridgeSenderLabel: '',
      };
      setActiveBotId(id);
      return [...prev, row];
    });
  }, [t]);

  const removeFeishuBot = useCallback(
    (id: string) => {
      setFeishuBots((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((b) => b.id !== id);
        setActiveBotId((cur) => (cur === id ? next[0]?.id ?? null : cur));
        return next;
      });
    },
    [],
  );

  const botHasCredentials = useCallback((row: FeishuBotUiRow) => {
    const hasSecret = row.appSecretConfigured || row.secretDraft.trim().length > 0;
    return Boolean(row.appId.trim() && hasSecret);
  }, []);

  const getSetupSteps = useCallback(
    (row: FeishuBotUiRow) => {
      const credentials = botHasCredentials(row);
      const botOk = botConnectionState[row.id] === 'ok';
      const userAuth = Boolean(feishuUserAuthLoggedIn[row.id]);
      const bridge = row.bridgeEnabled;
      return [
        { id: 'credentials' as const, done: credentials, label: t('settings.messagingFeishuStepCredentials') },
        { id: 'bot' as const, done: botOk, label: t('settings.messagingFeishuStepBot') },
        { id: 'userAuth' as const, done: userAuth, label: t('settings.messagingFeishuStepUserAuth') },
        { id: 'bridge' as const, done: bridge, label: t('settings.messagingFeishuStepBridge') },
      ];
    },
    [botConnectionState, botHasCredentials, feishuUserAuthLoggedIn, t],
  );

  const onSaveFeishuMessaging = async () => {
    if (feishuBots.length === 0) {
      (window as any).__cf_toast?.error?.(
        t('settings.messagingFeishuSaveFail'),
        t('settings.messagingFeishuSaveErr_invalid_bots'),
      );
      return;
    }
    setFeishuSaving(true);
    try {
      const res = await window.electronAPI?.messagingSaveFeishuBots?.({
        bots: feishuBots.map((row) => ({
          id: row.id,
          name: row.name.trim() || t('settings.messagingFeishuDefaultBotName'),
          ...(row.appId.trim() ? { appId: row.appId.trim() } : {}),
          ...(row.secretDraft.trim() ? { appSecret: row.secretDraft.trim() } : {}),
          clearAppSecret: row.clearSecretOnSave,
          ...(row.defaultReceiveId.trim() ? { defaultReceiveId: row.defaultReceiveId.trim() } : {}),
          receiveIdType: row.receiveIdType,
          bridgeEnabled: row.bridgeEnabled,
          ...(row.bridgeWorkspacePath.trim() ? { bridgeWorkspacePath: row.bridgeWorkspacePath.trim() } : {}),
          ...(row.bridgeConversationId.trim() ? { bridgeConversationId: row.bridgeConversationId.trim() } : {}),
          ...(row.bridgeSenderLabel.trim() ? { bridgeSenderLabel: row.bridgeSenderLabel.trim() } : {}),
        })),
      });
      if (res && typeof res === 'object' && 'ok' in res && (res as { ok?: boolean }).ok === false) {
        const err = String((res as { error?: string }).error ?? '');
        const errMap: Record<string, string> = {
          invalid_bots: t('settings.messagingFeishuSaveErr_invalid_bots'),
        };
        (window as any).__cf_toast?.error?.(
          t('settings.messagingFeishuSaveFail'),
          (errMap[err] ?? err) || t('common.sampleOpFailBody'),
        );
        return;
      }
      await reloadFeishuMessaging();
      (window as any).__cf_toast?.success?.(t('settings.messagingFeishuSavedTitle'), t('settings.messagingFeishuSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSaveFail'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuSaving(false);
    }
  };

  const onTestFeishuConnection = async (botId: string) => {
    const row = feishuBots.find((b) => b.id === botId);
    if (!row) return;
    setFeishuTestingBotId(botId);
    try {
      const r = await window.electronAPI?.messagingTestFeishu?.({
        botId,
        ...(row.appId.trim() ? { appId: row.appId.trim() } : {}),
        ...(row.secretDraft.trim() ? { appSecret: row.secretDraft.trim() } : {}),
      });
      if (r?.ok) {
        setBotConnectionState((prev) => ({ ...prev, [botId]: 'ok' }));
        (window as any).__cf_toast?.success?.(
          t('settings.messagingFeishuTestOkTitle'),
          t('settings.messagingFeishuTestOkBodyShort'),
        );
      } else {
        setBotConnectionState((prev) => ({ ...prev, [botId]: 'fail' }));
        const raw = r as { error?: string; detail?: string };
        const err = raw.error ?? '';
        const detail = raw.detail ?? '';
        console.error('[Settings] Feishu test connection failed', { error: err, detail: detail || undefined });
        const body = [err, detail].filter(Boolean).join('\n\n');
        (window as any).__cf_toast?.error?.(t('settings.messagingFeishuTestFailTitle'), body.slice(0, 8000));
      }
    } catch (e: any) {
      setBotConnectionState((prev) => ({ ...prev, [botId]: 'fail' }));
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuTestFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuTestingBotId(null);
    }
  };

  const onSendFeishuTestMessage = async (botId: string) => {
    const text = (feishuTestText.trim() || t('settings.messagingFeishuTestMsgDefault')).trim();
    const row = feishuBots.find((b) => b.id === botId);
    if (!row?.defaultReceiveId.trim()) {
      (window as any).__cf_toast?.error?.(
        t('settings.messagingFeishuSendFailTitle'),
        t('settings.messagingFeishuSendNeedReceiveId'),
      );
      return;
    }
    setFeishuSendingBotId(botId);
    try {
      const r = await window.electronAPI?.messagingSendFeishuTestMessage?.({
        botId,
        text,
        receiveId: row.defaultReceiveId.trim() || undefined,
        receiveIdType: row.receiveIdType,
        ...(row.appId.trim() ? { appId: row.appId.trim() } : {}),
        ...(row.secretDraft.trim() ? { appSecret: row.secretDraft.trim() } : {}),
      });
      if (r?.ok) {
        (window as any).__cf_toast?.success?.(t('settings.messagingFeishuSendOkTitle'), t('settings.messagingFeishuSendOkBody'));
      } else {
        const raw = r as { error?: string; detail?: string };
        const err = raw.error ?? '';
        const detail = raw.detail ?? '';
        console.error('[Settings] Feishu send test message failed', { error: err, detail: detail || undefined });
        const body = [err, detail].filter(Boolean).join('\n\n');
        (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSendFailTitle'), body.slice(0, 8000));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSendFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuSendingBotId(null);
    }
  };

  const credsForBot = useCallback(
    (botId: string) => {
      const row = feishuBots.find((b) => b.id === botId);
      if (!row) return {};
      return {
        ...(row.appId.trim() ? { appId: row.appId.trim() } : {}),
        ...(row.secretDraft.trim() ? { appSecret: row.secretDraft.trim() } : {}),
      };
    },
    [feishuBots]
  );

  const formatFeishuAuthError = useCallback(
    (raw: { error?: string; detail?: string } | null | undefined) => {
      const err = raw?.error ?? '';
      const detail = raw?.detail ?? '';
      const errMap: Record<string, string> = {
        missing_credentials: t('settings.messagingErr_missing_credentials'),
        missing_bot: t('settings.messagingFeishuAuthFailMissingBot'),
      };
      const msg = (err && errMap[err]) || err || t('common.sampleOpFailBody');
      const body = [msg, detail && detail !== msg ? detail : ''].filter(Boolean).join('\n\n');
      return body.slice(0, 8000);
    },
    [t]
  );

  const onStartFeishuUserAuth = async (botId: string) => {
    setFeishuAuthBusyBotId(botId);
    try {
      const r = await window.electronAPI?.larkCliAuthLoginStart?.({ botId, ...credsForBot(botId) });
      if (!r || !('ok' in r) || !r.ok) {
        (window as any).__cf_toast?.error?.(
          t('settings.messagingFeishuAuthFailTitle'),
          formatFeishuAuthError(r as { error?: string; detail?: string })
        );
        return;
      }
      if (r.deviceCode) {
        setFeishuAuthDeviceCode((prev) => ({ ...prev, [botId]: r.deviceCode! }));
      }
      const url = String(r.verificationUrl ?? '').trim();
      if (url) {
        setFeishuAuthVerifyUrl((prev) => ({ ...prev, [botId]: url }));
        try {
          await window.electronAPI?.openExternal?.(url);
        } catch {
          /* ignore */
        }
        (window as any).__cf_toast?.success?.(
          t('settings.messagingFeishuAuthStartTitle'),
          t('settings.messagingFeishuAuthStartBody')
        );
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuAuthFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuAuthBusyBotId(null);
    }
  };

  const onCompleteFeishuUserAuth = async (botId: string) => {
    const deviceCode = feishuAuthDeviceCode[botId]?.trim();
    if (!deviceCode) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuAuthFailTitle'), t('settings.messagingFeishuAuthMissingDeviceCode'));
      return;
    }
    setFeishuAuthBusyBotId(botId);
    try {
      const r = await window.electronAPI?.larkCliAuthLoginComplete?.({
        botId,
        deviceCode,
        ...credsForBot(botId),
      });
      if (r && 'ok' in r && r.ok) {
        const body = r.warning
          ? `${t('settings.messagingFeishuAuthOkBody')}\n\n${r.warning}`
          : t('settings.messagingFeishuAuthOkBody');
        (window as any).__cf_toast?.success?.(t('settings.messagingFeishuAuthOkTitle'), body);
        setFeishuAuthVerifyUrl((prev) => {
          const next = { ...prev };
          delete next[botId];
          return next;
        });
        setFeishuAuthDeviceCode((prev) => {
          const next = { ...prev };
          delete next[botId];
          return next;
        });
        await reloadFeishuMessaging();
      } else {
        (window as any).__cf_toast?.error?.(
          t('settings.messagingFeishuAuthFailTitle'),
          formatFeishuAuthError(r as { error?: string; detail?: string })
        );
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuAuthFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuAuthBusyBotId(null);
    }
  };

  const onLogoutFeishuUserAuth = async (botId: string) => {
    setFeishuAuthBusyBotId(botId);
    try {
      const r = await window.electronAPI?.larkCliAuthLogout?.({ botId });
      if (r && 'ok' in r && r.ok) {
        setFeishuUserAuthLoggedIn((prev) => ({ ...prev, [botId]: false }));
        (window as any).__cf_toast?.success?.(t('settings.messagingFeishuAuthLogoutOkTitle'), t('settings.messagingFeishuAuthLogoutOkBody'));
      } else {
        const err = (r as { error?: string })?.error ?? t('common.sampleOpFailBody');
        (window as any).__cf_toast?.error?.(t('settings.messagingFeishuAuthFailTitle'), err);
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuAuthFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuAuthBusyBotId(null);
    }
  };

  const larkCliSourceLabel = larkCliRuntime?.source
    ? t(`settings.messagingFeishuLarkCliSource_${larkCliRuntime.source}`)
    : t('settings.messagingFeishuLarkCliSource_none');

  const renderBotPanel = (r: FeishuBotUiRow) => {
    const steps = getSetupSteps(r);
    const conn = botConnectionState[r.id] ?? 'unknown';
    const userLoggedIn = Boolean(feishuUserAuthLoggedIn[r.id]);
    const verifyUrl = feishuAuthVerifyUrl[r.id]?.trim();

    return (
      <div key={r.id} className="cf-feishuBotPanel">
        <div className="cf-feishuBotPanel__head">
          <input
            className="cf-input cf-feishuBotPanel__nameInput"
            value={r.name}
            onChange={(e) => patchFeishuBotRow(r.id, { name: e.target.value })}
            placeholder={t('settings.messagingFeishuDefaultBotName')}
            autoComplete="off"
            aria-label={t('settings.messagingFeishuBotNameLabel')}
          />
          <button
            type="button"
            className="cf-btn cf-btnGhost cf-btnSmall"
            disabled={feishuBots.length <= 1}
            onClick={() => removeFeishuBot(r.id)}
          >
            {t('settings.messagingFeishuRemoveBot')}
          </button>
        </div>

        <ol className="cf-feishuSetupSteps" aria-label={t('settings.messagingFeishuSetupProgress')}>
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={`cf-feishuSetupSteps__item${step.done ? ' cf-feishuSetupSteps__item--done' : ''}`}
            >
              <span className="cf-feishuSetupSteps__num">{i + 1}</span>
              <span className="cf-feishuSetupSteps__label">{step.label}</span>
            </li>
          ))}
        </ol>

        <section className="cf-feishuSection">
          <header className="cf-feishuSection__head">
            <span className="cf-feishuSection__step">1</span>
            <div>
              <h4 className="cf-feishuSection__title">{t('settings.messagingFeishuSectionCredentials')}</h4>
              <p className="cf-feishuSection__desc">{t('settings.messagingFeishuSectionCredentialsDesc')}</p>
            </div>
          </header>
          <div className="cf-feishuSection__body">
            <div className="cf-feishuField">
              <label className="cf-sub">{t('settings.messagingFeishuAppId')}</label>
              <input
                className="cf-input"
                value={r.appId}
                onChange={(e) => patchFeishuBotRow(r.id, { appId: e.target.value })}
                placeholder={t('settings.messagingFeishuAppIdPh')}
                autoComplete="off"
              />
            </div>
            <div className="cf-feishuField">
              <label className="cf-sub">{t('settings.messagingFeishuAppSecret')}</label>
              <input
                className="cf-input"
                type="password"
                value={r.secretDraft}
                onChange={(e) => patchFeishuBotRow(r.id, { secretDraft: e.target.value })}
                placeholder={t('settings.messagingFeishuAppSecretPh')}
                autoComplete="new-password"
              />
              <div className="cf-feishuInlineStatus">
                <span
                  className={`cf-feishuPill${r.appSecretConfigured ? ' cf-feishuPill--ok' : ' cf-feishuPill--muted'}`}
                >
                  {r.appSecretConfigured
                    ? t('settings.messagingFeishuSecretStatus_ok')
                    : t('settings.messagingFeishuSecretStatus_none')}
                </span>
                {r.appSecretSavedInFile ? (
                  <span className="cf-help">{t('settings.messagingFeishuSecretStatus_file')}</span>
                ) : null}
              </div>
              {r.appSecretSavedInFile ? (
                <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {r.clearSecretOnSave ? (
                    <>
                      <span className="cf-help" style={{ color: 'var(--warning, #c9a227)' }}>
                        {t('settings.messagingFeishuClearPending')}
                      </span>
                      <button
                        type="button"
                        className="cf-btn cf-btnGhost cf-btnSmall"
                        onClick={() => patchFeishuBotRow(r.id, { clearSecretOnSave: false })}
                      >
                        {t('settings.messagingFeishuClearCancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="cf-btn cf-btnGhost cf-btnSmall"
                      onClick={() => patchFeishuBotRow(r.id, { clearSecretOnSave: true })}
                    >
                      {t('settings.messagingFeishuClearSecret')}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <a
              className="cf-feishuDocLink"
              href="https://open.feishu.cn/app"
              target="_blank"
              rel="noreferrer"
            >
              {t('settings.messagingFeishuOpenPlatformLink')}
            </a>
          </div>
        </section>

        <section className="cf-feishuSection">
          <header className="cf-feishuSection__head">
            <span className="cf-feishuSection__step">2</span>
            <div>
              <h4 className="cf-feishuSection__title">{t('settings.messagingFeishuSectionBot')}</h4>
              <p className="cf-feishuSection__desc">{t('settings.messagingFeishuSectionBotDesc')}</p>
            </div>
            {conn === 'ok' ? (
              <span className="cf-feishuPill cf-feishuPill--ok">{t('settings.messagingFeishuBotStatusOk')}</span>
            ) : conn === 'fail' ? (
              <span className="cf-feishuPill cf-feishuPill--fail">{t('settings.messagingFeishuBotStatusFail')}</span>
            ) : null}
          </header>
          <div className="cf-feishuSection__body">
            <button
              type="button"
              className="cf-btn cf-btnSmall"
              disabled={feishuTestingBotId === r.id || !botHasCredentials(r)}
              onClick={() => void onTestFeishuConnection(r.id)}
            >
              {feishuTestingBotId === r.id ? t('settings.messagingFeishuTesting') : t('settings.messagingFeishuTest')}
            </button>
            {!botHasCredentials(r) ? (
              <p className="cf-help" style={{ marginTop: 8 }}>
                {t('settings.messagingFeishuBotNeedCredentials')}
              </p>
            ) : null}
          </div>
        </section>

        <section className="cf-feishuSection">
          <header className="cf-feishuSection__head">
            <span className="cf-feishuSection__step">3</span>
            <div>
              <h4 className="cf-feishuSection__title">{t('settings.messagingFeishuUserAuthTitle')}</h4>
              <p className="cf-feishuSection__desc">{t('settings.messagingFeishuSectionUserAuthDesc')}</p>
            </div>
            <span className={`cf-feishuPill${userLoggedIn ? ' cf-feishuPill--ok' : ' cf-feishuPill--muted'}`}>
              {userLoggedIn ? t('settings.messagingFeishuUserAuthLoggedIn') : t('settings.messagingFeishuUserAuthRequired')}
            </span>
          </header>
          <div className="cf-feishuSection__body">
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="cf-btn cf-btnSmall"
                disabled={feishuAuthBusyBotId === r.id || !botHasCredentials(r)}
                onClick={() => void onStartFeishuUserAuth(r.id)}
              >
                {t('settings.messagingFeishuUserAuthStart')}
              </button>
              <button
                type="button"
                className="cf-btn cf-btnGhost cf-btnSmall"
                disabled={feishuAuthBusyBotId === r.id || !feishuAuthDeviceCode[r.id]}
                onClick={() => void onCompleteFeishuUserAuth(r.id)}
              >
                {t('settings.messagingFeishuUserAuthComplete')}
              </button>
              {userLoggedIn ? (
                <button
                  type="button"
                  className="cf-btn cf-btnGhost cf-btnSmall"
                  disabled={feishuAuthBusyBotId === r.id}
                  onClick={() => void onLogoutFeishuUserAuth(r.id)}
                >
                  {t('settings.messagingFeishuOAuthLogout')}
                </button>
              ) : null}
            </div>
            {verifyUrl ? (
              <div className="cf-feishuOAuthBox">
                <div className="cf-sub">{t('settings.messagingFeishuOAuthPendingUrl')}</div>
                <a className="cf-feishuOAuthBox__url" href={verifyUrl} target="_blank" rel="noreferrer">
                  {verifyUrl}
                </a>
              </div>
            ) : null}
          </div>
        </section>

        <section className="cf-feishuSection">
          <header className="cf-feishuSection__head">
            <span className="cf-feishuSection__step">4</span>
            <div>
              <h4 className="cf-feishuSection__title">{t('settings.messagingFeishuBridgeTitle')}</h4>
              <p className="cf-feishuSection__desc">{t('settings.messagingFeishuBridgeHelp')}</p>
            </div>
          </header>
          <div className="cf-feishuSection__body">
            <Checkbox
              checked={r.bridgeEnabled}
              onChange={(e) => patchFeishuBotRow(r.id, { bridgeEnabled: e.target.checked })}
            >
              {t('settings.messagingFeishuBridgeEnabled')}
            </Checkbox>
            {r.bridgeEnabled ? (
              <div className="cf-feishuBridgeFields">
                <div className="cf-feishuField">
                  <label className="cf-sub">{t('settings.messagingFeishuBridgeWorkspace')}</label>
                  <div className="cf-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input
                      className="cf-input"
                      style={{ flex: '1 1 200px', minWidth: 0 }}
                      value={r.bridgeWorkspacePath}
                      onChange={(e) => patchFeishuBotRow(r.id, { bridgeWorkspacePath: e.target.value })}
                      placeholder={t('settings.messagingFeishuBridgeWorkspacePh')}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="cf-btn cf-btnGhost cf-btnSmall"
                      disabled={!activeWorkspacePath?.trim()}
                      onClick={() => patchFeishuBotRow(r.id, { bridgeWorkspacePath: activeWorkspacePath?.trim() ?? '' })}
                    >
                      {t('settings.messagingFeishuBridgeFillActive')}
                    </button>
                  </div>
                </div>
                <div className="cf-feishuField">
                  <label className="cf-sub">{t('settings.messagingFeishuBridgeConvId')}</label>
                  <input
                    className="cf-input"
                    value={r.bridgeConversationId}
                    onChange={(e) => patchFeishuBotRow(r.id, { bridgeConversationId: e.target.value })}
                    placeholder={t('settings.messagingFeishuBridgeConvIdPh')}
                    autoComplete="off"
                  />
                </div>
                <div className="cf-feishuField">
                  <label className="cf-sub">{t('settings.messagingFeishuBridgeSenderLabel')}</label>
                  <input
                    className="cf-input"
                    value={r.bridgeSenderLabel}
                    onChange={(e) => patchFeishuBotRow(r.id, { bridgeSenderLabel: e.target.value })}
                    placeholder={t('settings.messagingFeishuBridgeSenderLabelPh')}
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <details className="cf-feishuDiagnostics">
          <summary>{t('settings.messagingFeishuDiagnosticsTitle')}</summary>
          <div className="cf-feishuDiagnostics__body">
            <p className="cf-help">{t('settings.messagingFeishuDiagnosticsDesc')}</p>
            <div className="cf-feishuField">
              <label className="cf-sub">{t('settings.messagingFeishuReceiveIdType')}</label>
              <CfSelectWithHints
                className="cf-selectHint--wide"
                value={r.receiveIdType}
                onChange={(v) => patchFeishuBotRow(r.id, { receiveIdType: v as FeishuRecvUi })}
                options={feishuReceiveIdSelectOptions}
                hintIconAriaBase={t('common.selectOptionHintAria')}
                aria-label={t('settings.messagingFeishuReceiveIdType')}
              />
            </div>
            <div className="cf-feishuField">
              <label className="cf-sub">{t('settings.messagingFeishuDefaultReceiveId')}</label>
              <input
                className="cf-input"
                value={r.defaultReceiveId}
                onChange={(e) => patchFeishuBotRow(r.id, { defaultReceiveId: e.target.value })}
                placeholder={t('settings.messagingFeishuDefaultReceiveIdPh')}
                autoComplete="off"
              />
            </div>
            <div className="cf-feishuField">
              <label className="cf-sub">{t('settings.messagingFeishuTestMsgLabel')}</label>
              <textarea
                className="cf-textarea"
                rows={3}
                value={feishuTestText}
                onChange={(e) => setFeishuTestText(e.target.value)}
                placeholder={t('settings.messagingFeishuTestMsgPh')}
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall"
              disabled={feishuSendingBotId === r.id}
              onClick={() => void onSendFeishuTestMessage(r.id)}
            >
              {feishuSendingBotId === r.id ? t('settings.messagingFeishuSendingTest') : t('settings.messagingFeishuSendTest')}
            </button>
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="cf-card cf-feishuSettings">
      <div className="cf-feishuHero">
        <div className="cf-feishuHero__text">
          <h3>{t('settings.messagingFeishuTitle')}</h3>
          <p className="cf-feishuHero__lead">{t('settings.messagingFeishuOverviewLead')}</p>
        </div>
        {larkCliRuntime ? (
          <div
            className={`cf-feishuRuntimeBadge${larkCliRuntime.installed ? ' cf-feishuRuntimeBadge--ok' : ' cf-feishuRuntimeBadge--warn'}`}
            title={t('settings.messagingFeishuLarkCliStatus', {
              status: larkCliRuntime.installed
                ? t('settings.messagingFeishuLarkCliReady')
                : t('settings.messagingFeishuLarkCliMissing'),
              version: larkCliRuntime.version,
              source: larkCliSourceLabel,
            })}
          >
            <div>
              <span className="cf-feishuRuntimeBadge__dot" aria-hidden />
              lark-cli v{larkCliRuntime.version || '—'}
            </div>
            <span className="cf-feishuRuntimeBadge__sub">{larkCliSourceLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="cf-divider" />

      <div className="cf-feishuCapGrid">
        <article className="cf-feishuCap">
          <div className="cf-feishuCap__tag">{t('settings.messagingFeishuCapImTag')}</div>
          <h4>{t('settings.messagingFeishuCapImTitle')}</h4>
          <p>{t('settings.messagingFeishuCapImDesc')}</p>
        </article>
        <article className="cf-feishuCap">
          <div className="cf-feishuCap__tag">{t('settings.messagingFeishuCapDocsTag')}</div>
          <h4>{t('settings.messagingFeishuCapDocsTitle')}</h4>
          <p>{t('settings.messagingFeishuCapDocsDesc')}</p>
        </article>
        <article className="cf-feishuCap">
          <div className="cf-feishuCap__tag">{t('settings.messagingFeishuCapAgentTag')}</div>
          <h4>{t('settings.messagingFeishuCapAgentTitle')}</h4>
          <p>{t('settings.messagingFeishuCapAgentDesc')}</p>
        </article>
      </div>

      {feishuBots.length > 1 ? (
        <div className="cf-feishuBotTabs" role="tablist" aria-label={t('settings.messagingFeishuBotSelectLabel')}>
          {feishuBots.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={activeBot?.id === b.id}
              className={`cf-feishuBotTabs__btn${activeBot?.id === b.id ? ' cf-feishuBotTabs__btn--active' : ''}`}
              onClick={() => setActiveBotId(b.id)}
            >
              {b.name.trim() || t('settings.messagingFeishuDefaultBotName')}
            </button>
          ))}
        </div>
      ) : null}

      {activeBot ? renderBotPanel(activeBot) : (
        <div className="cf-help">{t('settings.messagingFeishuNoBots')}</div>
      )}

      <div className="cf-feishuSaveBar">
        <div className="cf-feishuSaveBar__hint">{t('settings.messagingFeishuSaveBarHint')}</div>
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={addFeishuBot}>
            {t('settings.messagingFeishuAddBot')}
          </button>
          <button
            type="button"
            className="cf-btn cf-btnPrimary cf-btnSmall"
            disabled={feishuSaving}
            onClick={() => void onSaveFeishuMessaging()}
          >
            {feishuSaving ? t('settings.messagingFeishuSaving') : t('settings.messagingFeishuSave')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeishuSettingsPanel;
