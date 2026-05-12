import { FC, useMemo, useState } from 'react';
import { Modal, Tabs, Input, Button } from 'antd';
import { FolderOpenOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { deriveRepoFolderNameFromGitUrl } from '../../shared/workspace-git-url';

export type WorkspaceCreateModalProps = {
  open: boolean;
  onCancel: () => void;
  /** 选定本地路径或克隆成功后，进入工具配置 */
  onContinueToTools: (folderPath: string, opts?: { gitRemoteUrl?: string }) => void;
};

const WorkspaceCreateModal: FC<WorkspaceCreateModalProps> = ({ open, onCancel, onContinueToTools }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'local' | 'git'>('local');
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [gitParent, setGitParent] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  const clonePreviewName = useMemo(() => {
    const u = gitUrl.trim();
    if (!u) return '';
    try {
      return deriveRepoFolderNameFromGitUrl(u);
    } catch {
      return '';
    }
  }, [gitUrl]);

  const cloneDestPreview = useMemo(() => {
    if (!gitParent?.trim() || !clonePreviewName) return '';
    const sep = gitParent.includes('\\') ? '\\' : '/';
    return `${gitParent.replace(/[/\\]+$/, '')}${sep}${clonePreviewName}`;
  }, [gitParent, clonePreviewName]);

  const pickLocal = async () => {
    const p = await window.electronAPI?.workspacePickFolder?.({ title: t('workspace.createPickLocalTitle') });
    setLocalPath(p ?? null);
  };

  const pickGitParent = async () => {
    const p = await window.electronAPI?.workspacePickFolder?.({ title: t('workspace.createPickGitParentTitle') });
    setGitParent(p ?? null);
  };

  const canContinueLocal = Boolean(localPath?.trim());
  const canCloneGit = Boolean(gitUrl.trim() && gitParent?.trim());

  const onOkLocal = () => {
    const p = localPath?.trim();
    if (!p) return;
    setLocalPath(null);
    onContinueToTools(p);
  };

  const onCloneGit = async () => {
    const url = gitUrl.trim();
    const parent = gitParent?.trim();
    if (!url || !parent) return;
    setCloning(true);
    try {
      const res = await window.electronAPI?.workspaceGitClone?.({ remoteUrl: url, parentDir: parent });
      if (!res || typeof res !== 'object') {
        (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
          t('workspace.gitCloneFailedTitle'),
          'unknown'
        );
        return;
      }
      if ('ok' in res && res.ok === true && typeof (res as { dest?: string }).dest === 'string') {
        const dest = (res as { dest: string }).dest;
        setGitUrl('');
        setGitParent(null);
        onContinueToTools(dest, { gitRemoteUrl: url });
        return;
      }
      const err = 'error' in res ? String((res as { error?: string }).error ?? '') : 'clone_failed';
      (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
        t('workspace.gitCloneFailedTitle'),
        err
      );
    } finally {
      setCloning(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('workspace.createModalTitle')}
      onCancel={() => {
        if (!cloning) onCancel();
      }}
      footer={null}
      destroyOnHidden
      width={560}
      maskClosable={!cloning}
      closable={!cloning}
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'local' | 'git')}
        items={[
          {
            key: 'local',
            label: (
              <span>
                <FolderOpenOutlined /> {t('workspace.createTabLocal')}
              </span>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
                <p className="cf-sub" style={{ margin: 0 }}>
                  {t('workspace.createLocalHint')}
                </p>
                <Button onClick={() => void pickLocal()}>{t('workspace.createPickLocalBtn')}</Button>
                {localPath ? (
                  <div className="cf-sub" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                    {localPath}
                  </div>
                ) : null}
                <Button type="primary" disabled={!canContinueLocal} onClick={onOkLocal}>
                  {t('workspace.createContinueTools')}
                </Button>
              </div>
            ),
          },
          {
            key: 'git',
            label: (
              <span>
                <CloudDownloadOutlined /> {t('workspace.createTabGit')}
              </span>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
                <p className="cf-sub" style={{ margin: 0 }}>
                  {t('workspace.createGitHint')}
                </p>
                <Input
                  placeholder={t('workspace.createGitUrlPh')}
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  disabled={cloning}
                />
                <Button onClick={() => void pickGitParent()} disabled={cloning}>
                  {t('workspace.createPickGitParentBtn')}
                </Button>
                {gitParent ? (
                  <div className="cf-sub" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                    {t('workspace.createGitParentLabel')}: {gitParent}
                  </div>
                ) : null}
                {cloneDestPreview ? (
                  <div className="cf-sub" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                    {t('workspace.createGitDestPreview')}: {cloneDestPreview}
                  </div>
                ) : null}
                <Button type="primary" loading={cloning} disabled={!canCloneGit} onClick={() => void onCloneGit()}>
                  {t('workspace.createGitCloneBtn')}
                </Button>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default WorkspaceCreateModal;
