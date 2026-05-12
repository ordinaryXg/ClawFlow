import { FC } from 'react';
import ViewModeFab from './ViewModeFab';
import IntelligenceProfileButton from './IntelligenceProfileButton';
import './bottomShellFabs.css';

/**
 * 左下角固定条：智能档案（人物） + 视图模式切换。
 */
const BottomShellFabs: FC = () => {
  return (
    <div className="cf-bottomShellFabs">
      <IntelligenceProfileButton variant="fab" />
      <ViewModeFab />
    </div>
  );
};

export default BottomShellFabs;
