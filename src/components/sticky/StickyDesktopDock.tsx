import { FC, useCallback } from 'react';
import { SwapOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  STICKY_LAUNCHER_MIME,
  type StickyLauncherDragPayloadV1,
} from '../../shared/sticky-launcher-items';
import './stickyDesktopDock.css';

function setLauncherDragData(e: React.DragEvent, payload: StickyLauncherDragPayloadV1): void {
  const json = JSON.stringify(payload);
  e.dataTransfer.setData(STICKY_LAUNCHER_MIME, json);
  e.dataTransfer.setData('text/plain', payload.label);
  e.dataTransfer.effectAllowed = 'copy';
}

/**
 * 便签模式下显示在视口左下角：与标准模式左下角 FAB 同源能力，支持拖入工作区文件栏做「图标收纳」。
 */
const StickyDesktopDock: FC = () => {
  const { t } = useTranslation();

  const onDragIntelStart = useCallback((e: React.DragEvent) => {
    setLauncherDragData(e, {
      version: 1,
      kind: 'builtin',
      builtinId: 'intelligence',
      label: t('layout.intelligence.title'),
    });
  }, [t]);

  const onDragViewStart = useCallback((e: React.DragEvent) => {
    setLauncherDragData(e, {
      version: 1,
      kind: 'builtin',
      builtinId: 'viewMode',
      label: t('layout.viewMode.shortLabel'),
    });
  }, [t]);

  return (
    <aside className="cf-stickyDesktopDock" aria-label={t('sticky.dockAria')}>
      <div
        className="cf-stickyDesktopDock__chip"
        draggable
        onDragStart={onDragIntelStart}
        title={t('sticky.dockDragHint')}
      >
        <UserOutlined className="cf-stickyDesktopDock__ico" aria-hidden />
        <span className="cf-stickyDesktopDock__label">{t('sticky.dockIntelLabel')}</span>
      </div>
      <div
        className="cf-stickyDesktopDock__chip"
        draggable
        onDragStart={onDragViewStart}
        title={t('sticky.dockDragHint')}
      >
        <SwapOutlined className="cf-stickyDesktopDock__ico" aria-hidden />
        <span className="cf-stickyDesktopDock__label">{t('sticky.dockViewLabel')}</span>
      </div>
    </aside>
  );
};

export default StickyDesktopDock;
