import { FC } from 'react';
import ViewModeFab from './ViewModeFab';
import IntelligenceProfileButton from './IntelligenceProfileButton';
import ManualEvolutionFab from './ManualEvolutionFab';
import './bottomShellFabs.css';

/**
 * 左下角固定条：主动进化（测试）+ 智能档案（人物） + 视图模式切换。
 */
const BottomShellFabs: FC = () => {
  return (
    <div className="cf-bottomShellFabs">
      <ManualEvolutionFab variant="fab" />
      <IntelligenceProfileButton variant="fab" />
      <ViewModeFab />
    </div>
  );
};

export default BottomShellFabs;
