/**
 * `*** Begin Patch` / `*** End Patch` 多文件补丁解析与应用（工作区 `apply_patch` 工具使用）。
 */
import * as fs from 'fs/promises';
import * as path from 'path';

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';
const EOF_MARKER = '*** End of File';
const CHANGE_CONTEXT_MARKER = '@@ ';
const EMPTY_CHANGE_CONTEXT_MARKER = '@@';

export type ApplyPatchSummary = { added: string[]; modified: string[]; deleted: string[] };

type AddFileHunk = { kind: 'add'; path: string; contents: string };
type DeleteFileHunk = { kind: 'delete'; path: string };
type UpdateFileChunk = { changeContext?: string; oldLines: string[]; newLines: string[]; isEndOfFile: boolean };
type UpdateFileHunk = { kind: 'update'; path: string; movePath?: string; chunks: UpdateFileChunk[] };
type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

export type ParsedPatch = { hunks: Hunk[]; patch: string };

export function parsePatchText(input: string): ParsedPatch {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) throw new Error('Invalid patch: input is empty.');
  const lines = trimmed.split(/\r?\n/);
  const validated = checkPatchBoundariesLenient(lines);
  const hunks: Hunk[] = [];

  const lastLineIndex = validated.length - 1;
  let remaining = validated.slice(1, lastLineIndex);
  let lineNumber = 2;
  while (remaining.length > 0) {
    const { hunk, consumed } = parseOneHunk(remaining, lineNumber);
    hunks.push(hunk);
    lineNumber += consumed;
    remaining = remaining.slice(consumed);
  }
  return { hunks, patch: validated.join('\n') };
}

