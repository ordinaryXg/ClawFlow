import fs from 'node:fs';

const indexPath = 'src/pages/SettingsPage/index.tsx';
let s = fs.readFileSync(indexPath, 'utf8');

s = s.replace(
  /  if \(activeSection === 'account'\) \{[\s\S]*?  \} else if \(activeSection === 'agents'\) \{/,
  `  if (activeSection === 'account') {
    detailPanels = (
      <AccountSettingsSection
        activeWorkspacePath={activeWorkspacePath}
        accountToolsSel={accountToolsSel}
        setAccountToolsSel={setAccountToolsSel}
        accountToolsSaving={accountToolsSaving}
        onSaveAccountWorkspaceTools={onSaveAccountWorkspaceTools}
        appVersion={appVersion}
      />
    );
  } else if (activeSection === 'agents') {`
);

s = s.replace(
  /  \} else if \(activeSection === 'data'\) \{[\s\S]*?  \} else if \(activeSection === 'help'\) \{/,
  `  } else if (activeSection === 'data') {
    detailPanels = <DataSettingsSection activeWorkspacePath={activeWorkspacePath} />;
  } else if (activeSection === 'help') {`
);

s = s.replace(
  /  \} else if \(activeSection === 'help'\) \{[\s\S]*?  \}\r?\n\r?\n  return \(/,
  `  } else if (activeSection === 'help') {
    detailPanels = <HelpSettingsSection appVersion={appVersion} />;
  }

  return (`
);

if (!s.includes('<AccountSettingsSection')) {
  console.error('account replace failed');
  process.exit(1);
}
if (!s.includes('<DataSettingsSection')) {
  console.error('data replace failed');
  process.exit(1);
}
if (!s.includes('<HelpSettingsSection')) {
  console.error('help replace failed');
  process.exit(1);
}

fs.writeFileSync(indexPath, s);
console.log('wired ok');
