import {
  FC,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import MessageItem from './MessageItem';
import ToolMessageGroup from './ToolMessageGroup';
import EvolutionMessageGroup from './EvolutionMessageGroup';
import ExpectationPlanningPanel from './ExpectationPlanningPanel';
import './chat.css';
import {
  buildGroupedRows,
  computeTailWindowStart,
} from './message-list-rows';
import type { Message } from '../../store/modules/chatStore';

export const CHAT_MSG_LIST_INITIAL_MAX_ROWS = 5;
export const CHAT_MSG_LIST_INITIAL_MAX_CHARS = 32_000;
export const CHAT_MSG_LIST_LOAD_MORE_ROWS = 5;
/** 距滚动容器顶部像素小于该值时尝试加载更早消息 */
const NEAR_TOP_SCROLL_PX = 160;
/** 内容高度仅略大于视口时不算「可滚动」，避免误判 */
const SCROLLABLE_SLACK_PX = 20;
/** 视口填不满时自动向前补渲染的最大批次数（防止一次拉全历史） */
const MAX_AUTO_FILL_CHUNKS = 14;

export type ExpectationPlanListProps = {
  anchorMessageId: string | null;
  planning: boolean;
  streamText: string | null;
  displayMarkdown: string | null;
  categoryLabel?: string | null;
};

interface Props {
  messages: Message[];
  scrollRoot: HTMLElement | null;
  stickToBottomRef: MutableRefObject<boolean>;
  conversationId: string | null;
  expectationPlan?: ExpectationPlanListProps | null;
}

const MessageList: FC<Props> = ({ messages, scrollRoot, stickToBottomRef, conversationId, expectationPlan }) => {
  const { t } = useTranslation();
  const sorted = useMemo(() => [...messages].sort((a, b) => a.timestamp - b.timestamp), [messages]);
  const rows = useMemo(() => buildGroupedRows(sorted), [sorted]);

  const rowStructureKey = useMemo(
    () =>
      `${rows.length}\u001f${rows.map((r) => (r.type === 'single' ? r.message.id : r.key)).join('\u001f')}`,
    [rows]
  );

  const [renderStart, setRenderStart] = useState(0);
  const renderStartRef = useRef(0);
  renderStartRef.current = renderStart;
  const pendingScrollRestoreRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const loadCooldownUntilRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rowsLenRef = useRef(0);
  const prevConversationIdRef = useRef<string | null>(null);
  const autoFillChunksRef = useRef(0);

  useEffect(() => {
    setRenderStart((s) => Math.max(0, Math.min(s, Math.max(0, rows.length - 1))));
  }, [rows.length]);

  useEffect(() => {
    const prev = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;
    if (prev !== conversationId) {
      rowsLenRef.current = rows.length;
      autoFillChunksRef.current = 0;
      setRenderStart(
        computeTailWindowStart(rows, CHAT_MSG_LIST_INITIAL_MAX_ROWS, CHAT_MSG_LIST_INITIAL_MAX_CHARS)
      );
    }
  }, [conversationId, rows]);

  useEffect(() => {
    if (!rows.length) return;
    setRenderStart((s) => {
      const t = computeTailWindowStart(rows, CHAT_MSG_LIST_INITIAL_MAX_ROWS, CHAT_MSG_LIST_INITIAL_MAX_CHARS);
      if (s === 0 && t > 0) return t;
      return s;
    });
  }, [rowStructureKey, rows]);

  useEffect(() => {
    if (rows.length <= rowsLenRef.current) {
      rowsLenRef.current = rows.length;
      return;
    }
    rowsLenRef.current = rows.length;
    if (stickToBottomRef.current) {
      setRenderStart(
        computeTailWindowStart(rows, CHAT_MSG_LIST_INITIAL_MAX_ROWS, CHAT_MSG_LIST_INITIAL_MAX_CHARS)
      );
    }
  }, [rows.length, rows, stickToBottomRef]);

  const hasOlder = renderStart > 0;
  const visibleRows = useMemo(() => rows.slice(renderStart), [rows, renderStart]);

  const loadOlderChunk = useCallback(() => {
    if (renderStartRef.current <= 0) return;
    const now = Date.now();
    if (now < loadCooldownUntilRef.current) return;
    loadCooldownUntilRef.current = now + 220;
    const root = scrollRoot;
    if (root) {
      pendingScrollRestoreRef.current = { prevHeight: root.scrollHeight, prevTop: root.scrollTop };
    }
    setRenderStart((s) => Math.max(0, s - CHAT_MSG_LIST_LOAD_MORE_ROWS));
  }, [scrollRoot]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    const root = scrollRoot;
    if (!pending || !root) {
      pendingScrollRestoreRef.current = null;
      return;
    }
    const delta = root.scrollHeight - pending.prevHeight;
    root.scrollTop = pending.prevTop + delta;
    pendingScrollRestoreRef.current = null;
  }, [renderStart, scrollRoot, visibleRows.length]);

  useEffect(() => {
    const root = scrollRoot;
    const sent = sentinelRef.current;
    if (!root || !sent || renderStart <= 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) loadOlderChunk();
        }
      },
      { root, rootMargin: '180px 0px 0px 0px', threshold: 0 }
    );
    io.observe(sent);
    return () => io.disconnect();
  }, [scrollRoot, renderStart, loadOlderChunk, rows.length]);

  /** 上滑：用 scrollTop 触发（IO 在部分 WebView 下不可靠；且短列表无滚动条时 IO 可能永远不触发） */
  useEffect(() => {
    const root = scrollRoot;
    if (!root || renderStart <= 0) return;
    const onScroll = () => {
      if (renderStartRef.current <= 0) return;
      const canScroll = root.scrollHeight > root.clientHeight + SCROLLABLE_SLACK_PX;
      if (canScroll && root.scrollTop <= NEAR_TOP_SCROLL_PX) {
        loadOlderChunk();
      }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, [scrollRoot, renderStart, loadOlderChunk]);

  /** 仍有更早消息但列表填不满视口：自动分批补渲染，直到出现滚动条或达上限 */
  useEffect(() => {
    const root = scrollRoot;
    if (!root || renderStart <= 0) return;
    if (autoFillChunksRef.current >= MAX_AUTO_FILL_CHUNKS) return;
    if (root.scrollHeight > root.clientHeight + SCROLLABLE_SLACK_PX) return;
    autoFillChunksRef.current += 1;
    const t = window.setTimeout(() => loadOlderChunk(), 0);
    return () => window.clearTimeout(t);
  }, [scrollRoot, renderStart, visibleRows.length, loadOlderChunk]);

  return (
    <div className="cf-msgList">
      {hasOlder ? (
        <div className="cf-msgList__olderWrap" ref={sentinelRef}>
          <div className="cf-msgList__olderHint">{t('chat.listVirtualHint')}</div>
          <button type="button" className="cf-msgList__olderBtn" onClick={() => loadOlderChunk()}>
            {t('chat.listLoadOlderBtn')}
          </button>
        </div>
      ) : null}
      {visibleRows.map((row) => {
        if (row.type === 'toolGroup') {
          return <ToolMessageGroup key={row.key} messages={row.messages} />;
        }
        if (row.type === 'evolutionGroup') {
          return <EvolutionMessageGroup key={row.key} messages={row.messages} />;
        }
        const showPlan =
          expectationPlan?.anchorMessageId &&
          row.message.id === expectationPlan.anchorMessageId &&
          (expectationPlan.planning || Boolean(expectationPlan.displayMarkdown?.trim()) || Boolean(expectationPlan.streamText?.trim()));
        return (
          <Fragment key={row.message.id}>
            <MessageItem message={row.message} />
            {showPlan ? (
              <ExpectationPlanningPanel
                planning={expectationPlan.planning}
                streamText={expectationPlan.streamText}
                displayMarkdown={expectationPlan.displayMarkdown}
                categoryLabel={expectationPlan.categoryLabel}
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
};

export default MessageList;
