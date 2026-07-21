/**
 * 同目录临时文件 + rename，尽量原子替换（Windows 下先删目标再 rename）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export async function atomicWriteUtf8File(destAbs: string, content: string): Promise<void> {
  const dir = path.dirname(destAbs);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.cf-atomic-${randomUUID()}.tmp`);
  await fs.promises.writeFile(tmp, content, 'utf8');
  try {
    await fs.promises.rm(destAbs, { force: true });
  } catch {
    /* ignore */
  }
  await fs.promises.rename(tmp, destAbs);
}
