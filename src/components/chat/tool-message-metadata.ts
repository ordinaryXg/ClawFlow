import type { Message } from '../../store/modules/chatStore';

function coerceString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 与 Tool 卡片展示一致：来自 meta.kind / toolKind */
export function pickToolKind(meta: Record<string, unknown> | undefined): string | null {
  const kind = coerceString(meta?.kind);
  if (kind) return kind;
  return coerceString(meta?.toolKind) ?? coerceString(meta?.tool_kind);
}

/**
 * 连续多条工具消息合并为一条时的分组键；同键且相邻才合并。
 * 网络类、工作区文件类、其它 exec、子 Agent、周期调度等分开。
 */
export function toolMergeGroupKey(m: Message): string | null {
  if (m.role !== 'tool') return null;
  const kind = pickToolKind(m.meta) ?? '';
  if (kind.startsWith('tool.network')) {
    if (kind === 'tool.network.search' || kind === 'tool.network.scrape') return kind;
    return 'tool.network.other';
  }
  if (kind.startsWith('tool.subagent')) return 'tool.subagent';
  if (kind.startsWith('tool.scheduling')) return 'tool.scheduling';
  if (kind === 'tool.exec.fs') return 'tool.exec.fs';
  if (kind.startsWith('tool.exec')) return 'tool.exec.other';
  if (kind.startsWith('tool.')) {
    const parts = kind.split('.');
    return parts.slice(0, Math.min(4, parts.length)).join('.') || 'tool.misc';
  }
  return 'tool.misc';
}
