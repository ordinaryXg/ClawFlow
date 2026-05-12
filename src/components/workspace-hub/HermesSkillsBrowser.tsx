import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Switch, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { useWorkspaceSkillsStore } from '../../store/modules/workspaceSkillsStore';
import type { WorkspaceSkillListItem } from '../../shared/workspace-skills-types';
import { skillsForHermesDiscoveryUi } from '../../shared/workspace-skills-discovery-filter';
import { DEFAULT_SKILL_TEMPLATE_MARKDOWN } from './default-skill-template-content';
import './hermes-skills-browser.css';

type Layout = 'hub' | 'page';

type Props = {
  workspacePath: string | null;
  layout: Layout;
};

function isMarkdownPath(rel: string): boolean {
  const base = rel.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return base.endsWith('.md');
}

const mdOptions = {
  forceBlock: true,
  overrides: {
    code: {
      component: ({ className, children, ...props }: { className?: string; children?: unknown }) => {
        const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
        const match = /language-(\w+)/.exec(className ?? '');
        if (match) {
          try {
            const html = hljs.highlight(raw, { language: match[1], ignoreIllegals: true }).value;
            return <code className={className} dangerouslySetInnerHTML={{ __html: html }} {...props} />;
          } catch {
            /* fall through */
          }
        }
        return (
          <code className={className} {...props}>
            {raw}
          </code>
        );
      },
    },
  },
};

