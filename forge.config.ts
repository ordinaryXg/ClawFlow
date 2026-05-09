import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import fs from 'fs-extra';
import path from 'path';

const config: ForgeConfig = {
  /** Windows 常见 app.asar 占用；与旧 dist-pack 错峰输出，避免 EBUSY 无法 unlink */
  outDir: 'dist-pack-build',
  packagerConfig: {
    asar: true,
    // OpenClaw 将通过 postPackage 钩子复制到 resources 目录
    // 不在 asar 中打包 node_modules（webpack 已将其清空）
  },
  hooks: {
    postPackage: async (_config: unknown, results: unknown) => {
      // 获取输出路径
      const outputPaths: string[] = [];

      if (Array.isArray(results)) {
        for (const result of results) {
          const r = result as any;
          const paths = r.outputPaths || [r.outputPath];
          outputPaths.push(...(Array.isArray(paths) ? paths : [paths]));
        }
      } else if (results && typeof results === 'object') {
        const r = results as any;
        const paths = r.outputPaths || [r.outputPath];
        outputPaths.push(...(Array.isArray(paths) ? paths : [paths]));
      }
      
      // 默认路径
      if (outputPaths.length === 0) {
        outputPaths.push(path.join(process.cwd(), 'dist-pack-build', 'claw-flow-win32-x64'));
      }
      
      for (const outputPath of outputPaths) {
        const resourcesPath = path.join(outputPath, 'resources');
        const openclawDest = path.join(resourcesPath, 'openclaw-cli');
        
        console.log('[postPackage] Copying OpenClaw CLI to:', openclawDest);
        
        // 1. 先复制 OpenClaw 主目录（不包含 node_modules）
        const openclawSrc = path.join(process.cwd(), 'vendor', 'openclaw-standalone', 'node_modules', 'openclaw');
        if (await fs.pathExists(openclawSrc)) {
          // 确保目标目录存在
          await fs.ensureDir(openclawDest);
          
          // 复制 OpenClaw 主文件（排除 node_modules）
          const items = await fs.readdir(openclawSrc);
          for (const item of items) {
            if (item === 'node_modules') continue; // 跳过 node_modules
            
            const srcPath = path.join(openclawSrc, item);
            const destPath = path.join(openclawDest, item);
            
            await fs.copy(srcPath, destPath, { overwrite: true });
          }
          console.log('[postPackage] OpenClaw main files copied');
        } else {
          console.warn('[postPackage] OpenClaw source not found at:', openclawSrc);
        }
        
        // 2. 复制 OpenClaw 的依赖（从 vendor 目录）
        const depsSrc = path.join(process.cwd(), 'vendor', 'openclaw-standalone', 'node_modules');
        const depsDest = path.join(openclawDest, 'node_modules');
        
        if (await fs.pathExists(depsSrc)) {
          // 确保目标 node_modules 目录存在
          await fs.ensureDir(depsDest);
          
          // 复制所有依赖（排除 openclaw 本身，因为已经复制了）
          const items = await fs.readdir(depsSrc);
          for (const item of items) {
            if (item === 'openclaw') continue; // 已经复制了
            
            const srcPath = path.join(depsSrc, item);
            const destPath = path.join(depsDest, item);
            
            await fs.copy(srcPath, destPath, { overwrite: true });
          }
          console.log('[postPackage] OpenClaw dependencies copied');
        }
        
        console.log('[postPackage] OpenClaw CLI ready at:', openclawDest);
        
        // 3. 复制 node.exe 到 resources 目录（用于运行 .mjs 文件）
        const nodeExeDest = path.join(resourcesPath, 'node.exe');
        if (!await fs.pathExists(nodeExeDest)) {
          const nodeExeSrc = process.execPath; // postPackage 运行时，这是 node.exe
          try {
            await fs.copy(nodeExeSrc, nodeExeDest);
            console.log('[postPackage] node.exe copied to:', nodeExeDest);
          } catch (err) {
            console.warn('[postPackage] Failed to copy node.exe:', err);
          }
        }
      }
    }
  },
  // 注意：不配置 rebuildConfig，因为 OpenClaw 作为子进程运行
  // 其原生模块将由运行它的 Node.js 处理
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new WebpackPlugin({
      port: 9001,
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
