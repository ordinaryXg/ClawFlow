import {
  flushConversationsPersistedSideEffects,
  scheduleConversationsPersistedSideEffects,
} from './persist-notify-coalescer';

jest.mock('../messaging/chat-broadcast', () => ({
  broadcastChatConversationsDirty: jest.fn(),
}));

jest.mock('./hermes-memory-service', () => ({
  refreshHermesMemoryIndex: jest.fn(),
}));

import { broadcastChatConversationsDirty } from '../messaging/chat-broadcast';
import { refreshHermesMemoryIndex } from './hermes-memory-service';

describe('persist-notify-coalescer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces broadcast and hermes refresh until flush', () => {
    const root = '/tmp/ws-coalesce-test';
    scheduleConversationsPersistedSideEffects(root);
    scheduleConversationsPersistedSideEffects(root);
    scheduleConversationsPersistedSideEffects(root);

    expect(broadcastChatConversationsDirty).not.toHaveBeenCalled();
    expect(refreshHermesMemoryIndex).not.toHaveBeenCalled();

    flushConversationsPersistedSideEffects(root);

    expect(broadcastChatConversationsDirty).toHaveBeenCalledTimes(1);
    expect(refreshHermesMemoryIndex).toHaveBeenCalledTimes(1);
  });

  it('fires broadcast after debounce window when not flushed early', () => {
    const root = '/tmp/ws-coalesce-delay';
    scheduleConversationsPersistedSideEffects(root);

    jest.advanceTimersByTime(500);
    expect(broadcastChatConversationsDirty).toHaveBeenCalledTimes(1);
    expect(refreshHermesMemoryIndex).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1600);
    expect(refreshHermesMemoryIndex).toHaveBeenCalledTimes(1);
  });
});
