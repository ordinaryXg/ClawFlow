/** Webpack `asset/source`：工作区初始化用 Markdown 模板以字符串形式导入 */
declare module '*.md' {
  const content: string;
  export default content;
}
