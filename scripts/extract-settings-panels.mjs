import fs from 'node:fs';

const indexPath = 'src/pages/SettingsPage/index.tsx';
const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);

function sliceLines(start1, end1) {
  return lines.slice(start1 - 1, end1).join('\n');
}

const accountJsx = sliceLines(1127, 1170);
fs.writeFileSync(
  'src/pages/SettingsPage/AccountSettingsSection.tsx',
  `import type { Dispatch, FC, SetStateAction } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { WORKSPACE_TOOL_IDS, type WorkspaceToolId } from '../../shared/workspace-tools';

type Props = {
  activeWorkspacePath: string | null;
  accountToolsSel: Record<WorkspaceToolId, boolean>;
  setAccountToolsSel: Dispatch<SetStateAction<Record<WorkspaceToolId, boolean>>>;
  accountToolsSaving: boolean;
  onSaveAccountWorkspaceTools: () => void | Promise<void>;
  appVersion: string;
};

const AccountSettingsSection: FC<Props> = ({
  activeWorkspacePath,
  accountToolsSel,
  setAccountToolsSel,
  accountToolsSaving,
  onSaveAccountWorkspaceTools,
  appVersion,
}) => {
  const { t } = useTranslation();

  return (
${accountJsx}
  );
};

export default AccountSettingsSection;
`
);

const dataJsx = sliceLines(1967, 1978);
fs.writeFileSync(
  'src/pages/SettingsPage/DataSettingsSection.tsx',
  `import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { activeWorkspacePath: string | null };

const DataSettingsSection: FC<Props> = ({ activeWorkspacePath }) => {
  const { t } = useTranslation();
  return (
${dataJsx}
  );
};

export default DataSettingsSection;
`
);

const helpJsx = sliceLines(1982, 2015);
fs.writeFileSync(
  'src/pages/SettingsPage/HelpSettingsSection.tsx',
  `import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { appVersion: string };

const HelpSettingsSection: FC<Props> = ({ appVersion }) => {
  const { t } = useTranslation();
  return (
${helpJsx}
  );
};

export default HelpSettingsSection;
`
);

console.log('settings panels written');
