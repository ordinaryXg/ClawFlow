import type { ToolRuntime } from '../tool-runtime-core';
import { formatFeishuInvokeToolResult } from '../../../utils/tool-result-truncate';
import { larkCliDomainSupportsFormatFlag } from '../../../main/lark-cli/lark-cli-whitelist';

export function registerFeishuTools(rt: ToolRuntime): void {
  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_feishu_invoke',
        description:
          'Invoke Feishu/Lark Open Platform via bundled lark-cli. Use domain docs/sheets/base/drive/wiki/im/auth with args matching lark-cli subcommands (+ shortcuts). Prefer as=user for cloud docs, sheets and Base.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              enum: ['docs', 'sheets', 'base', 'drive', 'wiki', 'im', 'event', 'auth', 'api', 'calendar', 'contact', 'task', 'mail'],
              description: 'lark-cli top-level domain',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Arguments after domain (e.g. +fetch, --doc, token)',
            },
            as: {
              type: 'string',
              enum: ['user', 'bot'],
              description: 'Identity (default user for docs/base)',
            },
            botId: {
              type: 'string',
              description: 'Feishu bot profile id from settings (optional)',
            },
            yes: {
              type: 'boolean',
              description: 'Confirm high-risk write (after user approval)',
            },
            dryRun: {
              type: 'boolean',
              description: 'Preview request without executing',
            },
          },
          required: ['domain', 'args'],
          additionalProperties: false,
        },
      },
    },
    async (args, _ctx) => {
      const { invokeLarkCli } = await import('../../../main/lark-cli/lark-cli-invoke');
      const domain = String(args?.domain ?? '').trim();
      const rawArgs = Array.isArray(args?.args) ? args.args.map(String) : [];
      const as = args?.as === 'bot' ? 'bot' : args?.as === 'user' ? 'user' : 'user';
      const botId = typeof args?.botId === 'string' && args.botId.trim() ? args.botId.trim() : undefined;
      const yes = args?.yes === true;
      const dryRun = args?.dryRun === true;
      const res = await invokeLarkCli({
        domain,
        args: rawArgs,
        as,
        botId,
        yes,
        dryRun,
        ...(larkCliDomainSupportsFormatFlag(domain) ? { format: 'json' as const } : {}),
      });
      if (res.confirmationRequired) {
        return JSON.stringify(
          {
            ok: false,
            confirmation_required: true,
            message: res.confirmationRequired.message,
            hint: res.confirmationRequired.hint,
            action: res.confirmationRequired.action,
            retry_with_yes: true,
          },
          null,
          2
        );
      }
      return formatFeishuInvokeToolResult({
        ok: res.ok,
        exitCode: res.exitCode,
        json: res.json,
        stdout: res.stdout,
        stderr: res.stderr,
      });
    }
  );
}