function checkPatchBoundariesLenient(lines: string[]): string[] {
  const strictError = checkPatchBoundariesStrict(lines);
  if (!strictError) return lines;
  if (lines.length < 4) throw new Error(strictError);

  const first = lines[0];
  const last = lines[lines.length - 1];
  if (
    last &&
    (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') &&
    last.endsWith('EOF')
  ) {
    const inner = lines.slice(1, -1);
    const innerError = checkPatchBoundariesStrict(inner);
    if (!innerError) return inner;
    throw new Error(innerError);
  }
  throw new Error(strictError);
}

function checkPatchBoundariesStrict(lines: string[]): string | null {
  const firstLine = lines[0]?.trim();
  const lastLine = lines[lines.length - 1]?.trim();
  if (firstLine === BEGIN_PATCH_MARKER && lastLine === END_PATCH_MARKER) return null;
  if (firstLine !== BEGIN_PATCH_MARKER) return "The first line of the patch must be '*** Begin Patch'";
  if (lastLine !== END_PATCH_MARKER) return "The last line of the patch must be '*** End Patch'";
  return null;
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: Hunk; consumed: number } {
  const header = lines[0] ?? '';
  if (header.startsWith(ADD_FILE_MARKER)) {
    const filePath = header.slice(ADD_FILE_MARKER.length).trim();
    if (!filePath) throw new Error(`Invalid Add File header at line ${lineNumber}`);
    const body: string[] = [];
    let i = 1;
    for (; i < lines.length; i++) {
      const ln = lines[i] ?? '';
      if (ln.startsWith('*** ')) break;
      if (!ln.startsWith('+')) throw new Error(`Invalid add-file line at ${lineNumber + i}: must start with +`);
      body.push(ln.slice(1));
    }
    return { hunk: { kind: 'add', path: filePath, contents: body.join('\n') + '\n' }, consumed: i };
  }
  if (header.startsWith(DELETE_FILE_MARKER)) {
    const filePath = header.slice(DELETE_FILE_MARKER.length).trim();
    if (!filePath) throw new Error(`Invalid Delete File header at line ${lineNumber}`);
    return { hunk: { kind: 'delete', path: filePath }, consumed: 1 };
  }
  if (header.startsWith(UPDATE_FILE_MARKER)) {
    const filePath = header.slice(UPDATE_FILE_MARKER.length).trim();
    if (!filePath) throw new Error(`Invalid Update File header at line ${lineNumber}`);
    let movePath: string | undefined;
    let i = 1;
    if ((lines[i] ?? '').startsWith(MOVE_TO_MARKER)) {
      movePath = String(lines[i] ?? '').slice(MOVE_TO_MARKER.length).trim();
      if (!movePath) throw new Error(`Invalid Move to header at line ${lineNumber + i}`);
      i += 1;
    }
    const chunks: UpdateFileChunk[] = [];
    let current: UpdateFileChunk | null = null;
    const pushCurrent = () => {
      if (current) chunks.push(current);
      current = null;
    };

    for (; i < lines.length; i++) {
      const ln = lines[i] ?? '';
      if (ln.startsWith('*** ')) break;
      if (ln === EOF_MARKER) {
        if (!current) current = { oldLines: [], newLines: [], isEndOfFile: true };
        current.isEndOfFile = true;
        pushCurrent();
        continue;
      }
      if (ln === EMPTY_CHANGE_CONTEXT_MARKER || ln.startsWith(CHANGE_CONTEXT_MARKER)) {
        pushCurrent();
        const ctx = ln === EMPTY_CHANGE_CONTEXT_MARKER ? undefined : ln.slice(CHANGE_CONTEXT_MARKER.length);
        current = { changeContext: ctx, oldLines: [], newLines: [], isEndOfFile: false };
        continue;
      }
      if (!current) current = { oldLines: [], newLines: [], isEndOfFile: false };
      const lead = ln[0];
      const rest = ln.slice(1);
      if (lead === '-') current.oldLines.push(rest);
      else if (lead === '+') current.newLines.push(rest);
      else if (lead === ' ') {
        current.oldLines.push(rest);
        current.newLines.push(rest);
      } else {
        throw new Error(`Invalid patch line at ${lineNumber + i}: '${ln}'`);
      }
    }
    pushCurrent();
    if (chunks.length === 0) throw new Error(`No update chunks found for ${filePath}`);
    return { hunk: { kind: 'update', path: filePath, movePath, chunks }, consumed: i };
  }
  throw new Error(`Invalid patch header at line ${lineNumber}: '${header}'`);
}

export async function applyUpdateHunk(
  filePath: string,
  chunks: UpdateFileChunk[],
  options?: { readFile?: (filePath: string) => Promise<string> }
): Promise<string> {
  const reader = options?.readFile ?? ((p: string) => fs.readFile(p, 'utf8'));
  const originalContents = await reader(filePath).catch((err) => {
    throw new Error(`Failed to read file to update ${filePath}: ${err}`);
  });
  const originalLines = originalContents.split('\n');
  if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') originalLines.pop();

  const replacements = computeReplacements(originalLines, filePath, chunks);
  let newLines = applyReplacements(originalLines, replacements);
  if (newLines.length === 0 || newLines[newLines.length - 1] !== '') newLines = [...newLines, ''];
  return newLines.join('\n');
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[]
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;
  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const ctxIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (ctxIndex === null) throw new Error(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
      lineIndex = ctxIndex + 1;
    }
    if (chunk.oldLines.length === 0) {
      const insertionIndex =
        originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
          ? originalLines.length - 1
          : originalLines.length;
      replacements.push([insertionIndex, 0, chunk.newLines]);
      continue;
    }
    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    if (found === null && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1);
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') newSlice = newSlice.slice(0, -1);
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }
    if (found === null) {
      throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`);
    }
    replacements.push([found, pattern.length, newSlice]);
    lineIndex = found + pattern.length;
  }
  replacements.sort((a, b) => a[0] - b[0]);
  return replacements;
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
  const result = [...lines];
  for (const [startIndex, oldLen, newLines] of [...replacements].reverse()) {
    for (let i = 0; i < oldLen; i += 1) {
      if (startIndex < result.length) result.splice(startIndex, 1);
    }
    for (let i = 0; i < newLines.length; i += 1) result.splice(startIndex + i, 0, newLines[i]);
  }
  return result;
}

function seekSequence(lines: string[], pattern: string[], start: number, eof: boolean): number | null {
  if (pattern.length === 0) return start;
  if (pattern.length > lines.length) return null;

  const maxStart = lines.length - pattern.length;
  const searchStart = eof && lines.length >= pattern.length ? maxStart : start;
  if (searchStart > maxStart) return null;

  for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (v) => v)) return i;
  for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (v) => v.trimEnd())) return i;
  for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (v) => v.trim())) return i;
  for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (v) => normalizePunctuation(v.trim()))) return i;
  return null;
}

function linesMatch(
  lines: string[],
  pattern: string[],
  start: number,
  normalize: (value: string) => string
): boolean {
  for (let idx = 0; idx < pattern.length; idx += 1) {
    if (normalize(lines[start + idx]) !== normalize(pattern[idx])) return false;
  }
  return true;
}

function normalizePunctuation(value: string): string {
  return Array.from(value)
    .map((char) => {
      switch (char) {
        case '\u2010':
        case '\u2011':
        case '\u2012':
        case '\u2013':
        case '\u2014':
        case '\u2015':
        case '\u2212':
          return '-';
        case '\u2018':
        case '\u2019':
        case '\u201A':
        case '\u201B':
          return "'";
        case '\u201C':
        case '\u201D':
        case '\u201E':
        case '\u201F':
          return '"';
        case '\u00A0':
        case '\u2002':
        case '\u2003':
        case '\u2004':
        case '\u2005':
        case '\u2006':
        case '\u2007':
        case '\u2008':
        case '\u2009':
        case '\u200A':
        case '\u202F':
        case '\u205F':
        case '\u3000':
          return ' ';
        default:
          return char;
      }
    })
    .join('');
}

export function formatSummary(summary: ApplyPatchSummary): string {
  const lines = ['Success. Updated the following files:'];
  for (const f of summary.added) lines.push(`A ${f}`);
  for (const f of summary.modified) lines.push(`M ${f}`);
  for (const f of summary.deleted) lines.push(`D ${f}`);
  return lines.join('\n');
}

