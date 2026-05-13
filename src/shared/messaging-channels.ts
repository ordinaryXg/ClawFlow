/**
 * 通讯渠道标识：飞书已实现；其余为占位，供设置页与后续扩展统一引用。
 */
export const MESSAGING_CHANNEL = {
  FEISHU: 'feishu',
  WECHAT: 'wechat',
  DINGTALK: 'dingtalk',
} as const;

export type MessagingChannelId = (typeof MESSAGING_CHANNEL)[keyof typeof MESSAGING_CHANNEL];

export const PLACEHOLDER_MESSAGING_CHANNELS: ReadonlyArray<{
  id: Exclude<MessagingChannelId, 'feishu'>;
  nameKey: string;
}> = [
  { id: 'wechat', nameKey: 'settings.messagingChannelWechat' },
  { id: 'dingtalk', nameKey: 'settings.messagingChannelDingTalk' },
];
