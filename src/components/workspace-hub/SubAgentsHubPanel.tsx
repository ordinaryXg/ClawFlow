import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Select } from 'antd';
import { useSubAgentStore } from '../../store/modules/subAgentStore';
import './WorkspaceHubPanels.css';
import ToolApprovalBar from '../chat/ToolApprovalBar';
import type { ToolApprovalPendingState } from '../../store/modules/chatStore';
import type { SubAgentRoleTemplateId, SubAgentSlot } from '../../shared/sub-agent-types';
import { isSystemSubAgentSlotId } from '../../shared/system-agent-constants';

type WorkspaceDelegateRoleId = Exclude<
  SubAgentRoleTemplateId,
  'skills' | 'cognitive-allocation' | 'expectation-planning'
>;

const ROLE_LABELS: Record<WorkspaceDelegateRoleId, string> = {
  program: '程序 Agent（可运行/可验证交付）',
  creative: '创意 Agent（方案/文案/脚本）',
  data: '数据 Agent（可复现分析/结论）',
  assistant: '助理 Agent（推进/拆解/闭环）',
};

function excerptConversationMessages(
  messages: Array<{ role?: string; content?: string }> | undefined,
  max = 8
): string {
  const arr = Array.isArray(messages) ? messages : [];
  const tail = arr.slice(-max);
  if (!tail.length) return '';
  return tail
    .map((m) => {
      const role = String(m?.role ?? '?');
      const c = String(m?.content ?? '');
      const one = c.replace(/\s+/g, ' ').trim();
      const clip = one.length > 280 ? `${one.slice(0, 280)}…` : one;
      return `[${role}] ${clip}`;
    })
    .join('\n\n');
}

