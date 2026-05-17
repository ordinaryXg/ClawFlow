import { FC, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

type Props = {
  visible?: boolean;
};

const Titlebar: FC<Props> = ({ visible = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const menuFile: MenuProps = useMemo(
    () => ({
      items: [
        {
          key: 'quit',
          label: t('titlebar.quit'),
          onClick: () => void window.electronAPI?.quitApp?.(),
        },
      ],
    }),
    [t]
  );

  const menuEdit: MenuProps = useMemo(
    () => ({
      items: [
        { key: 'undo', label: t('titlebar.undo'), onClick: () => void window.electronAPI?.windowUndo?.() },
        { key: 'redo', label: t('titlebar.redo'), onClick: () => void window.electronAPI?.windowRedo?.() },
        { type: 'divider' },
        { key: 'cut', label: t('titlebar.cut'), onClick: () => void window.electronAPI?.windowCut?.() },
        { key: 'copy', label: t('titlebar.copy'), onClick: () => void window.electronAPI?.windowCopy?.() },
        { key: 'paste', label: t('titlebar.paste'), onClick: () => void window.electronAPI?.windowPaste?.() },
        { type: 'divider' },
        { key: 'selectAll', label: t('titlebar.selectAll'), onClick: () => void window.electronAPI?.windowSelectAll?.() },
      ],
    }),
    [t]
  );

  const menuView: MenuProps = useMemo(
    () => ({
      items: [
        { key: 'chat', label: t('nav.chat'), onClick: () => navigate('/chat') },
        { key: 'skills', label: t('nav.skills'), onClick: () => navigate('/skills') },
        { key: 'settings', label: t('nav.settings'), onClick: () => navigate('/settings') },
        { type: 'divider' },
        { key: 'reload', label: t('titlebar.reload'), onClick: () => void window.electronAPI?.windowReload?.() },
        { key: 'devtools', label: t('titlebar.toggleDevTools'), onClick: () => void window.electronAPI?.windowToggleDevTools?.() },
      ],
    }),
    [navigate, t]
  );

  const menuWindow: MenuProps = useMemo(
    () => ({
      items: [
        { key: 'min', label: t('titlebar.minimize'), onClick: () => void window.electronAPI?.windowMinimize?.() },
        { key: 'max', label: t('titlebar.toggleMaximize'), onClick: () => void window.electronAPI?.windowToggleMaximize?.() },
        { key: 'close', label: t('titlebar.closeWindow'), onClick: () => void window.electronAPI?.windowClose?.() },
      ],
    }),
    [t]
  );

  const menuHelp: MenuProps = useMemo(
    () => ({
      items: [
        {
          key: 'docs',
          label: t('titlebar.helpDocs'),
          onClick: () => window.open('https://electronjs.org', '_blank'),
        },
      ],
    }),
    [t]
  );

  const onTitleBarDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    void window.electronAPI?.windowToggleMaximize?.();
  }, []);

  if (!visible) return null;

  return (
    <div className="cf-titlebar" onDoubleClick={onTitleBarDoubleClick}>
      <div className="cf-titlebar__left">
        <div className="cf-titlebar__brand" onClick={() => navigate('/chat')} role="button" tabIndex={0}>
          <div className="cf-brandBadge" />
          <span className="cf-titlebar__name">ClawFlow</span>
        </div>
      </div>

      <div className="cf-titlebar__menus">
        <Dropdown menu={menuFile} trigger={['click']}>
          <button className="cf-titlebar__menuBtn" type="button">
            {t('titlebar.file')}
          </button>
        </Dropdown>
        <Dropdown menu={menuEdit} trigger={['click']}>
          <button className="cf-titlebar__menuBtn" type="button">
            {t('titlebar.edit')}
          </button>
        </Dropdown>
        <Dropdown menu={menuView} trigger={['click']}>
          <button className="cf-titlebar__menuBtn" type="button">
            {t('titlebar.view')}
          </button>
        </Dropdown>
        <Dropdown menu={menuWindow} trigger={['click']}>
          <button className="cf-titlebar__menuBtn" type="button">
            {t('titlebar.window')}
          </button>
        </Dropdown>
        <Dropdown menu={menuHelp} trigger={['click']}>
          <button className="cf-titlebar__menuBtn" type="button">
            {t('titlebar.help')}
          </button>
        </Dropdown>
      </div>

      <div className="cf-titlebar__spacer" />

      <div className="cf-titlebar__winBtns">
        <button className="cf-titlebar__winBtn" type="button" onClick={() => void window.electronAPI?.windowMinimize?.()}>
          —
        </button>
        <button className="cf-titlebar__winBtn" type="button" onClick={() => void window.electronAPI?.windowToggleMaximize?.()}>
          □
        </button>
        <button className="cf-titlebar__winBtn cf-titlebar__winBtn--danger" type="button" onClick={() => void window.electronAPI?.windowClose?.()}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default Titlebar;