const HermesSkillsBrowser: FC<Props> = ({ workspacePath, layout }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const list = useWorkspaceSkillsStore((s) => s.list);
  const loading = useWorkspaceSkillsStore((s) => s.loading);
  const loadError = useWorkspaceSkillsStore((s) => s.error);
  const load = useWorkspaceSkillsStore((s) => s.load);

  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [activeFileRel, setActiveFileRel] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ state: 'idle' } | { state: 'loading' } | { state: 'text'; text: string } | { state: 'err'; msg: string }>({
    state: 'idle',
  });
  const [busySkill, setBusySkill] = useState<string | null>(null);

  useEffect(() => {
    if (!workspacePath?.trim()) {
      setSelectedRoot(null);
      setActiveFileRel(null);
      setPreview({ state: 'idle' });
      return;
    }
    void load();
  }, [workspacePath, load]);

  const displayList = useMemo(() => skillsForHermesDiscoveryUi(list), [list]);

  const selectedSkill: WorkspaceSkillListItem | null = useMemo(() => {
    if (!selectedRoot) return null;
    return displayList.find((s) => s.skillRootRel === selectedRoot) ?? null;
  }, [displayList, selectedRoot]);

  useEffect(() => {
    if (!displayList.length) {
      setSelectedRoot(null);
      setActiveFileRel(null);
      return;
    }
    if (!selectedRoot || !displayList.some((s) => s.skillRootRel === selectedRoot)) {
      const first = displayList[0];
      setSelectedRoot(first.skillRootRel);
      setActiveFileRel(first.skillMdRel);
    }
  }, [displayList, selectedRoot]);

  useEffect(() => {
    if (!selectedSkill) {
      setPreview({ state: 'idle' });
      return;
    }
    if (!activeFileRel) {
      setActiveFileRel(selectedSkill.skillMdRel);
      return;
    }
    const allowed = new Set([selectedSkill.skillMdRel, ...selectedSkill.referenceFiles.map((r) => r.relPath)]);
    if (!allowed.has(activeFileRel)) {
      setActiveFileRel(selectedSkill.skillMdRel);
    }
  }, [selectedSkill, activeFileRel]);

  useEffect(() => {
    if (!workspacePath?.trim() || !activeFileRel) {
      setPreview({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setPreview({ state: 'loading' });
    void (async () => {
      try {
        const res = await window.electronAPI?.workspaceSkillsReadFile?.(activeFileRel);
        if (cancelled) return;
        if (res && res.ok === true && typeof res.content === 'string') {
          setPreview({ state: 'text', text: res.content });
        } else {
          const err = res && 'error' in res ? String((res as { error?: string }).error ?? '') : 'read failed';
          setPreview({ state: 'err', msg: err });
        }
      } catch (e) {
        if (!cancelled) setPreview({ state: 'err', msg: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, activeFileRel]);

  const fileTabs = useMemo(() => {
    if (!selectedSkill) return [];
    const rows: Array<{ rel: string; label: string }> = [{ rel: selectedSkill.skillMdRel, label: 'SKILL.md' }];
    for (const r of selectedSkill.referenceFiles) {
      const base = r.relPath.split('/').pop() ?? r.relPath;
      rows.push({ rel: r.relPath, label: base });
    }
    return rows;
  }, [selectedSkill]);

  const revealSkill = useCallback(() => {
    if (!selectedSkill?.skillMdRel) return;
    void window.electronAPI?.workspaceRevealInExplorer?.(selectedSkill.skillMdRel);
  }, [selectedSkill]);

  const toggleEnabled = useCallback(
    async (skill: WorkspaceSkillListItem, next: boolean) => {
      const rel = skill.skillRootRel;
      setBusySkill(rel);
      try {
        const res = await window.electronAPI?.workspaceSkillsSetEnabled?.({ skillRootRel: rel, enabled: next });
        if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
          (window as unknown as { __cf_toast?: { error?: (a: string, b: string) => void } }).__cf_toast?.error?.(
            t('skills.toggleFailedTitle'),
            String((res as { error?: string }).error ?? '')
          );
          return;
        }
        await load();
      } finally {
        setBusySkill(null);
      }
    },
    [load, t]
  );

  const deleteSkill = useCallback(
    async (skill: WorkspaceSkillListItem) => {
      if (!window.confirm(t('skills.deleteConfirm', { name: skill.name }))) return;
      setBusySkill(skill.skillRootRel);
      try {
        const res = await window.electronAPI?.workspaceSkillsDeleteSkill?.(skill.skillRootRel);
        if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
          (window as unknown as { __cf_toast?: { error?: (a: string, b: string) => void } }).__cf_toast?.error?.(
            t('skills.deleteFailedTitle'),
            String((res as { error?: string }).error ?? '')
          );
          return;
        }
        if (selectedRoot === skill.skillRootRel) {
          setSelectedRoot(null);
          setActiveFileRel(null);
        }
        await load();
      } finally {
        setBusySkill(null);
      }
    },
    [load, selectedRoot, t]
  );

  const hubClass = layout === 'page' ? 'cf-hermesSkills cf-hermesSkills--page' : 'cf-hermesSkills';

  if (!workspacePath?.trim()) {
    return (
      <div className={hubClass}>
        <div className="cf-hermesSkills__empty">{t('skills.browserNoWorkspace')}</div>
      </div>
    );
  }

  const showEmptyTemplate = !displayList.length && !loading;

  return (
    <div className={hubClass}>
      <div className="cf-hermesSkills__toolbar">
        <h3 className="cf-hermesSkills__toolbarTitle">{t('skills.browserTitle')}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {layout === 'hub' ? (
            <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => navigate('/skills')}>
              {t('chat.workspaceHub.skillsFullPage')}
            </button>
          ) : null}
          <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void load()} disabled={loading}>
            {loading ? t('skills.browserRefreshing') : t('skills.browserRefresh')}
          </button>
          {selectedSkill ? (
            <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={revealSkill}>
              {t('skills.browserReveal')}
            </button>
          ) : null}
        </div>
      </div>
      {loadError ? <div className="cf-hermesSkills__err">{loadError}</div> : null}

      {showEmptyTemplate ? (
        <div className="cf-hermesSkills__split">
          <div className="cf-hermesSkills__listCol">
            <div className="cf-hermesSkills__listScroll">
              <div className="cf-hermesSkills__empty">{t('skills.browserEmpty')}</div>
            </div>
          </div>
          <div className="cf-hermesSkills__detail">
            <div className="cf-hermesSkills__templateBanner">{t('skills.defaultTemplateBanner')}</div>
            <div className="cf-hermesSkills__preview cf-hermesSkills__templateBody">
              <Markdown options={mdOptions}>{DEFAULT_SKILL_TEMPLATE_MARKDOWN}</Markdown>
            </div>
          </div>
        </div>
      ) : (
        <div className="cf-hermesSkills__split">
          <div className="cf-hermesSkills__listCol">
            <div className="cf-hermesSkills__listScroll">
              {displayList.map((s) => {
                const enabled = s.enabled !== false;
                const active = selectedRoot === s.skillRootRel;
                const busy = busySkill === s.skillRootRel;
                return (
                  <div
                    key={s.skillRootRel}
                    className={`cf-hermesSkills__skillRow${active ? ' cf-hermesSkills__skillRow--active' : ''}${!enabled ? ' cf-hermesSkills__skillRow--disabled' : ''}`}
                  >
                    <button
                      type="button"
                      className="cf-hermesSkills__skillMain"
                      onClick={() => {
                        setSelectedRoot(s.skillRootRel);
                        setActiveFileRel(s.skillMdRel);
                      }}
                    >
                      <span className="cf-hermesSkills__skillName">{s.name}</span>
                      <span className="cf-hermesSkills__skillPath">{s.skillRootRel}</span>
                    </button>
                    <div className="cf-hermesSkills__skillActions">
                      <div className="cf-hermesSkills__skillToggle">
                        <Switch
                          size="small"
                          checked={enabled}
                          disabled={busy}
                          checkedChildren={t('skills.switchOn')}
                          unCheckedChildren={t('skills.switchOff')}
                          onChange={(v) => void toggleEnabled(s, v)}
                          aria-label={enabled ? t('skills.switchAriaEnabled') : t('skills.switchAriaDisabled')}
                        />
                      </div>
                      <Button
                        type="primary"
                        danger
                        size="small"
                        className="cf-hermesSkills__delBtn"
                        icon={<DeleteOutlined aria-hidden />}
                        disabled={busy}
                        onClick={() => void deleteSkill(s)}
                      >
                        {t('skills.actionDelete')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="cf-hermesSkills__detail">
            {selectedSkill ? (
              <>
                <div className="cf-hermesSkills__fileBar">
                  {fileTabs.map((tab) => (
                    <button
                      key={tab.rel}
                      type="button"
                      className={`cf-hermesSkills__fileChip${activeFileRel === tab.rel ? ' cf-hermesSkills__fileChip--active' : ''}`}
                      onClick={() => setActiveFileRel(tab.rel)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="cf-hermesSkills__preview">
                  {preview.state === 'loading' ? <div className="cf-sub">{t('skills.browserLoading')}</div> : null}
                  {preview.state === 'err' ? <div className="cf-hermesSkills__err">{preview.msg}</div> : null}
                  {preview.state === 'text' ? (
                    isMarkdownPath(activeFileRel ?? '') ? (
                      <Markdown options={mdOptions}>{preview.text}</Markdown>
                    ) : (
                      <pre className="cf-hermesSkills__pre">{preview.text}</pre>
                    )
                  ) : null}
                  {preview.state === 'idle' ? <div className="cf-sub">{t('skills.browserPickFile')}</div> : null}
                </div>
              </>
            ) : (
              <div className="cf-hermesSkills__empty">{t('skills.browserSelectSkill')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HermesSkillsBrowser;
