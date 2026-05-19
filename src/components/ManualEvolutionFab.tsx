import { FC, useCallback, useRef, useState } from 'react';
import { LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useChatStore } from '../store/modules/chatStore';
import './manualEvolutionFab.css';

type ToastApi = {
  success?: (title: string, body?: string) => void;
  error?: (title: string, body?: string) => void;
};

function toastApi(): ToastApi | undefined {
  return (window as unknown as { __cf_toast?: ToastApi }).__cf_toast;
}

export type ManualEvolutionFabVariant = 'fab' | 'dock';

type Props = {
  variant?: ManualEvolutionFabVariant;
};

const ManualEvolutionFab: FC<Props> = ({ variant = 'fab' }) => {
  const { t } = useTranslation();
  const activePath = useWorkspaceStore((s) => s.activePath);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    const toast = toastApi();
    if (!activePath?.trim()) {
      toast?.error?.(t('layout.evolutionTest.errTitle'), t('layout.evolutionTest.err_no_workspace'));
      return;
    }
    runningRef.current = true;
    setBusy(true);
    toast?.success?.(t('layout.evolutionTest.runningTitle'), t('layout.evolutionTest.runningBody'));
    try {
      const res = (await window.electronAPI?.intelligenceTriggerEvolutionTest?.({
        conversationId: activeConversationId ?? undefined,
      })) as { ok?: boolean; error?: string } | undefined;
      if (!res || res.ok !== true) {
        const key = String(res?.error ?? '').trim();
        const mapped =
          key === 'no_workspace'
            ? t('layout.evolutionTest.err_no_workspace')
            : key === 'skills_disabled'
              ? t('layout.evolutionTest.err_skills_disabled')
              : key === 'no_conversation'
                ? t('layout.evolutionTest.err_no_conversation')
                : key === 'slot_already_running'
                  ? t('layout.evolutionTest.err_slot_already_running')
                  : key === 'evolution_timeout'
                    ? t('layout.evolutionTest.err_evolution_timeout')
                    : key && key !== 'run_failed'
                      ? key.slice(0, 2000)
                      : t('layout.evolutionTest.err_generic');
        toast?.error?.(t('layout.evolutionTest.errTitle'), mapped);
        return;
      }
      toast?.success?.(t('layout.evolutionTest.okTitle'), t('layout.evolutionTest.okBody'));
      window.dispatchEvent(new CustomEvent('cf-intelligence-profile-reload'));
      window.dispatchEvent(new CustomEvent('cf-workspace-changelog-updated'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('layout.evolutionTest.err_generic');
      toastApi()?.error?.(t('layout.evolutionTest.errTitle'), msg);
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [activePath, activeConversationId, t]);

  const dock = variant === 'dock';

  return (
    <button
      type="button"
      className={['cf-manualEvolutionFab', dock ? 'cf-manualEvolutionFab--dock' : ''].filter(Boolean).join(' ')}
      aria-label={t('layout.evolutionTest.aria')}
      title={t('layout.evolutionTest.title')}
      disabled={busy || !activePath?.trim()}
      onClick={() => void run()}
    >
      <span className="cf-manualEvolutionFab__inner">
        {busy ? <LoadingOutlined aria-hidden /> : <ThunderboltOutlined aria-hidden />}
        {dock ? (
          <span className="cf-manualEvolutionFab__dockLabel">{t('layout.evolutionTest.dockLabel')}</span>
        ) : (
          <span className="cf-manualEvolutionFab__label">{t('layout.evolutionTest.shortLabel')}</span>
        )}
      </span>
    </button>
  );
};

export default ManualEvolutionFab;
