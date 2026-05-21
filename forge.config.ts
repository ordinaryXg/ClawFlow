import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import fs from 'fs-extra';
import path from 'path';

/** 与 webpack.main.config.ts `externals` 一致；打包后须出现在 app 的 node_modules 中 */
const MAIN_PROCESS_EXTERNAL_PACKAGES = [
  'ws',
  'better-sqlite3',
  'sqlite-vec',
] as const;

async function copyExternalPackage(
  packageName: string,
  projectRoot: string,
  buildPath: string,
  visited: Set<string>
): Promise<void> {
  if (visited.has(packageName)) return;
  visited.add(packageName);

  const srcDir = path.join(projectRoot, 'node_modules', packageName);
  if (!(await fs.pathExists(srcDir))) {
    console.warn(`[ClawFlow pack] missing external package: ${packageName}`);
    return;
  }

  const destDir = path.join(buildPath, 'node_modules', packageName);
  await fs.mkdirp(path.dirname(destDir));
  await fs.copy(srcDir, destDir, { overwrite: true, dereference: true });

  let pkgJson: { dependencies?: Record<string, string> } = {};
  try {
    pkgJson = await fs.readJson(path.join(srcDir, 'package.json'));
  } catch {
    return;
  }

  for (const depName of Object.keys(pkgJson.dependencies ?? {})) {
    if (depName.startsWith('@types/')) continue;
    await copyExternalPackage(depName, projectRoot, buildPath, visited);
  }
}

const config: ForgeConfig = {
  /** Windows 常见 app.asar 占用；每次输出到不同目录，避免 EBUSY 无法 unlink */
  outDir: `dist-pack-build-${Date.now()}`,
  packagerConfig: {
    asar: true,
    extraResource: ['./resources/lark-cli'],
  },
  hooks: {
    prePackage: async () => {
      const projectRoot = path.resolve(__dirname);
      const { defaultHostPlatformArch, fetchOne, targetOutDir, binaryName } = await import(
        './scripts/lark-cli-download-lib.mjs'
      );
      const { platformKey, archKey } = defaultHostPlatformArch();
      const destBin = path.join(targetOutDir(platformKey, archKey), binaryName(platformKey));
      if (!(await fs.pathExists(destBin))) {
        console.log(`[ClawFlow pack] lark-cli missing at ${destBin}, fetching…`);
        await fetchOne(platformKey, archKey);
      }
    },
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const projectRoot = path.resolve(__dirname);
      const visited = new Set<string>();
      for (const name of MAIN_PROCESS_EXTERNAL_PACKAGES) {
        await copyExternalPackage(name, projectRoot, buildPath, visited);
      }
    },
  },
  // 注意：不配置 rebuildConfig；原生依赖由 Electron / 运行时按需处理
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      port: 9001,
      // 允许 renderer 连接本机 GatewayDaemon（ws/http），否则浏览器 WebSocket 会被 CSP 拦截
      devContentSecurityPolicy:
        "default-src 'self' 'unsafe-inline' data:; " +
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' data:; " +
        "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*;",
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
