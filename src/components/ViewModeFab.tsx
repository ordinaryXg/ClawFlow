import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useShellViewStore } from '../store/modules/shellViewStore';
import './viewModeFab.css';

/**
 * 左下角浮动按钮：在标准布局与备用视图模式之间切换（备用模式的具体呈现待产品定义）。
 */
const ViewModeFab: FC = () => {
  const { t } = useTranslation();
  const mode = useShellViewStore((s) => s.mode);
  const toggleMode = useShellViewStore((s) => s.toggleMode);
  const isAlternate = mode === 'alternate';

  return (
    <button
      type="button"
      className={`cf-viewModeFab${isAlternate ? ' cf-viewModeFab--alternate' : ''}`}
      onClick={toggleMode}
      aria-pressed={isAlternate}
      title={
        isAlternate ? t('layout.viewMode.switchToStandard') : t('layout.viewMode.switchToAlternate')
      }
    >
      <span className="cf-viewModeFab__glyph" aria-hidden>
        <span className="cf-viewModeFab__square" />
        <span className="cf-viewModeFab__square cf-viewModeFab__square--back" />
      </span>
      <span className="cf-viewModeFab__label">{t('layout.viewMode.shortLabel')}</span>
    </button>
  );
};

export default ViewModeFab;
