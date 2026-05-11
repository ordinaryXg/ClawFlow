/**
 * Excel / PDF 预览与文本提取（主进程，供 workspace-explorer 与工具调用）
 */

import * as XLSX from 'xlsx';

/** 单文件 Office 预览体积上限（与图片上限分开，避免误开超大 xlsx） */
export const WORKSPACE_OFFICE_PREVIEW_MAX_BYTES = 18 * 1024 * 1024;

const EXCEL_PREVIEW_MAX_CHARS = 200_000;
const PDF_TEXT_MAX_CHARS = 56_000;
const PDF_PARSE_MAX_PAGES = 40;

export const EXCEL_PREVIEW_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.ods']);
export const PDF_PREVIEW_EXTENSIONS = new Set(['.pdf']);

export function previewExcelBuffer(buf: Buffer): { text: string; truncated: boolean } {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const parts: string[] = [];
  const maxSheets = Math.min(6, wb.SheetNames.length);
  let acc = 0;
  for (let i = 0; i < maxSheets; i++) {
    const name = wb.SheetNames[i];
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
    const lines = csv.split(/\r?\n/);
    const maxRows = 150;
    const slice = lines.slice(0, maxRows);
    let block = `=== Sheet: ${name} ===\n${slice.join('\n')}`;
    if (lines.length > maxRows) block += `\n… (${lines.length - maxRows} more rows not shown)`;
    parts.push(block);
    acc += block.length + 2;
    if (acc >= EXCEL_PREVIEW_MAX_CHARS) break;
  }
  let text = parts.join('\n\n');
  if (text.length > EXCEL_PREVIEW_MAX_CHARS) {
    return { text: `${text.slice(0, EXCEL_PREVIEW_MAX_CHARS)}\n… (truncated)`, truncated: true };
  }
  return { text, truncated: false };
}

export async function previewPdfBuffer(buf: Buffer): Promise<{
  base64: string;
  textExtract: string;
  truncated: boolean;
  numpages: number;
}> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buf });
  try {
    const data = await parser.getText({ first: PDF_PARSE_MAX_PAGES });
    let text = String(data?.text ?? '').trim();
    const numpages = typeof data?.total === 'number' ? data.total : 0;
    const truncated = text.length > PDF_TEXT_MAX_CHARS;
    if (truncated) text = `${text.slice(0, PDF_TEXT_MAX_CHARS)}\n… (text truncated)`;
    return {
      base64: buf.toString('base64'),
      textExtract: text,
      truncated,
      numpages,
    };
  } finally {
    await parser.destroy();
  }
}
