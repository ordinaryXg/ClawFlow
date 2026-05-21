import { findFeishuBotById, readMessagingPrefsFile, type FeishuBotConfig } from '../prefs/messaging-prefs';
import { syncLarkCliProfileForBot } from './lark-cli-config-sync';
import { LarkCliError } from './lark-cli-errors';

export function resolveFeishuBotCredentials(
  botId: string,
  override?: { appId?: string; appSecret?: string }
): { bot: FeishuBotConfig; appId: string; appSecret: string } {
  const file = readMessagingPrefsFile();
  const bot = findFeishuBotById(file, botId);
  if (!bot) {
    throw new LarkCliError('missing_bot', { exitCode: 1, stdout: '', stderr: '' });
  }
  const appId = String(override?.appId ?? bot.appId ?? process.env.FEISHU_APP_ID ?? '').trim();
  const appSecret = String(override?.appSecret ?? bot.appSecret ?? process.env.FEISHU_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) {
    throw new LarkCliError('missing_credentials', { exitCode: 1, stdout: '', stderr: '' });
  }
  return { bot, appId, appSecret };
}

export async function ensureLarkCliProfileForBot(
  botId: string,
  override?: { appId?: string; appSecret?: string }
): Promise<void> {
  const { bot, appId, appSecret } = resolveFeishuBotCredentials(botId, override);
  await syncLarkCliProfileForBot({ ...bot, appId, appSecret });
}