const SubAgentsHubPanel: FC = () => {
  const { t } = useTranslation();
  const slotsRaw = useSubAgentStore((s) => s.slots);
  const slots = useMemo(() => slotsRaw.filter((s) => !isSystemSubAgentSlotId(s.id)), [slotsRaw]);
  const runSnapshots = useSubAgentStore((s) => s.runSnapshots);
  const load = useSubAgentStore((s) => s.load);

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

  const [runLogBySlot, setRunLogBySlot] = useState<Record<string, string>>({});
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalPendingState | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSlotId, setDetailSlotId] = useState<string>('');
  const [detailConvExcerpt, setDetailConvExcerpt] = useState<string>('');
  const [detailConvTitle, setDetailConvTitle] = useState<string>('');

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

  useEffect(() => {
    if (!detailOpen || !detailSlotId) return;
    const snap = runSnapshots[detailSlotId];
    const cid = String(snap?.conversationId ?? '').trim();
    if (!cid) {
      setDetailConvExcerpt('');
      setDetailConvTitle('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.electronAPI?.engineGetConversations?.();
        const rawList = Array.isArray(res) ? res : Array.isArray(res?.conversations) ? res.conversations : [];
        const conv = rawList.find((c: { id?: string }) => String(c?.id ?? '') === cid);
        if (cancelled) return;
        if (conv && typeof conv === 'object') {
          setDetailConvTitle(String((conv as { title?: string }).title ?? cid));
          setDetailConvExcerpt(
            excerptConversationMessages((conv as { messages?: Array<{ role?: string; content?: string }> }).messages)
          );
        } else {
          setDetailConvTitle(cid);
          setDetailConvExcerpt(t('chat.workspaceHub.subAgentsDetailsConvMissing'));
        }
      } catch {
        if (!cancelled) {
          setDetailConvTitle(cid);
          setDetailConvExcerpt(t('chat.workspaceHub.subAgentsDetailsConvErr'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailOpen, detailSlotId, runSnapshots, t]);

  const roleSelectOptions: { value: SubAgentRoleTemplateId; label: string }[] = useMemo(() => {
    const rt = editRoleTemplateId;
    if (rt === 'skills' || rt === 'cognitive-allocation' || rt === 'expectation-planning') {
      return [{ value: 'assistant' as const, label: ROLE_LABELS.assistant }];
    }
    return [{ value: rt, label: ROLE_LABELS[rt] }];
  }, [editRoleTemplateId]);

  const openEdit = (a: SubAgentSlot) => {
    setEditId(a.id);
    setEditLabel(a.label ?? '');
    setEditBehavior(a.behavior ?? '');
    const rt = a.roleTemplateId;
    setEditRoleTemplateId(
      rt === 'skills' || rt === 'cognitive-allocation' || rt === 'expectation-planning'
        ? 'assistant'
        : rt === 'program' || rt === 'creative' || rt === 'data' || rt === 'assistant'
          ? rt
          : 'assistant'
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

  const openDetails = (slotId: string) => {
    setDetailSlotId(slotId);
    setDetailOpen(true);
  };

  const detailSlot = useMemo(() => slots.find((s) => s.id === detailSlotId) ?? null, [slots, detailSlotId]);
  const detailSnap = runSnapshots[detailSlotId];
  const liveLog = runLogBySlot[detailSlotId] ?? '';
  const mergedLog = liveLog.trim() ? liveLog : detailSnap?.logTail ?? '';

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
                <span className={`cf-hubBadge ${badges[a.status]}`}>{t(`chat.workspaceHub.subAgentStatus.${a.status}`)}</span>
              </div>
              <div className="cf-hubCard__body">{a.behavior || t('chat.workspaceHub.subAgentNoBehavior')}</div>
              <div className="cf-hubCard__body cf-sub" style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                {t('chat.workspaceHub.subAgentsDelegateCaption')}
              </div>
              <div className="cf-hubCard__body" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => openEdit(a)}>
                  {t('common.edit')}
                </button>
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => openDetails(a.id)}>
                  {t('chat.workspaceHub.subAgentsDetailsAction')}
                </button>
              </div>
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
          <Select value={editRoleTemplateId} style={{ width: '100%' }} disabled options={roleSelectOptions} />
          <Input.TextArea
            value={editBehavior}
            onChange={(e) => setEditBehavior(e.target.value)}
            placeholder="Behavior / Role summary"
            autoSize={{ minRows: 4, maxRows: 12 }}
          />
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        title={t('chat.workspaceHub.subAgentsDetailsTitle')}
        footer={null}
        onCancel={() => setDetailOpen(false)}
        destroyOnHidden
        width={880}
        styles={{ body: { paddingTop: 12, maxHeight: '72vh', overflow: 'auto' } }}
      >
        {detailSlot ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                {t('chat.workspaceHub.subAgentsDetailsSlot')}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>{detailSlot.label || detailSlot.id}</strong>
                <span className="cf-sub" style={{ marginLeft: 8, fontSize: 12 }}>
                  ({detailSlot.id})
                </span>
              </div>
            </div>
            <div>
              <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                {t('chat.workspaceHub.subAgentsDetailsStatus')}
              </div>
              <div style={{ fontSize: 13 }}>{t(`chat.workspaceHub.subAgentStatus.${detailSlot.status}`)}</div>
            </div>
            {detailSnap?.taskText ? (
              <div>
                <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                  {t('chat.workspaceHub.subAgentsDetailsLastTask')}
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>{detailSnap.taskText}</pre>
              </div>
            ) : (
              <div className="cf-sub" style={{ fontSize: 12 }}>
                {t('chat.workspaceHub.subAgentsDetailsNoTask')}
              </div>
            )}
            {detailSnap ? (
              <div>
                <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                  {t('chat.workspaceHub.subAgentsDetailsRunState')}
                </div>
                <div style={{ fontSize: 13 }}>{t(`chat.workspaceHub.subAgentsPersistStatus.${detailSnap.status}`)}</div>
                {detailSnap.status === 'interrupted' ? (
                  <p className="cf-sub" style={{ fontSize: 12, marginTop: 6 }}>
                    {t('chat.workspaceHub.subAgentsDetailsInterruptedHint')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div>
              <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                {t('chat.workspaceHub.subAgentsDetailsConv')}
              </div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <span className="cf-sub">{t('chat.workspaceHub.subAgentsDetailsConvTitle')}：</span>
                {detailConvTitle || '—'}
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.45, maxHeight: 220, overflow: 'auto' }}>
                {detailConvExcerpt || t('chat.workspaceHub.subAgentsDetailsConvEmpty')}
              </pre>
            </div>
            <div>
              <div className="cf-sub" style={{ fontSize: 11, marginBottom: 4 }}>
                {t('chat.workspaceHub.subAgentsDetailsLog')}
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.45, maxHeight: 280, overflow: 'auto' }}>
                {mergedLog.trim() ? mergedLog : t('chat.workspaceHub.subAgentsDetailsLogEmpty')}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default SubAgentsHubPanel;
