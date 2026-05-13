/**
 * 通讯集成偏好（userData），当前含飞书自建应用凭证与默认收信人。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type FeishuReceiveIdType = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';

export type MessagingPrefsStored = {
  feishu?: {
    appId?: string;
    appSecret?: string;
    defaultReceiveId?: string;
    receiveIdType?: FeishuReceiveIdType;
    /** 事件订阅桥接：将飞书消息写入本地会话并回发模型最终答复 */
    bridgeEnabled?: boolean;
    bridgeWorkspacePath?: string;
    bridgeConversationId?: string;
    /** 对话列表角标展示名，默认 Feishu */
    bridgeSenderLabel?: string;
  };
};

const FILENAME = 'cf.messaging-prefs.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function readMessagingPrefsFile(): MessagingPrefsStored | null {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const j = JSON.parse(raw) as MessagingPrefsStored;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function writeMessagingPrefsFile(prefs: MessagingPrefsStored): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

export function coerceFeishuReceiveIdType(raw: unknown): FeishuReceiveIdType {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'open_id' || s === 'user_id' || s === 'union_id' || s === 'email' || s === 'chat_id') return s;
  return 'chat_id';
}
