import { FC } from 'react';
import HermesSkillsBrowser from './HermesSkillsBrowser';
import EvolutionRunsPanel from './EvolutionRunsPanel';

type Props = {
  workspacePath: string | null;
};

/** 聊天侧栏「技能」分支：只读浏览 `.agent/.skills` */
const SkillsHubPanel: FC<Props> = ({ workspacePath }) => {
  return (
    <div className="cf-hubPage">
      <HermesSkillsBrowser workspacePath={workspacePath} layout="hub" />
      <EvolutionRunsPanel workspacePath={workspacePath} />
    </div>
  );
};

export default SkillsHubPanel;
