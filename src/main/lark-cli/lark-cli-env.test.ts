import { buildLarkCliEnv } from './lark-cli-env';

describe('buildLarkCliEnv', () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it('strips Hermes/OpenClaw agent signals so ClawFlow-managed config is used', () => {
    process.env.HERMES_HOME = 'C:\\Users\\me\\hermes';
    process.env.OPENCLAW_HOME = 'C:\\Users\\me\\.openclaw';
    process.env.HERMES_GATEWAY_TOKEN = 'secret';
    process.env.CLAWFLOW_TEST_MARKER = 'keep-me';

    const env = buildLarkCliEnv();

    expect(env.HERMES_HOME).toBeUndefined();
    expect(env.OPENCLAW_HOME).toBeUndefined();
    expect(env.HERMES_GATEWAY_TOKEN).toBeUndefined();
    expect(env.CLAWFLOW_TEST_MARKER).toBe('keep-me');
    expect(env.LARKSUITE_CLI_CONFIG_DIR).toBeTruthy();
    expect(env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER).toBe('1');
  });
});
