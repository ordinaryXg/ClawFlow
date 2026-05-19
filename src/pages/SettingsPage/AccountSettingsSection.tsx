import type { Dispatch, FC, SetStateAction } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { WORKSPACE_TOOL_IDS, type WorkspaceToolId } from '../../shared/workspace-tools';

type Props = {
  activeWorkspacePath: string | null;
  accountToolsSel: Record<WorkspaceToolId, boolean>;
  setAccountToolsSel: Dispatch<SetStateAction<Record<WorkspaceToolId, boolean>>>;
  accountToolsSaving: boolean;
  onSaveAccountWorkspaceTools: () => void | Promise<void>;
  appVersion: string;
};

const AccountSettingsSection: FC<Props> = ({
  activeWorkspacePath,
  accountToolsSel,
  setAccountToolsSel,
  accountToolsSaving,
  onSaveAccountWorkspaceTools,
  appVersion,
}) => {
  const { t } = useTranslation();

  return (
      <>
        <div className="cf-card">
          <h3>{t('settings.workspaceToolCapabilities')}</h3>
          <div className="cf-divider" />
          <p className="cf-sub" style={{ marginBottom: 12 }}>
            {t('settings.workspaceToolCapabilitiesHint')}
          </p>
          {!activeWorkspacePath?.trim() ? (
            <div className="cf-help">{t('settings.noWorkspaceSelected')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {WORKSPACE_TOOL_IDS.map((id) => (
                  <Checkbox
                    key={id}
                    checked={accountToolsSel[id]}
                    onChange={(e) => setAccountToolsSel((s) => ({ ...s, [id]: e.target.checked }))}
                  >
                    {t(`workspace.tool_${id}`)}
                  </Checkbox>
                ))}
              </div>
              <button
                className="cf-btn cf-btnPrimary"
                type="button"
                disabled={accountToolsSaving}
                onClick={() => void onSaveAccountWorkspaceTools()}
              >
                {t('settings.saveWorkspaceTools')}
              </button>
            </>
          )}
        </div>
        <div className="cf-card">
          <h3>{t('settings.about')}</h3>
          <div className="cf-divider" />
          <div className="cf-row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="cf-sub">
              <strong style={{ color: 'var(--text)' }}>{t('settings.appVersion')}</strong>
              ：{appVersion || '—'}
            </div>
          </div>
        </div>
      </>
  );
};

export default AccountSettingsSection;
