/** Jest：检测当前 Node 能否加载与 Electron 匹配的 better-sqlite3 native 模块。 */
export function canLoadBetterSqlite3(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const BetterSqlite = require('better-sqlite3') as new (path: string) => { close: () => void };
    const db = new BetterSqlite(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}
