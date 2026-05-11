import { FC } from 'react';
import HermesSkillsBrowser from './HermesSkillsBrowser';

type Props = {
  workspacePath: string | null;
};

/** 聊天侧栏「技能」分支：只读浏览 `.clawflow/skills` */
const SkillsHubPanel: FC<Props> = ({ workspacePath }) => {
  return (
    <div className="cf-hubPage">
      <HermesSkillsBrowser workspacePath={workspacePath} layout="hub" />
    </div>
  );
};

export default SkillsHubPanel;
