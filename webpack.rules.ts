import path from 'path';
import type { ModuleOptions } from 'webpack';

export const rules: Required<ModuleOptions>['rules'] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
      },
    },
  },
  /** 工作区模板与引擎提示词：打包为纯文本字符串 */
  {
    test: /\.md$/i,
    include: (abs: string) => {
      const n = abs.replace(/\\/g, '/');
      return (
        n.includes('/workspace-templates/') ||
        n.endsWith('/workspace-templates') ||
        n.includes('/engine/prompts/')
      );
    },
    type: 'asset/source',
  },
];
