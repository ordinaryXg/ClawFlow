import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input } from 'antd';
import { useSubAgentStore } from '../../store/modules/subAgentStore';
import { useChatStore } from '../../store/modules/chatStore';
import './WorkspaceHubPanels.css';
import ToolApprovalBar from '../chat/ToolApprovalBar';
import type { ToolApprovalPendingState } from '../../store/modules/chatStore';
import type { SubAgentSlot } from '../../shared/sub-agent-types';

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
        // 子 Agent 工具审批：先按中风险处理（20s 默认执行），后续可在 sub-agent-runner 里也做风险分级
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

  const openCreate = () => {
    setEditId('');
    setEditLabel('');
    setEditBehavior('');
    setEditOpen(true);
  };

  const openEdit = (a: SubAgentSlot) => {
    setEditId(a.id);
    setEditLabel(a.label ?? '');
    setEditBehavior(a.behavior ?? '');
    setEditOpen(true);
  };

  const saveSlot = async () => {
    setSaving(true);
    try {
      const label = editLabel.trim();
      if (!label) return;
      const next: SubAgentSlot[] = (() => {
        const base = [...slots];
        if (!editId) {
          base.push({ id: crypto.randomUUID(), label, behavior: editBehavior, status: 'stopped' });
          return base;
        }
        const idx = base.findIndex((x) => x.id === editId);
        if (idx >= 0) base[idx] = { ...base[idx], label, behavior: editBehavior };
        return base;
      })();
      await window.electronAPI?.subAgentsSaveAll?.(next as unknown[]);
      await load();
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (id: string) => {
    const next = slots.filter((s) => s.id !== id);
    await window.electronAPI?.subAgentsSaveAll?.(next as unknown[]);
    await load();
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
          <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={openCreate}>
            新建
          </button>
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
              <div className="cf-hubCard__body" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => openEdit(a)}>
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btnGhost cf-btnSmall"
                  onClick={() => openRun(a.id)}
                  disabled={running || a.status === 'running' || a.status === 'starting'}
                >
                  运行
                </button>
                <button type="button" className="cf-btn cf-btnDanger cf-btnSmall" onClick={() => void removeSlot(a.id)} disabled={running}>
                  {t('common.delete')}
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
        title={editId ? '编辑子 Agent' : '新建子 Agent'}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditOpen(false)}
        onOk={() => void saveSlot()}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" />
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
        title="运行子 Agent"
        okText="运行"
        cancelText={t('common.cancel')}
        confirmLoading={running}
        onCancel={() => setRunOpen(false)}
        onOk={() => void doRun()}
        destroyOnHidden
      >
        <Input.TextArea
          value={runTaskText}
          onChange={(e) => setRunTaskText(e.target.value)}
          placeholder="输入要委派给子 Agent 的任务…"
          autoSize={{ minRows: 4, maxRows: 12 }}
        />
      </Modal>
    </div>
  );
};

export default SubAgentsHubPanel;
