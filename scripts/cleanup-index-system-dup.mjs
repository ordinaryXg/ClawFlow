import fs from 'node:fs';

const indexPath = 'src/pages/SettingsPage/index.tsx';
let s = fs.readFileSync(indexPath, 'utf8');

s = s.replace(
  /\n  const \[appCacheSettings[\s\S]*?const \[engineRuntimeSaving, setEngineRuntimeSaving\] = useState\(false\);\n/,
  '\n'
);
s = s.replace(/\n  type WebSearchProviderUi = [^\n]+;\n/, '\n');

s = s.replace(
  /  useEffect\(\(\) => \{[\s\r\n]+    if \(activeSection !== 'system'\) return;[\s\S]*?  \}, \[activeSection\]\);\n\n/,
  ''
);

s = s.replace(
  /  const onSaveEngineRuntimeSettings = async \(\) => \{[\s\S]*?  const onResetAppCacheRoot = async \(\) => \{[\s\S]*?  \};\n\n/,
  ''
);

s = s.replace(
  /  const logLevelSelectOptions = useMemo\([\s\S]*?  const webSearchProviderSelectOptions = useMemo\([\s\S]*?\n  \);\n\n/,
  ''
);

s = s.replace(
  /  const \{\n    theme,\n    language,\n    logLevel,\n    closeButtonAction,\n    uiFontSize,\n    updateSettings,\n  \} = useSettingsStore\(\);/,
  '  const { updateSettings } = useSettingsStore();'
);

fs.writeFileSync(indexPath, s);
console.log('cleaned');
