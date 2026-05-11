import path from 'path';
import type { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';

import { rules } from './webpack.rules';
import { plugins as basePlugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins: [
    ...basePlugins,
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
          to: 'pdf.worker.min.mjs',
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    // 避免解析到 pdf-parse 嵌套的旧版 pdfjs-dist，须与 CopyWebpackPlugin 复制的 worker 同版本
    alias: {
      'pdfjs-dist': path.resolve(__dirname, 'node_modules', 'pdfjs-dist'),
    },
  },
};
