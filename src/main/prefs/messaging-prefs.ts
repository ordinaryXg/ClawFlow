/**
 * 通讯集成偏好（userData）。
 * 飞书支持多机器人：feishuBots[]；旧版单块 feishu 在读取时内存迁移，保存时写入 feishuBots 并清除 feishu。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';

export type FeishuReceiveIdType = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';

/** 单条飞书机器人（自建应用）配置 */
export type FeishuBotConfig = {
  /** 稳定 ID，用于事件长连与 IPC 关联；勿随意变更 */
  id: string;
  /** 在设置里展示的名称 */
  name: string;
  appId?: string;
  appSecret?: string;
  defaultReceiveId?: string;
  receiveIdType?: FeishuReceiveIdType;
  /** 事件订阅桥接：该应用收到的 IM 写入绑定工作区会话并回发模型答复 */
  bridgeEnabled?: boolean;
  bridgeWorkspacePath?: string;
  bridgeConversationId?: string;
  bridgeSenderLabel?: string;
};

/** 旧版单应用块（仅用于迁移读取） */
export type LegacyFeishuPrefs = {
  appId?: string;
  appSecret?: string;
  defaultReceiveId?: string;
  receiveIdType?: FeishuReceiveIdType;
  bridgeEnabled?: boolean;
  bridgeWorkspacePath?: string;
  bridgeConversationId?: string;
  bridgeSenderLabel?: string;
};

export type MessagingPrefsStored = {
  messagingVersion?: 2;
  feishuBots?: FeishuBotConfig[];
  /** @deprecated 由 feishuBots 替代；存在时 getNormalizedFeishuBots 会合并为一条 */
  feishu?: LegacyFeishuPrefs;
};

export const LEGACY_FEISHU_BOT_ID = 'feishu-legacy';

const FILENAME = 'cf.messaging-prefs.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

function coerceBot(raw: unknown): FeishuBotConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  if (!id) return null;
  const name = String(o.name ?? '').trim() || '飞书机器人';
  const out: FeishuBotConfig = {
    id,
    name,
    ...(isNonEmptyString(o.appId) ? { appId: o.appId.trim() } : {}),
    ...(isNonEmptyString(o.appSecret) ? { appSecret: o.appSecret.trim() } : {}),
    ...(isNonEmptyString(o.defaultReceiveId) ? { defaultReceiveId: o.defaultReceiveId.trim() } : {}),
    ...(o.receiveIdType ? { receiveIdType: coerceFeishuReceiveIdType(o.receiveIdType) } : {}),
    ...(o.bridgeEnabled === true || o.bridgeEnabled === false ? { bridgeEnabled: Boolean(o.bridgeEnabled) } : {}),
    ...(isNonEmptyString(o.bridgeWorkspacePath) ? { bridgeWorkspacePath: o.bridgeWorkspacePath.trim() } : {}),
    ...(isNonEmptyString(o.bridgeConversationId) ? { bridgeConversationId: o.bridgeConversationId.trim() } : {}),
    ...(isNonEmptyString(o.bridgeSenderLabel) ? { bridgeSenderLabel: o.bridgeSenderLabel.trim() } : {}),
  };
  return out;
}

function legacyToBot(leg: LegacyFeishuPrefs): FeishuBotConfig {
  return coerceBot({
    id: LEGACY_FEISHU_BOT_ID,
    name: '飞书机器人',
    ...leg,
  }) as FeishuBotConfig;
}

/** 新建向导用的一条空配置（由调用方写入名称） */
export function newFeishuBotTemplate(name: string): FeishuBotConfig {
  return {
    id: randomUUID(),
    name: name.trim() || '飞书机器人',
    receiveIdType: 'chat_id',
    bridgeEnabled: false,
  };
}

/**
 * 归一化机器人列表：优先 feishuBots；否则从 legacy feishu 迁一条；再否则返回一条可编辑空模板。
 * 不修改磁盘（仅内存视图）。
 */
export function getNormalizedFeishuBots(prefs: MessagingPrefsStored | null): FeishuBotConfig[] {
  if (prefs?.feishuBots && Array.isArray(prefs.feishuBots)) {
    const out = prefs.feishuBots.map(coerceBot).filter((x): x is FeishuBotConfig => Boolean(x));
    if (out.length > 0) return out;
  }
  const leg = prefs?.feishu;
  if (leg && typeof leg === 'object' && Object.keys(leg).length > 0) {
    return [legacyToBot(leg)];
  }
  return [newFeishuBotTemplate('机器人 1')];
}

export function findFeishuBotById(prefs: MessagingPrefsStored | null, botId: string): FeishuBotConfig | undefined {
  const id = String(botId ?? '').trim();
  if (!id) return undefined;
  return getNormalizedFeishuBots(prefs).find((b) => b.id === id);
}

/**
 * 保存时合并：未传 appSecret 且未 clear 时保留磁盘上同 id 的 secret。
 */
export function mergeFeishuBotsPreserveSecrets(
  diskPrefs: MessagingPrefsStored | null,
  incoming: FeishuBotConfig[]
): FeishuBotConfig[] {
  const diskBots = getNormalizedFeishuBots(diskPrefs);
  const byId = new Map(diskBots.map((b) => [b.id, b]));
  const out: FeishuBotConfig[] = [];
  for (const inc of incoming) {
    const prev = byId.get(inc.id);
    const clear = Boolean((inc as Record<string, unknown>)['_clearAppSecret']);
    const next: FeishuBotConfig = { ...inc };
    delete (next as Record<string, unknown>)['_clearAppSecret'];
    if (clear) {
      delete next.appSecret;
    } else if (!String(inc.appSecret ?? '').trim() && prev?.appSecret) {
      next.appSecret = prev.appSecret;
    }
    out.push(next);
  }
  return out;
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
