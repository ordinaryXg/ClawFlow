# Bundled lark-cli binaries

ClawFlow ships `lark-cli` beside the app (`resources/lark-cli/{platform}/{arch}/`).

## Fetch before package / local dev

```bash
npm run lark-cli:fetch          # current OS + arch
npm run lark-cli:fetch -- --all # all platforms (optional, for release builds)
```

`npm run make` / `npm run package` run `lark-cli:fetch` automatically via `premake` / `prepackage`.

If no bundled binary exists at runtime, the app falls back to downloading into `%APPDATA%/claw-flow/lark-cli/bin/` (or equivalent userData).
