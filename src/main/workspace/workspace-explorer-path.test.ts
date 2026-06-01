import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizeUserWorkspaceRelativePath,
  resolvePathInsideWorkspace,
} from './workspace-explorer';

describe('normalizeUserWorkspaceRelativePath', () => {
  const root = path.join(os.tmpdir(), 'cf-ws-path-test');

  it('accepts relative posix paths', () => {
    expect(normalizeUserWorkspaceRelativePath(root, 'docs/report.pdf')).toBe('docs/report.pdf');
    expect(normalizeUserWorkspaceRelativePath(root, '.agent/.knowledge/uploads/x.pdf')).toBe(
      '.agent/.knowledge/uploads/x.pdf'
    );
  });

  it('normalizes backslashes', () => {
    expect(normalizeUserWorkspaceRelativePath(root, 'docs\\report.pdf')).toBe('docs/report.pdf');
  });

  it('strips absolute paths under workspace root', () => {
    const abs = path.join(root, 'docs', 'report.pdf');
    expect(normalizeUserWorkspaceRelativePath(root, abs)).toBe('docs/report.pdf');
  });

  it('rejects paths outside workspace', () => {
    const outside = path.join(os.tmpdir(), 'cf-outside-ingest', 'report.pdf');
    expect(() => normalizeUserWorkspaceRelativePath(root, outside)).toThrow('Path escapes workspace');
  });
});

describe('resolvePathInsideWorkspace with normalized input', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ingest-ws-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'report.pdf'), '%PDF-1.4\n', 'utf8');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves relative and absolute inputs to the same file', () => {
    const rel = normalizeUserWorkspaceRelativePath(root, 'docs/report.pdf');
    const absInput = path.join(root, 'docs', 'report.pdf');
    const relFromAbs = normalizeUserWorkspaceRelativePath(root, absInput);
    expect(resolvePathInsideWorkspace(root, rel)).toBe(resolvePathInsideWorkspace(root, relFromAbs));
  });
});
