import { getLarkCliConfigDir } from './lark-cli-path';

export function buildLarkCliEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    LARKSUITE_CLI_CONFIG_DIR: getLarkCliConfigDir(),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
  };
}
