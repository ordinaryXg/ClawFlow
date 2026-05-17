import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import type { SubAgentSlot, SubAgentRunSnapshot } from '../../shared/sub-agent-types';
import type { SystemAgentSettings } from '../../shared/system-agent-settings';
import { SYSTEM_AGENT_SETTINGS_BROADCAST } from '../../shared/system-agent-settings';
import {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  SKILL_AGENT_SLOT_ID,
} from '../../shared/system-agent-constants';

type OverviewSlot = {
  slot: SubAgentSlot;
  roleTemplateId: string;
  subclawflowDir: string;
  submemoryDir: string;
  snapshot: SubAgentRunSnapshot | null;
};

type SlotDraft = {
  id: string;
  label: string;
  behavior: string;
};

type Overview = {
  systemRoot: string;
  rosterPath: string;
  rolesDir: string;
  settingsPath: string;
  settings: SystemAgentSettings;
  slots: OverviewSlot[];
  activeWorkspaceSkillsEnabled: boolean | null;
};

function statusChipClass(status: SubAgentSlot['status']): string {
  if (status === 'running') return 'cf-chip cf-chipRunning';
  if (status === 'error') return 'cf-chip cf-chipUnknown';
  if (status === 'starting') return 'cf-chip';
  return 'cf-chip cf-chipStopped';
}

