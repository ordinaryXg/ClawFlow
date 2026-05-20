import type { Message } from '../../store/modules/chatStore';
import { resolveMessagePresentationChannel } from '../../store/modules/chatStore';

export function evolutionMergeGroupKey(message: Message): string | null {
  if (resolveMessagePresentationChannel(message) !== 'assistant_evolution') return null;
  const raw = message.meta?.evolutionRunId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function evolutionSegment(message: Message): string {
  const raw = message.meta?.evolutionSegment;
  return typeof raw === 'string' ? raw : 'summary';
}

export function evolutionStatus(message: Message): 'running' | 'ok' | 'failed' {
  const raw = message.meta?.evolutionStatus;
  if (raw === 'running' || raw === 'ok' || raw === 'failed') return raw;
  return 'ok';
}
