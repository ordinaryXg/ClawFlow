import { getLarkCliConfigDir } from './lark-cli-path';

/** Env vars that make lark-cli treat the process as an OpenClaw/Hermes agent workspace. */
const LARK_CLI_AGENT_ENV_KEYS = [
  'OPENCLAW_CLI',
  'OPENCLAW_HOME',
  'OPENCLAW_STATE_DIR',
  'OPENCLAW_CONFIG_PATH',
  'HERMES_HOME',
  'HERMES_QUIET',
  'HERMES_EXEC_ASK',
  'HERMES_GATEWAY_TOKEN',
  'HERMES_SESSION_KEY',
] as const;

function withoutAgentEnvSignals(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const key of LARK_CLI_AGENT_ENV_KEYS) {
    delete out[key];
  }
  return out;
}

export function buildLarkCliEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...withoutAgentEnvSignals(process.env),
    ...extra,
    LARKSUITE_CLI_CONFIG_DIR: getLarkCliConfigDir(),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
  };
}