const SystemAgentsSettingsPanel: FC = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<SystemAgentSettings | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<SlotDraft[]>([]);
  const [builtinModels, setBuiltinModels] = useState<Array<{ id: string; label: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.systemAgentsGetOverview?.();
      if (!res || !('ok' in res) || !res.ok) {
        setError(String((res as { error?: string })?.error ?? t('settings.systemAgents.loadFail')));
        return;
      }
      const o = res as Overview & { ok: true };
      setOverview(o);
      setSettings(o.settings);
      setSlotDrafts(
        o.slots.map((row) => ({
          id: row.slot.id,
          label: row.slot.label,
          behavior: row.slot.behavior,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await window.electronAPI?.engineGetChatModels?.();
        const list = Array.isArray(res?.models) ? res.models : [];
        setBuiltinModels(
          list
            .filter((m) => m?.available !== false)
            .map((m) => ({ id: String(m.id), label: String(m.label ?? m.id) }))
        );
      } catch {
        setBuiltinModels([]);
      }
    })();
  }, []);

  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  const modelSelectOptions = useMemo(
    () => [
      { value: '', label: t('settings.systemAgents.modelDefault') },
      ...builtinModels.map((m) => ({ value: m.id, label: m.label })),
    ],
    [builtinModels, t]
  );

  const onSaveAll = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const settingsRes = await window.electronAPI?.systemAgentsSaveSettings?.(settings);
      if (!settingsRes || !('ok' in settingsRes) || !settingsRes.ok) {
        throw new Error(String((settingsRes as { error?: string })?.error ?? 'save_settings_failed'));
      }
      const slotsRes = await window.electronAPI?.systemAgentsSaveSlots?.({
        patches: slotDrafts.map((d) => ({ id: d.id, label: d.label, behavior: d.behavior })),
      });
      if (!slotsRes || !('ok' in slotsRes) || !slotsRes.ok) {
        throw new Error(String((slotsRes as { error?: string })?.error ?? 'save_slots_failed'));
      }
      window.dispatchEvent(new CustomEvent(SYSTEM_AGENT_SETTINGS_BROADCAST));
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.systemAgents.savedBody'));
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      (window as any).__cf_toast?.error?.(t('settings.systemAgents.saveFail'), msg);
    } finally {
      setSaving(false);
    }
  };

  const onReloadRoster = async () => {
    setSaving(true);
    try {
      const res = await window.electronAPI?.systemAgentsReloadRoster?.();
      if (!res || !('ok' in res) || !res.ok) {
        throw new Error(String((res as { error?: string })?.error ?? 'reload_failed'));
      }
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.systemAgents.reloadedBody'));
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      (window as any).__cf_toast?.error?.(t('settings.systemAgents.reloadFail'), msg);
    } finally {
      setSaving(false);
    }
  };

  const patchSlot = (id: string, patch: Partial<SlotDraft>) => {
    setSlotDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const roleLabel = (roleId: string, slotId: string): string => {
    if (slotId === SKILL_AGENT_SLOT_ID) return t('settings.systemAgents.roleSkill');
    if (slotId === COGNITIVE_ALLOCATION_AGENT_SLOT_ID) return t('settings.systemAgents.roleCognitive');
    return roleId;
  };

  if (loading && !overview) {
    return <div className="cf-help">{t('settings.systemAgents.loading')}</div>;
  }

  if (error && !overview) {
    return (
      <div className="cf-card">
        <div className="cf-errorText">{error}</div>
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" style={{ marginTop: 10 }} onClick={() => void load()}>
          {t('common.refresh')}
        </button>
      </div>
    );
  }

  if (!overview || !settings) return null;

  return (
    <>
      <div className="cf-card">
        <h3>{t('settings.systemAgents.globalTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 14 }}>
          {t('settings.systemAgents.globalLead')}
        </p>

        <div style={{ marginBottom: 14 }}>
          <Checkbox
            checked={settings.cognitiveAllocationEnabled}
            onChange={(e) => setSettings((s) => (s ? { ...s, cognitiveAllocationEnabled: e.target.checked } : s))}
          >
            {t('settings.systemAgents.cognitiveEnabled')}
          </Checkbox>
          <div className="cf-help" style={{ marginTop: 6 }}>
            {t('settings.systemAgents.cognitiveEnabledHelp')}
          </div>
        </div>

        <div className="cf-sub" style={{ marginBottom: 6 }}>
          {t('settings.systemAgents.cognitiveModel')}
        </div>
        <select
          className="cf-input cf-select"
          style={{ width: '100%', maxWidth: 420, marginBottom: 6 }}
          value={settings.cognitiveAllocationModelId}
          disabled={!settings.cognitiveAllocationEnabled}
          onChange={(e) =>
            setSettings((s) => (s ? { ...s, cognitiveAllocationModelId: e.target.value } : s))
          }
        >
          {modelSelectOptions.map((o) => (
            <option key={o.value || '__default'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="cf-help" style={{ marginBottom: 14 }}>
          {t('settings.systemAgents.cognitiveModelHelp')}
        </div>

        <div style={{ marginBottom: 14 }}>
          <Checkbox
            checked={settings.showModeClassificationDebug}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, showModeClassificationDebug: e.target.checked } : s))
            }
          >
            {t('settings.systemAgents.showDebug')}
          </Checkbox>
          <div className="cf-help" style={{ marginTop: 6 }}>
            {t('settings.systemAgents.showDebugHelp')}
          </div>
        </div>
      </div>

      <div className="cf-card">
        <h3>{t('settings.systemAgents.rosterTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.systemAgents.rosterLead')}
        </p>
        {overview.activeWorkspaceSkillsEnabled === false ? (
          <div className="cf-help" style={{ marginBottom: 12, color: 'var(--warning, #c9a227)' }}>
            {t('settings.systemAgents.skillsDisabledHint')}
          </div>
        ) : null}

        <div className="cf-systemAgentsRoster">
          {overview.slots.map((row) => {
            const draft = slotDrafts.find((d) => d.id === row.slot.id);
            if (!draft) return null;
            const snap = row.snapshot;
            return (
              <article key={row.slot.id} className="cf-systemAgentsCard">
                <div className="cf-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div className="cf-sub" style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {draft.label}
                    </div>
                    <div className="cf-help cf-settingsModels__mono" style={{ marginTop: 4 }}>
                      {row.slot.id}
                    </div>
                  </div>
                  <span className={statusChipClass(row.slot.status)}>
                    {t(`settings.systemAgents.status_${row.slot.status}`)}
                  </span>
                </div>

                <div className="cf-help" style={{ marginTop: 8 }}>
                  {t('settings.systemAgents.roleTemplate')}: {roleLabel(row.roleTemplateId, row.slot.id)}
                  {row.slot.skillToolsEnabled === false ? ` · ${t('settings.systemAgents.skillToolsOff')}` : ''}
                </div>

                <div className="cf-sub" style={{ marginTop: 12, marginBottom: 4 }}>
                  {t('settings.systemAgents.displayName')}
                </div>
                <input
                  className="cf-input"
                  style={{ width: '100%' }}
                  value={draft.label}
                  onChange={(e) => patchSlot(row.slot.id, { label: e.target.value })}
                />

                <div className="cf-sub" style={{ marginTop: 10, marginBottom: 4 }}>
                  {t('settings.systemAgents.behaviorSummary')}
                </div>
                <textarea
                  className="cf-textarea"
                  rows={3}
                  style={{ width: '100%' }}
                  value={draft.behavior}
                  onChange={(e) => patchSlot(row.slot.id, { behavior: e.target.value })}
                />

                {row.slot.id === SKILL_AGENT_SLOT_ID ? (
                  <div className="cf-help" style={{ marginTop: 8 }}>
                    {t('settings.systemAgents.skillEvolutionHint')}
                  </div>
                ) : null}

                {row.slot.id === COGNITIVE_ALLOCATION_AGENT_SLOT_ID ? (
                  <div className="cf-help" style={{ marginTop: 8 }}>
                    {t('settings.systemAgents.cognitiveRoleHint')}
                  </div>
                ) : null}

                {snap ? (
                  <details className="cf-systemAgentsSnapshot" style={{ marginTop: 10 }}>
                    <summary className="cf-sub">{t('settings.systemAgents.lastRun')}</summary>
                    <div className="cf-help" style={{ marginTop: 6 }}>
                      {t('settings.systemAgents.snapshotStatus')}: {snap.status}
                      {snap.updatedAt
                        ? ` · ${new Date(snap.updatedAt).toLocaleString(locale)}`
                        : ''}
                    </div>
                    {snap.taskText ? (
                      <pre className="cf-codeBlock" style={{ marginTop: 8, maxHeight: 120, overflow: 'auto' }}>
                        {snap.taskText.slice(0, 800)}
                      </pre>
                    ) : null}
                  </details>
                ) : null}

                <div className="cf-help cf-settingsModels__mono" style={{ marginTop: 10, wordBreak: 'break-all' }}>
                  subclawflow: {row.subclawflowDir}
                </div>
                <div className="cf-help cf-settingsModels__mono" style={{ wordBreak: 'break-all' }}>
                  submemory: {row.submemoryDir}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="cf-card">
        <h3>{t('settings.systemAgents.storageTitle')}</h3>
        <div className="cf-divider" />
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.systemAgents.storageLead')}
        </div>
        <div className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 6 }}>
          {overview.systemRoot}
        </div>
        <div className="cf-help cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 6 }}>
          {t('settings.systemAgents.rolesDir')}: {overview.rolesDir}
        </div>
        <div className="cf-help cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 6 }}>
          {t('settings.systemAgents.rosterFile')}: {overview.rosterPath}
        </div>
        <div className="cf-help cf-settingsModels__mono" style={{ wordBreak: 'break-all' }}>
          {t('settings.systemAgents.settingsFile')}: {overview.settingsPath}
        </div>
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="cf-btn cf-btnGhost cf-btnSmall"
            onClick={() => void window.electronAPI?.appOpenPath?.(overview.systemRoot)}
          >
            {t('settings.systemAgents.openRoot')}
          </button>
          <button
            type="button"
            className="cf-btn cf-btnGhost cf-btnSmall"
            onClick={() => void window.electronAPI?.appOpenPath?.(overview.rolesDir)}
          >
            {t('settings.systemAgents.openRoles')}
          </button>
        </div>
      </div>

      <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="cf-btn cf-btnGhost" disabled={saving} onClick={() => void onReloadRoster()}>
          {t('settings.systemAgents.reloadRoster')}
        </button>
        <button type="button" className="cf-btn cf-btnPrimary" disabled={saving} onClick={() => void onSaveAll()}>
          {saving ? t('settings.systemAgents.saving') : t('common.save')}
        </button>
      </div>
    </>
  );
};

export default SystemAgentsSettingsPanel;
