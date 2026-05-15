import { posixBasename } from './electron-data-transfer-files';

describe('electron-data-transfer-files', () => {
  it('posixBasename handles windows and posix', () => {
    expect(posixBasename('C:\\Users\\me\\doc.txt')).toBe('doc.txt');
    expect(posixBasename('/a/b/c.md')).toBe('c.md');
    expect(posixBasename('nosep')).toBe('nosep');
  });
});
