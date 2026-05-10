import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useShellViewStore } from '../store/modules/shellViewStore';
import './viewModeFab.css';

export type ViewModeFabVariant = 'fab' | 'stickyBar';

type Props = {
  /** fab：左下角浮动；stickyBar：便签顶栏右上角紧凑按钮 */
  variant?: ViewModeFabVariant;
};

/**
 * 在标准布局与便签式布局之间切换。默认左下角浮动；便签模式下由顶栏嵌入。
 */
const ViewModeFab: FC<Props> = ({ variant = 'fab' }) => {
  const { t } = useTranslation();
  const mode = useShellViewStore((s) => s.mode);
  const toggleMode = useShellViewStore((s) => s.toggleMode);
  const isAlternate = mode === 'alternate';
  const stickyBar = variant === 'stickyBar';

  return (
    <button
      type="button"
      className={[
        'cf-viewModeFab',
        isAlternate ? 'cf-viewModeFab--alternate' : '',
        stickyBar ? 'cf-viewModeFab--stickyBar' : '',
      ]
        .filter(Boolean)
        .join(' ')}
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
      {!stickyBar ? <span className="cf-viewModeFab__label">{t('layout.viewMode.shortLabel')}</span> : null}
    </button>
  );
};

export default ViewModeFab;
