import * as fs from 'fs';
import * as path from 'path';
import { conversationsStorePath } from '../workspace-service';

export type StoredMessageRole = 'user' | 'assistant' | 'tool';

export type StoredToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type StoredMessage = {
  id: string;
  role: StoredMessageRole;
  content: string;
  timestamp: number;
  // Provider-specific fields (optional; used by the new engine)
  reasoning_content?: string;
  tool_calls?: StoredToolCall[];
  tool_call_id?: string;
  name?: string;
  meta?: Record<string, unknown>;
};

export type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
};

type StorePayload = { conversations: StoredConversation[] };

export class SessionStore {
  constructor(private readonly workspaceRoot: string) {}

  private get storePath(): string {
    return conversationsStorePath(this.workspaceRoot);
  }

  async readAll(): Promise<StoredConversation[]> {
    try {
      const buf = await fs.promises.readFile(this.storePath, 'utf-8');
      const raw = JSON.parse(buf);
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.conversations) ? raw.conversations : [];
      return (arr as StoredConversation[]).filter((c) => c && typeof c.id === 'string');
    } catch {
      return [];
    }
  }

  async writeAll(conversations: StoredConversation[]): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.storePath), { recursive: true });
    const payload: StorePayload = { conversations };
    await fs.promises.writeFile(this.storePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async upsertConversation(conversation: StoredConversation): Promise<void> {
    const list = await this.readAll();
    const next = list.some((c) => c.id === conversation.id)
      ? list.map((c) => (c.id === conversation.id ? conversation : c))
      : [...list, conversation];
    await this.writeAll(next);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const list = await this.readAll();
    const next = list.filter((c) => c.id !== conversationId);
    await this.writeAll(next);
  }
}

