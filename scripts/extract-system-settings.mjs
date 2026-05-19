import fs from 'node:fs';

const indexPath = 'src/pages/SettingsPage/index.tsx';
const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);

// JSX: lines 1143-1608 (1-based) inside system branch
const jsxInner = lines.slice(1142, 1608).join('\n');

const header = `import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { CfSelectWithHints } from '../../components/CfSelectWithHints';
import { useSettingsStore } from '../../store/modules/settingsStore';
import {
  OUTBOUND_MERGE_WINDOW_PREFS_EVENT,
  setCachedOutboundMergeWindowMs,
} from '../../shared/outbound-merge-window-client';

type WebSearchProviderUi = 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';

const SystemSettingsSection: FC = () => {
  const { t } = useTranslation();
  const { theme, language, logLevel, closeButtonAction, uiFontSize, updateSettings } = useSettingsStore();

  const [appCacheSettings, setAppCacheSettings] = useState<{
    effectiveRoot: string;
    defaultRoot: string;
    configuredRoot: string | null;
  } | null>(null);
  const [appCacheBusy, setAppCacheBusy] = useState(false);

  const [wsEnabled, setWsEnabled] = useState(true);
  const [wsProvider, setWsProvider] = useState<WebSearchProviderUi>('searxng');
  const [wsBochaBase, setWsBochaBase] = useState('');
  const [wsBraveBase, setWsBraveBase] = useState('');
  const [wsSearxBase, setWsSearxBase] = useState('');
  const [wsTimeout, setWsTimeout] = useState(25);
  const [wsBochaKeyDraft, setWsBochaKeyDraft] = useState('');
  const [wsBraveKeyDraft, setWsBraveKeyDraft] = useState('');
  const [wsSearxKeyDraft, setWsSearxKeyDraft] = useState('');
  const [wsBochaSavedInFile, setWsBochaSavedInFile] = useState(false);
  const [wsBraveSavedInFile, setWsBraveSavedInFile] = useState(false);
  const [wsSearxKeySavedInFile, setWsSearxKeySavedInFile] = useState(false);
  const [wsBochaConfigured, setWsBochaConfigured] = useState(false);
  const [wsBraveConfigured, setWsBraveConfigured] = useState(false);
  const [wsSearxKeyConfigured, setWsSearxKeyConfigured] = useState(false);
  const [wsClearBochaOnSave, setWsClearBochaOnSave] = useState(false);
  const [wsClearBraveOnSave, setWsClearBraveOnSave] = useState(false);
  const [wsClearSearxOnSave, setWsClearSearxOnSave] = useState(false);

  const [toolLoopSteps, setToolLoopSteps] = useState(9);
  const [toolLoopStepsMin, setToolLoopStepsMin] = useState(1);
  const [toolLoopStepsMax, setToolLoopStepsMax] = useState(24);
  const [toolLoopStepsDefault, setToolLoopStepsDefault] = useState(9);
  const [outboundMergeWindowMs, setOutboundMergeWindowMs] = useState(3000);
  const [outboundMergeWindowMin, setOutboundMergeWindowMin] = useState(500);
  const [outboundMergeWindowMax, setOutboundMergeWindowMax] = useState(60_000);
  const [outboundMergeWindowDefault, setOutboundMergeWindowDefault] = useState(3000);
  const [engineRuntimeSaving, setEngineRuntimeSaving] = useState(false);

`;

// Handlers block from index - we'll read from file between markers
const indexSrc = fs.readFileSync(indexPath, 'utf8');
const handlerStart = indexSrc.indexOf('  const onSaveEngineRuntimeSettings = async () => {');
const handlerEnd = indexSrc.indexOf('  const onConfirmWorkspaceTools = async', handlerStart);
const handlers = indexSrc.slice(handlerStart, handlerEnd);

const useEffectBlock = indexSrc.match(
  /  useEffect\(\(\) => \{[\s\r\n]+    if \(activeSection !== 'system'\) return;[\s\S]*?  \}, \[activeSection\]\);/
);
if (!useEffectBlock) {
  console.error('useEffect block missing');
  process.exit(1);
}
const mountEffect = useEffectBlock[0].replace(
  /if \(activeSection !== 'system'\) return;\n    /,
  ''
).replace('}, [activeSection]);', '}, []);');

const selectOptions = indexSrc.match(
  /  const logLevelSelectOptions = useMemo\([\s\S]*?  const webSearchProviderSelectOptions = useMemo\([\s\S]*?\n  \);/
);
if (!selectOptions) {
  console.error('select options missing');
  process.exit(1);
}

const footer = `
  return (
${jsxInner}
  );
};

export default SystemSettingsSection;
`;

fs.writeFileSync(
  'src/pages/SettingsPage/SystemSettingsSection.tsx',
  header + mountEffect + '\n\n' + handlers + '\n\n' + selectOptions[0] + footer
);

// Replace system branch in index
let s = indexSrc;
s = s.replace(
  /  \} else if \(activeSection === 'system'\) \{[\s\S]*?  \} else if \(activeSection === 'memory'\) \{/,
  `  } else if (activeSection === 'system') {
    detailPanels = <SystemSettingsSection />;
  } else if (activeSection === 'memory') {`
);

if (!s.includes('SystemSettingsSection')) {
  console.error('index replace failed');
  process.exit(1);
}

if (!s.includes("import SystemSettingsSection")) {
  s = s.replace(
    "import HelpSettingsSection from './HelpSettingsSection';",
    "import HelpSettingsSection from './HelpSettingsSection';\nimport SystemSettingsSection from './SystemSettingsSection';"
  );
}

// Remove system-only state from index (lines 67-102 appCache and ws and engine - careful)
// Remove useEffect for system, handlers, select options - use regex
s = s.replace(useEffectBlock[0] + '\n\n', '');
s = s.replace(handlerStart + indexSrc.slice(handlerStart, handlerEnd), '');
s = s.replace(selectOptions[0] + '\n\n', '');

// Remove duplicate state declarations at top - appCache through engineRuntimeSaving
s = s.replace(
  /\n  const \[appCacheSettings[\s\S]*?const \[engineRuntimeSaving, setEngineRuntimeSaving\] = useState\(false\);\n/,
  '\n'
);

// Remove WebSearchProviderUi type if only used in system
s = s.replace(/\n  type WebSearchProviderUi = [^\n]+;\n/g, '\n');

fs.writeFileSync(indexPath, s);
console.log('system section extracted');
