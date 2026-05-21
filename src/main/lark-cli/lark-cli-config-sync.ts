import type { FeishuBotConfig } from '../prefs/messaging-prefs';
import { profileNameForBotId } from './lark-cli-path';
import { runLarkCliOrThrow } from './lark-cli-runner';

export async function syncLarkCliProfileForBot(bot: FeishuBotConfig): Promise<void> {
  const appId = String(bot.appId ?? '').trim();
  const appSecret = String(bot.appSecret ?? '').trim();
  if (!appId || !appSecret) return;

  const profile = profileNameForBotId(bot.id);
  const argv = [
    '--profile',
    profile,
    'config',
    'init',
    '--app-id',
    appId,
    '--app-secret-stdin',
    '--brand',
    'feishu',
    '--name',
    profile,
  ];
  await runLarkCliOrThrow(argv, { stdin: `${appSecret}\n`, timeoutMs: 60_000 });
}

export async function syncLarkCliProfilesFromBots(bots: FeishuBotConfig[]): Promise<{ synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];
  for (const bot of bots) {
    if (!String(bot.appId ?? '').trim() || !String(bot.appSecret ?? '').trim()) continue;
    try {
      await syncLarkCliProfileForBot(bot);
      synced += 1;
    } catch (e: unknown) {
      errors.push(`${bot.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { synced, errors };
}
