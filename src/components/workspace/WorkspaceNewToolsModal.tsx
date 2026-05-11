import { FC, useEffect, useState } from 'react';
import { Modal, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_WORKSPACE_TOOL_SELECTION,
  WORKSPACE_TOOL_IDS,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
} from '../../shared/workspace-tools';

export type WorkspaceToolsModalMode = 'create' | 'edit';

type Props = {
  open: boolean;
  folderPath: string | null;
  /** create：新建工作区默认全选；edit：从 `.tool/manifest.json` 读取 */
  mode?: WorkspaceToolsModalMode;
  onCancel: () => void;
  onConfirm: (tools: WorkspaceToolSelection) => void;
};

const WorkspaceNewToolsModal: FC<Props> = ({ open, folderPath, mode = 'create', onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const [sel, setSel] = useState<Record<WorkspaceToolId, boolean>>({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !folderPath) return;
    if (mode === 'create') {
      setSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const res = await window.electronAPI?.workspaceGetToolSelection?.(folderPath);
        if (res?.ok === true && res.tools) {
          setSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION, ...res.tools });
        } else {
          setSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
        }
      } catch {
        setSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, folderPath, mode]);

  const title = mode === 'create' ? t('workspace.newToolsTitle') : t('workspace.editToolsTitle');
  const intro = mode === 'create' ? t('workspace.newToolsIntro') : t('workspace.editToolsIntro');
  const okText = mode === 'create' ? t('workspace.newToolsConfirm') : t('common.save');

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={t('common.cancel')}
      onCancel={onCancel}
      onOk={() => onConfirm(sel)}
      confirmLoading={loading}
      destroyOnHidden
      width={520}
    >
      <p className="cf-sub" style={{ marginBottom: 12 }}>
        {intro}
      </p>
      {folderPath ? (
        <div className="cf-sub" style={{ marginBottom: 16, wordBreak: 'break-all', fontSize: 11 }}>
          {folderPath}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
        {WORKSPACE_TOOL_IDS.map((id) => (
          <Checkbox
            key={id}
            checked={sel[id]}
            disabled={loading}
            onChange={(e) => setSel((s) => ({ ...s, [id]: e.target.checked }))}
          >
            {t(`workspace.tool_${id}`)}
          </Checkbox>
        ))}
      </div>
    </Modal>
  );
};

export default WorkspaceNewToolsModal;
