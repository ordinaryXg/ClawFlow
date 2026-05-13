import path from 'path';
import type { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';

import { rules } from './webpack.rules';
import { plugins as basePlugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/index.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins: [
    ...basePlugins,
    // pdf-parse（主进程）依赖 pdfjs-dist/legacy，打包后在 .webpack/main 下解析 pdf.worker.mjs
    new CopyWebpackPlugin({
      patterns: [
        // 须与 pdf-parse 自带的 pdfjs-dist 版本一致（见 package-lock 中 pdf-parse/node_modules/pdfjs-dist）
        {
          from: path.join(
            __dirname,
            'node_modules',
            'pdf-parse',
            'node_modules',
            'pdfjs-dist',
            'legacy',
            'build',
            'pdf.worker.mjs'
          ),
          to: 'pdf.worker.mjs',
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  // ws 含原生/双导出逻辑，打进 bundle 会导致 WebSocketServer is not a constructor
  // better-sqlite3 为原生模块，须从 node_modules 加载（与 AutoUnpackNatives 配合）
  externals: {
    ws: 'commonjs ws',
    'better-sqlite3': 'commonjs better-sqlite3',
    /** 飞书 WS：运行时从 node_modules 加载，避免未安装时阻塞 webpack 解析；安装见 package.json */
    '@larksuiteoapi/node-sdk': 'commonjs @larksuiteoapi/node-sdk',
  },
};
