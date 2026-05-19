export const SETTINGS_SECTION_IDS = [
  'account',
  'agents',
  'system',
  'memory',
  'models',
  'integrations',
  'data',
  'help',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const NAV_LABEL_KEYS: Record<SettingsSectionId, string> = {
  account: 'settings.navAccount',
  agents: 'settings.navAgents',
  system: 'settings.navSystem',
  memory: 'settings.navMemory',
  models: 'settings.navModels',
  integrations: 'settings.navIntegrations',
  data: 'settings.navData',
  help: 'settings.navHelp',
};

export const SECTION_META: Record<SettingsSectionId, { titleKey: string }> = {
  account: { titleKey: 'settings.sectionAccountTitle' },
  agents: { titleKey: 'settings.sectionAgentsTitle' },
  system: { titleKey: 'settings.sectionSystemTitle' },
  memory: { titleKey: 'settings.sectionMemoryTitle' },
  models: { titleKey: 'settings.sectionModelsTitle' },
  integrations: { titleKey: 'settings.sectionIntegrationsTitle' },
  data: { titleKey: 'settings.sectionDataTitle' },
  help: { titleKey: 'settings.sectionHelpTitle' },
};
