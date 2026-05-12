import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Select } from 'antd';
import { useSubAgentStore } from '../../store/modules/subAgentStore';
import { useChatStore } from '../../store/modules/chatStore';
import './WorkspaceHubPanels.css';
import ToolApprovalBar from '../chat/ToolApprovalBar';
import type { ToolApprovalPendingState } from '../../store/modules/chatStore';
import type { SubAgentRoleTemplateId, SubAgentSlot } from '../../shared/sub-agent-types';
import { SKILL_AGENT_SLOT_ID } from '../../shared/skill-agent-constants';

const ROLE_LABELS: Record<Exclude<SubAgentRoleTemplateId, 'skills'>, string> = {
  program: '程序 Agent（可运行/可验证交付）',
  creative: '创意 Agent（方案/文案/脚本）',
  data: '数据 Agent（可复现分析/结论）',
  assistant: '助理 Agent（推进/拆解/闭环）',
};

const SubAgentsHubPanel: FC = () => {
  const { t } = useTranslation();
  const slots = useSubAgentStore((s) => s.slots);
  const load = useSubAgentStore((s) => s.load);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const badges = useMemo(
    () =>
      ({
        running: 'cf-hubBadge--running',
        starting: 'cf-hubBadge--starting',
        stopped: 'cf-hubBadge--stopped',
        error: 'cf-hubBadge--error',
      }) as const,
    []
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string>('');
  const [editLabel, setEditLabel] = useState<string>('');
  const [editBehavior, setEditBehavior] = useState<string>('');
  const [editRoleTemplateId, setEditRoleTemplateId] = useState<SubAgentRoleTemplateId>('assistant');
  const [saving, setSaving] = useState(false);

  const [runOpen, setRunOpen] = useState(false);
  const [runSlotId, setRunSlotId] = useState<string>('');
  const [runTaskText, setRunTaskText] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runLogBySlot, setRunLogBySlot] = useState<Record<string, string>>({});
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalPendingState | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offDelta = window.electronAPI?.onSubAgentsRunDelta?.((p) => {
      if (!p.slotId) return;
      if (!p.text) return;
      setRunLogBySlot((m) => ({ ...m, [p.slotId]: (m[p.slotId] ?? '') + p.text }));
    });
    const offFinal = window.electronAPI?.onSubAgentsRunFinal?.((p) => {
      setRunning(false);
      if (p.ok && p.message && p.slotId) {
        setRunLogBySlot((m) => ({ ...m, [p.slotId]: (m[p.slotId] ?? '') + `\n\n[final]\n${p.message}` }));
      } else if (!p.ok && p.error && p.slotId) {
        setRunLogBySlot((m) => ({ ...m, [p.slotId]: (m[p.slotId] ?? '') + `\n\n[error]\n${p.error}` }));
      }
    });
    const offApproval = window.electronAPI?.onSubAgentsToolApprovalNeeded?.((p) => {
      setPendingApproval({
        requestId: p.runId ?? '',
        conversationId: p.conversationId ?? '',
        approvalId: p.approvalId ?? '',
        tools: p.tools ?? [],
        riskLevel: 'medium',
        timeoutMs: 20_000,
        defaultApproved: true,
        startedAt: Date.now(),
      });
    });
    return () => {
      offDelta?.();
      offFinal?.();
      offApproval?.();
    };
  }, []);

  const roleSelectOptions: { value: SubAgentRoleTemplateId; label: string }[] = useMemo(() => {
    if (editId === SKILL_AGENT_SLOT_ID) {
      return [{ value: 'skills' as const, label: 'Skill Agent（技能进化，系统槽位）' }];
    }
    const rt = editRoleTemplateId;
    if (rt === 'skills') return [{ value: 'assistant' as const, label: ROLE_LABELS.assistant }];
    return [{ value: rt, label: ROLE_LABELS[rt] }];
  }, [editId, editRoleTemplateId]);

  const openEdit = (a: SubAgentSlot) => {
    setEditId(a.id);
    setEditLabel(a.label ?? '');
    setEditBehavior(a.behavior ?? '');
    const rt = a.roleTemplateId;
    setEditRoleTemplateId(
      rt === 'skills' || rt === 'program' || rt === 'creative' || rt === 'data' || rt === 'assistant' ? rt : 'assistant'
    );
    setEditOpen(true);
  };

  const saveSlot = async () => {
    const cur = slots.find((x) => x.id === editId);
    if (!cur) return;
    setSaving(true);
    try {
      const label = editLabel.trim();
      if (!label) return;
      const next = slots.map((s) => (s.id === editId ? { ...s, label, behavior: editBehavior } : s));
      await window.electronAPI?.subAgentsSaveAll?.(next as unknown[]);
      await load();
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openRun = (id: string) => {
    setRunSlotId(id);
    setRunTaskText('');
    setRunOpen(true);
  };

  const doRun = async () => {
    const cid = String(activeConversationId ?? '').trim();
    if (!cid) return;
    const text = runTaskText.trim();
    if (!text) return;
    setRunning(true);
    setRunLogBySlot((m) => ({ ...m, [runSlotId]: '' }));
    try {
      const res = await window.electronAPI?.subAgentsRun?.({ slotId: runSlotId, taskText: text, conversationId: cid });
      if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
        const err = typeof (res as any).error === 'string' ? (res as any).error : 'run_failed';
        if (err === 'slot_already_running') {
          (window as any).__cf_toast?.warning?.('子 Agent 正在运行中', '同一个 slot 同时只能运行 1 个任务。');
        } else {
          (window as any).__cf_toast?.error?.('子 Agent 运行失败', err);
        }
        setRunning(false);
        return;
      }
      setRunOpen(false);
    } catch {
      setRunning(false);
    }
  };

  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__toolbar">
        <div className="cf-hubPage__titleRow">
          <h2 className="cf-hubPage__title">{t('chat.workspaceHub.subAgentsTitle')}</h2>
        </div>
        <p className="cf-sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {t('chat.workspaceHub.subAgentsHint')}
        </p>
      </div>
      <div className="cf-hubPage__scroll">
        {pendingApproval ? (
          <ToolApprovalBar
            pending={pendingApproval}
            onRespond={(approved) => {
              const id = pendingApproval.approvalId;
              setPendingApproval(null);
              void window.electronAPI?.engineResolveToolApproval?.({ approvalId: id, approved });
            }}
          />
        ) : null}
        {slots.length === 0 ? (
          <div className="cf-hubCard">
            <div className="cf-hubCard__body">{t('chat.workspaceHub.subAgentsEmpty')}</div>
          </div>
        ) : (
          slots.map((a) => (
            <div key={a.id} className="cf-hubCard">
              <div className="cf-hubCard__head">
                <span className="cf-hubCard__name">{a.label || a.id}</span>
                {a.id === SKILL_AGENT_SLOT_ID ? (
                  <span
                    className={`cf-hubBadge ${a.skillToolsEnabled === false ? 'cf-hubBadge--stopped' : 'cf-hubBadge--running'}`}
                    style={{ marginRight: 6 }}
                  >
                    {t('chat.workspaceHub.subAgentsSkillBadge')}
                  </span>
                ) : null}
                <span className={`cf-hubBadge ${badges[a.status]}`}>{t(`chat.workspaceHub.subAgentStatus.${a.status}`)}</span>
              </div>
              <div className="cf-hubCard__body">{a.behavior || t('chat.workspaceHub.subAgentNoBehavior')}</div>
              <div className="cf-hubCard__body cf-sub" style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                {a.id === SKILL_AGENT_SLOT_ID
                  ? a.skillToolsEnabled === false
                    ? t('chat.workspaceHub.subAgentsSkillCaptionToolsOff')
                    : t('chat.workspaceHub.subAgentsSkillCaption')
                  : t('chat.workspaceHub.subAgentsDelegateCaption')}
              </div>
              <div className="cf-hubCard__body" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => openEdit(a)}>
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btnGhost cf-btnSmall"
                  onClick={() => openRun(a.id)}
                  disabled={
                    running || a.status === 'running' || a.status === 'starting' || a.id === SKILL_AGENT_SLOT_ID
                  }
                  title={a.id === SKILL_AGENT_SLOT_ID ? t('chat.workspaceHub.subAgentsSkillRunDisabled') : undefined}
                >
                  {t('chat.workspaceHub.subAgentsRunAction')}
                </button>
              </div>
              {runLogBySlot[a.id] ? (
                <pre className="cf-hubCard__body" style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {runLogBySlot[a.id]}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Modal
        open={editOpen}
        title={t('chat.workspaceHub.subAgentsEditTitle')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditOpen(false)}
        onOk={() => void saveSlot()}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" />
          <Select
            value={editRoleTemplateId}
            style={{ width: '100%' }}
            disabled
            options={roleSelectOptions}
          />
          <Input.TextArea
            value={editBehavior}
            onChange={(e) => setEditBehavior(e.target.value)}
            placeholder="Behavior / Role summary"
            autoSize={{ minRows: 4, maxRows: 12 }}
          />
        </div>
      </Modal>

      <Modal
        open={runOpen}
        title={t('chat.workspaceHub.subAgentsRunTitle')}
        okText={t('chat.workspaceHub.subAgentsRunAction')}
        cancelText={t('common.cancel')}
        confirmLoading={running}
        onCancel={() => setRunOpen(false)}
        onOk={() => void doRun()}
        destroyOnHidden
        width={920}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Input.TextArea
          value={runTaskText}
          onChange={(e) => setRunTaskText(e.target.value)}
          placeholder={t('chat.workspaceHub.subAgentsRunPlaceholder')}
          autoSize={{ minRows: 16, maxRows: 32 }}
          style={{ fontSize: 14, lineHeight: 1.55 }}
        />
      </Modal>
    </div>
  );
};

export default SubAgentsHubPanel;
