import { ipcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { getGlobalClawFlowEngine } from '../../engine/clawflow-engine';
import {
  resolveWorkspaceRootForWebContents,
  workspaceRootOrUndefined,
} from '../electron-workspace-context';
import type { SystemAgentSettings } from '../../shared/system-agent-settings';
import { runCognitiveAllocationClassification } from './cognitive-allocation-agent';
import { runExpectationPlanning } from './expectation-planning-agent';
import {
  getSystemAgentOverview,
  reloadSystemAgentRoster,
  saveSystemAgentSlotPatches,
} from './system-agents-admin';
import { readSystemAgentSettings, writeSystemAgentSettings } from './system-agent-settings-service';

function broadcastSystemAgentSettingsUpdated(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send('systemAgents:settingsUpdated');
    } catch {
      /* ignore */
    }
  }
}

const CHANNELS = {
  classify: 'systemAgents:classifyConversation',
  planExpectation: 'systemAgents:planExpectation',
  overview: 'systemAgents:getOverview',
  saveSettings: 'systemAgents:saveSettings',
  saveSlots: 'systemAgents:saveSlots',
  reloadRoster: 'systemAgents:reloadRoster',
} as const;

const DELTA_CHANNEL = 'systemAgents:expectationPlanDelta' as const;

export function registerSystemAgentsIPC(): void {
  for (const ch of Object.values(CHANNELS)) {
    try {
      ipcMain.removeHandler(ch);
    } catch {
      /* first load */
    }
  }

  ipcMain.handle(CHANNELS.classify, async (_event, payload: unknown) => {
    const userText =
      typeof (payload as { userText?: string })?.userText === 'string'
        ? (payload as { userText: string }).userText
        : '';
    const modelId =
      typeof (payload as { modelId?: string })?.modelId === 'string'
        ? (payload as { modelId: string }).modelId
        : undefined;
    try {
      const settings = await readSystemAgentSettings();
      const classification = await runCognitiveAllocationClassification({
        userText,
        modelId: settings.cognitiveAllocationModelId.trim() || modelId,
        router: getGlobalClawFlowEngine().getProviderRouter(),
        settings,
      });
      return { ok: true as const, ...classification };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(CHANNELS.planExpectation, async (event, payload: unknown) => {
    const userText =
      typeof (payload as { userText?: string })?.userText === 'string'
        ? (payload as { userText: string }).userText
        : '';
    const modelId =
      typeof (payload as { modelId?: string })?.modelId === 'string'
        ? (payload as { modelId: string }).modelId
        : undefined;
    const categoryLabel =
      typeof (payload as { categoryLabel?: string })?.categoryLabel === 'string'
        ? (payload as { categoryLabel: string }).categoryLabel
        : undefined;
    const classificationSummary =
      typeof (payload as { classificationSummary?: string })?.classificationSummary === 'string'
        ? (payload as { classificationSummary: string }).classificationSummary
        : undefined;
    const sender = event.sender;
    try {
      const settings = await readSystemAgentSettings();
      const result = await runExpectationPlanning({
        userText,
        modelId: settings.expectationPlanningModelId.trim() || modelId,
        categoryLabel,
        classificationSummary,
        router: getGlobalClawFlowEngine().getProviderRouter(),
        settings,
        onDelta: (text) => {
          try {
            sender.send(DELTA_CHANNEL, { text });
          } catch {
            /* ignore */
          }
        },
      });
      return { ok: true as const, ...result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(CHANNELS.overview, async (event) => {
    try {
      const overview = await getSystemAgentOverview(
        workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender))
      );
      return { ok: true as const, ...overview };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(CHANNELS.saveSettings, async (_event, payload: unknown) => {
    try {
      const p = payload && typeof payload === 'object' ? (payload as Partial<SystemAgentSettings>) : {};
      const settings = await writeSystemAgentSettings(p);
      broadcastSystemAgentSettingsUpdated();
      return { ok: true as const, settings };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(CHANNELS.saveSlots, async (event, payload: unknown) => {
    try {
      const workspaceRoot = workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender));
      const rawPatches = Array.isArray((payload as { patches?: unknown })?.patches)
        ? (payload as { patches: unknown[] }).patches
        : [];
      const patches = rawPatches
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const id = String((p as { id?: string }).id ?? '').trim();
          if (!id) return null;
          return {
            id,
            ...(typeof (p as { label?: string }).label === 'string' ? { label: (p as { label: string }).label } : {}),
            ...(typeof (p as { behavior?: string }).behavior === 'string'
              ? { behavior: (p as { behavior: string }).behavior }
              : {}),
          };
        })
        .filter(Boolean) as Array<{ id: string; label?: string; behavior?: string }>;
      const slots = await saveSystemAgentSlotPatches(patches, workspaceRoot);
      return { ok: true as const, slots };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(CHANNELS.reloadRoster, async (event) => {
    try {
      const slots = await reloadSystemAgentRoster(
        workspaceRootOrUndefined(resolveWorkspaceRootForWebContents(event.sender))
      );
      return { ok: true as const, slots };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });
}
