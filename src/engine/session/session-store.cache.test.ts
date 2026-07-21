import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore } from '../session/session-store';

describe('SessionStore memory cache', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-session-cache-'));
  });

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reuses in-memory cache across readAll without re-reading disk', async () => {
    const store = new SessionStore(dir);
    const now = Date.now();
    await store.writeAll([
      {
        id: 'c1',
        title: '主会话',
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const readSpy = jest.spyOn(fs.promises, 'readFile');
    const first = await store.readAll();
    const second = await store.readAll();

    expect(first).toBe(second);
    expect(readSpy).not.toHaveBeenCalled();
    readSpy.mockRestore();
  });
});
