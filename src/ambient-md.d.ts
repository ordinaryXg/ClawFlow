/** Webpack `asset/source`：`workspace-templates` 与 `engine/prompts` 下 .md 以字符串形式导入 */
declare module '*.md' {
  const content: string;
  export default content;
}
