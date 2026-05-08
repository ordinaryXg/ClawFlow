import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConnectorStore } from '../store/modules/connectorStore';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useSkillStore } from '../store/modules/skillStore';

const DashboardPage: FC = () => {
  const { t } = useTranslation();
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliError, setCliError] = useState<string>('');

  const navigate = useNavigate();

  const {
    status: gatewayStatus,
    version,
    isStarting,
    isStopping,
    error: gatewayError,
    fetchStatus,
    fetchVersion,
    startGateway,
    stopGateway,
  } = useGatewayStore();

  const { skills, fetchSkills, error: skillError, isLoading: isSkillLoading } = useSkillStore();
  const {
    connectors,
    fetchConnectors,
    error: connectorError,
    isLoading: isConnectorLoading,
  } = useConnectorStore();

  const installedSkillsCount = useMemo(
    () => skills.filter((s) => s.installed).length,
    [skills]
  );
  const enabledSkillsCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills]);
  const connectorsCount = connectors.length;

  useEffect(() => {
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : t('dashboard.cliNotInPath'));
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError(t('dashboard.cliCheckFailed'));
        });
    }

    fetchVersion();
    fetchStatus();
    fetchSkills();
    fetchConnectors();
  }, [fetchConnectors, fetchSkills, fetchStatus, fetchVersion, t]);

  const gatewayChip = useMemo(() => {
    if (gatewayStatus === 'running')
      return <span className="cf-chip cf-chipRunning">{t('gateway.statusRunning')}</span>;
    if (gatewayStatus === 'stopped')
      return <span className="cf-chip cf-chipStopped">{t('gateway.statusStopped')}</span>;
    return <span className="cf-chip cf-chipUnknown">{t('gateway.statusUnknown')}</span>;
  }, [gatewayStatus, t]);

  const canOperateGateway = cliAvailable !== false;

  const handleStartGateway = async () => {
    if (!canOperateGateway) return;
    try {
      await startGateway();
      await fetchStatus();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('gateway.startOkBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('gateway.startFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const handleStopGateway = async () => {
    if (!canOperateGateway) return;
    await stopGateway();
    await fetchStatus();
  };

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('dashboard.title')}</h2>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => {
              fetchVersion();
              fetchStatus();
              fetchSkills();
              fetchConnectors();
              (window as any).__cf_toast?.success?.(t('common.toastRefreshOkTitle'), t('common.toastRefreshOkBody'));
            }}
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {cliAvailable === false ? (
        <div className="cf-banner">
          <div>
            <b>{t('dashboard.noOpenClaw')}</b>
            <span>{cliError || t('dashboard.cliNotInPath')}</span>
          </div>
          <button className="cf-btn cf-btnGold" onClick={() => navigate('/settings')}>
            {t('dashboard.goSetPath')}
          </button>
        </div>
      ) : null}

      {(gatewayError || skillError || connectorError) && cliAvailable !== false ? (
        <div
          className="cf-banner"
          style={{
            marginTop: 12,
            borderColor: 'rgba(194,75,75,.45)',
            background: 'rgba(194,75,75,.10)',
          }}
        >
          <div>
            <b>{t('dashboard.partialLoadFailed')}</b>
            <span>
              {gatewayError ? `${t('dashboard.errGateway')}${gatewayError} ` : ''}
              {skillError ? `${t('dashboard.errSkills')}${skillError} ` : ''}
              {connectorError ? `${t('dashboard.errConnectors')}${connectorError}` : ''}
            </span>
          </div>
          <button
            className="cf-btn cf-btnDanger"
            onClick={() =>
              (window as any).__cf_toast?.error?.(t('dashboard.suggestTitle'), t('dashboard.suggestBody'))
            }
          >
            {t('dashboard.suggestTitle')}
          </button>
        </div>
      ) : null}

      <section className="cf-grid" style={{ marginTop: 12 }}>
        <div className="cf-card cf-col4">
          <h3>{t('dashboard.openclawVersion')}</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cf-sub">
              {cliAvailable === false ? t('dashboard.notInstalled') : version || t('dashboard.checking')}
            </span>
            <button className="cf-btn cf-btnSmall" onClick={() => void fetchVersion()}>
              {t('dashboard.recheck')}
            </button>
          </div>
          <div className="cf-divider" />
          <div className="cf-sub">{t('dashboard.missingHint')}</div>
        </div>

        <div className="cf-card cf-col8">
          <h3>{t('dashboard.gatewayStatus')}</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="cf-row" style={{ alignItems: 'center', gap: 10 }}>
              {gatewayChip}
              <span className="cf-sub">
                {isStarting
                  ? t('dashboard.starting')
                  : isStopping
                    ? t('dashboard.stopping')
                    : t('dashboard.statusSource')}
              </span>
            </div>
            <div className="cf-row">
              <button className="cf-btn" onClick={() => void fetchStatus()}>
                {t('dashboard.refreshStatus')}
              </button>
              <button
                className="cf-btn cf-btnPrimary"
                disabled={!canOperateGateway || gatewayStatus === 'running' || isStopping || isStarting}
                onClick={() => void handleStartGateway()}
              >
                {t('dashboard.startGateway')}
              </button>
              <button
                className="cf-btn cf-btnDanger"
                disabled={!canOperateGateway || gatewayStatus === 'stopped' || isStopping || isStarting}
                onClick={() => void handleStopGateway()}
              >
                {t('dashboard.stop')}
              </button>
            </div>
          </div>

          <div className="cf-divider" />

          <div className="cf-grid">
            <div className="cf-card cf-col4">
              <h3>{t('dashboard.overview')}</h3>
              <div className="cf-sub">
                {t('dashboard.skillsCount')}：{installedSkillsCount} / {enabledSkillsCount}
                {isSkillLoading ? ` · ${t('dashboard.loading')}` : ''}
              </div>
              <div className="cf-sub">
                {t('dashboard.connectorsCount')}：{connectorsCount}
                {isConnectorLoading ? ` · ${t('dashboard.loading')}` : ''}
              </div>
            </div>
            <div className="cf-card cf-col8">
              <h3>{t('dashboard.quickLinks')}</h3>
              <div className="cf-row">
                <button className="cf-btn cf-btnPrimary" onClick={() => navigate('/chat')}>
                  {t('dashboard.enterChat')}
                </button>
                <button className="cf-btn" onClick={() => navigate('/skills')}>
                  {t('dashboard.manageSkills')}
                </button>
                <button className="cf-btn" onClick={() => navigate('/connectors')}>
                  {t('dashboard.manageConnectors')}
                </button>
                <button className="cf-btn" onClick={() => navigate('/settings')}>
                  {t('dashboard.openSettings')}
                </button>
              </div>
              <div className="cf-help">{t('dashboard.goalHint')}</div>
            </div>
          </div>
        </div>

        <div className="cf-card cf-col12">
          <h3>{t('dashboard.systemOverview')}</h3>
          <div className="cf-sub">{t('dashboard.systemOverviewSub')}</div>
          <div className="cf-divider" />
          <div className="cf-grid">
            <div className="cf-card cf-col4">
              <h3>{t('dashboard.moduleChat')}</h3>
              <div className="cf-sub">{t('dashboard.moduleChatSub')}</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/chat')}>
                {t('dashboard.goChat')}
              </button>
            </div>
            <div className="cf-card cf-col4">
              <h3>{t('dashboard.moduleSkills')}</h3>
              <div className="cf-sub">{t('dashboard.moduleSkillsSub')}</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/skills')}>
                {t('dashboard.goSkills')}
              </button>
            </div>
            <div className="cf-card cf-col4">
              <h3>{t('dashboard.moduleConnectors')}</h3>
              <div className="cf-sub">{t('dashboard.moduleConnectorsSub')}</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/connectors')}>
                {t('dashboard.goConnectors')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default DashboardPage;
