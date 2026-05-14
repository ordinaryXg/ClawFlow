import { FC, useCallback, useEffect, useState } from 'react';
import { Popover } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import './bottomShellFabs.css';

export type IntelligenceFabVariant = 'fab' | 'stickyBar';

type ProfileOk = {
  ok: true;
  xp: number;
  level: number;
  progress01: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalUserManualRounds: number;
  lastEvolutionAtMs?: number;
};

type Props = {
  variant?: IntelligenceFabVariant;
};

const IntelligenceProfileButton: FC<Props> = ({ variant = 'fab' }) => {
  const { t } = useTranslation();
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [data, setData] = useState<ProfileOk | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activePath?.trim()) {
      setData(null);
      setErr(null);
      return;
    }
    try {
      const res = (await window.electronAPI?.intelligenceGetProfile?.()) as
        | ProfileOk
        | { ok: false; error?: string }
        | undefined;
      if (!res || typeof res !== 'object') {
        setErr(t('layout.intelligence.loadError'));
        setData(null);
        return;
      }
      if (!('ok' in res) || !res.ok) {
        setErr(String((res as { error?: string }).error ?? t('layout.intelligence.loadError')));
        setData(null);
        return;
      }
      setErr(null);
      setData(res as ProfileOk);
    } catch {
      setErr(t('layout.intelligence.loadError'));
      setData(null);
    }
  }, [activePath, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = window.electronAPI?.onWorkspaceChanged?.(() => void load());
    return () => off?.();
  }, [load]);

  useEffect(() => {
    const onReload = () => void load();
    window.addEventListener('cf-intelligence-profile-reload', onReload);
    return () => window.removeEventListener('cf-intelligence-profile-reload', onReload);
  }, [load]);

  const stickyBar = variant === 'stickyBar';
  const level = data?.level ?? 1;
  const progress = data && data.level < 100 ? Math.round(data.progress01 * 100) : 100;

  const popContent = !activePath?.trim() ? (
    <div className="cf-intelligencePopover">
      <div className="cf-intelligencePopover__row">{t('layout.intelligence.noWorkspace')}</div>
    </div>
  ) : err ? (
    <div className="cf-intelligencePopover">
      <div className="cf-intelligencePopover__row">{err}</div>
    </div>
  ) : data ? (
    <div className="cf-intelligencePopover">
      <div className="cf-intelligencePopover__title">{t('layout.intelligence.title')}</div>
      <div className="cf-intelligencePopover__row">{t('layout.intelligence.level', { level: data.level })}</div>
      <div className="cf-intelligencePopover__row">{t('layout.intelligence.xp', { xp: data.xp })}</div>
      <div className="cf-intelligencePopover__row">
        {data.level >= 100
          ? t('layout.intelligence.maxLevel')
          : t('layout.intelligence.nextXp', { n: Math.max(0, Math.ceil(data.xpForNext)) })}
      </div>
      <div className="cf-intelligencePopover__row">
        {t('layout.intelligence.rounds', { n: data.totalUserManualRounds })}
      </div>
      <div className="cf-intelligencePopover__bar" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  ) : (
    <div className="cf-intelligencePopover">
      <div className="cf-intelligencePopover__row">{t('layout.intelligence.loading')}</div>
    </div>
  );

  const title = t('layout.intelligence.title');
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setPopoverOpen(true);
    window.addEventListener('cf-open-intelligence-popover', onOpen);
    return () => window.removeEventListener('cf-open-intelligence-popover', onOpen);
  }, []);

  return (
    <Popover
      content={popContent}
      title={null}
      trigger="click"
      placement="topLeft"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
    >
      <button
        type="button"
        className={['cf-intelligenceFab', stickyBar ? 'cf-intelligenceFab--stickyBar' : ''].filter(Boolean).join(' ')}
        aria-label={title}
        title={title}
      >
        <span className="cf-intelligenceFab__inner">
          <UserOutlined />
          {!stickyBar ? <span className="cf-intelligenceFab__lv">Lv.{level}</span> : <span className="cf-intelligenceFab__lv">{level}</span>}
        </span>
      </button>
    </Popover>
  );
};

export default IntelligenceProfileButton;
