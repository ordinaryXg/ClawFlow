import { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';

const StatesPage: FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('states.title')}</h2>
          <p>{t('states.subtitle')}</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => (window as any).__cf_toast?.success?.(t('states.toastOkTitle'), t('states.toastOkBody'))}
          >
            {t('states.toastOk')}
          </button>
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => (window as any).__cf_toast?.error?.(t('states.toastErrTitle'), t('states.toastErrBody'))}
          >
            {t('states.toastErr')}
          </button>
        </div>
      </div>

      <section className="cf-grid">
        <div className="cf-card cf-col4">
          <h3>{t('states.card1Title')}</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cf-chip cf-chipUnknown">{t('gateway.statusUnknown')}</span>
            <button type="button" className="cf-btn cf-btnSmall">
              {t('common.refresh')}
            </button>
          </div>
          <div className="cf-divider" />
          <div className="cf-sub">{t('states.card1Body')}</div>
          <div style={{ height: 10 }} />
          <div className="cf-row">
            <a className="cf-btn cf-btnSmall" href="#/settings">
              {t('common.goSettings')}
            </a>
            <button type="button" className="cf-btn cf-btnSmall">
              {t('common.viewLogs')}
            </button>
          </div>
        </div>

        <div
          className="cf-card cf-col4"
          style={{ borderColor: 'rgba(138,106,42,.35)', background: 'linear-gradient(135deg,rgba(138,106,42,.16),rgba(255,255,255,.02))' }}
        >
          <h3>{t('states.card2Title')}</h3>
          <div className="cf-sub">
            <Trans
              i18nKey="states.card2Body"
              components={{ mono: <span style={{ fontFamily: 'var(--mono)' }} /> }}
            />
          </div>
          <div className="cf-divider" />
          <div className="cf-row">
            <a className="cf-btn cf-btnGold" href="#/settings">
              {t('states.setPath')}
            </a>
            <button type="button" className="cf-btn">
              {t('states.installGuide')}
            </button>
          </div>
          <div className="cf-help">{t('states.card2Hint')}</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>{t('states.card3Title')}</h3>
          <div className="cf-sub">{t('states.card3Body')}</div>
          <div className="cf-divider" />
          <button type="button" className="cf-btn cf-btnPrimary">
            {t('states.clearFilter')}
          </button>
          <div className="cf-help">{t('states.card3Hint')}</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>{t('states.card4Title')}</h3>
          <div className="cf-sub">{t('states.card4Fail')}</div>
          <div className="cf-divider" />
          <div className="cf-sub">{t('states.nextSteps')}</div>
          <div className="cf-sub">{t('states.stepToken')}</div>
          <div className="cf-sub">{t('states.stepNetwork')}</div>
          <div className="cf-sub">{t('states.stepLog')}</div>
          <div style={{ height: 10 }} />
          <div className="cf-row">
            <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall">
              {t('common.retry')}
            </button>
            <button type="button" className="cf-btn cf-btnSmall">
              {t('states.copyError')}
            </button>
            <button type="button" className="cf-btn cf-btnSmall">
              {t('common.viewLogs')}
            </button>
          </div>
        </div>

        <div className="cf-card cf-col4">
          <h3>{t('states.card5Title')}</h3>
          <div
            style={{
              height: 46,
              borderRadius: 12,
              background:
                'linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.08), rgba(255,255,255,.04))',
              backgroundSize: '240% 100%',
              border: '1px solid rgba(255,255,255,.04)',
            }}
          />
          <div style={{ height: 10 }} />
          <div style={{ height: 12, width: '76%', borderRadius: 12, background: 'rgba(255,255,255,.05)' }} />
          <div style={{ height: 8 }} />
          <div style={{ height: 12, width: '54%', borderRadius: 12, background: 'rgba(255,255,255,.05)' }} />
          <div style={{ height: 12 }} />
          <div className="cf-help">{t('states.card5Hint')}</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>{t('states.card6Title')}</h3>
          <div className="cf-sub">{t('states.card6Body')}</div>
          <div className="cf-divider" />
          <button type="button" className="cf-btn cf-btnPrimary">
            {t('common.retry')}
          </button>
          <button type="button" className="cf-btn">
            {t('states.offlineMode')}
          </button>
          <div className="cf-help">{t('states.card6Hint')}</div>
        </div>
      </section>
    </>
  );
};

export default StatesPage;
