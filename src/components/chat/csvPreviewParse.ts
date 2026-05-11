import Papa from 'papaparse';

export const CSV_PREVIEW_MAX_ROWS = 500;

export type CsvPreviewModel =
  | {
      ok: true;
      columns: string[];
      rows: string[][];
      /** 解析得到的逻辑行数（不含表头） */
      totalDataRows: number;
      /** 是否因限行而未展示全部 */
      rowCapped: boolean;
    }
  | { ok: false };

function normalizeRow(cols: string[], row: Record<string, unknown>): string[] {
  return cols.map((c) => {
    const v = row[c];
    if (v == null) return '';
    return String(v);
  });
}

function parseAsObjects(text: string): CsvPreviewModel {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (h) => String(h ?? '').trim(),
  });
  const fatal = parsed.errors.filter((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
  if (fatal.length > 0 && parsed.data.length === 0) {
    return { ok: false };
  }
  let fields = (parsed.meta.fields ?? []).map((f) => String(f ?? '').trim());
  fields = fields.filter((f) => f.length > 0);
  if (fields.length === 0) {
    return { ok: false };
  }
  const data = parsed.data.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return Object.values(row).some((v) => String(v ?? '').trim() !== '');
  });
  const totalDataRows = data.length;
  const slice = data.slice(0, CSV_PREVIEW_MAX_ROWS);
  const rows = slice.map((row) => normalizeRow(fields, row));
  return {
    ok: true,
    columns: fields,
    rows,
    totalDataRows,
    rowCapped: totalDataRows > CSV_PREVIEW_MAX_ROWS,
  };
}

function parseAsArrays(text: string): CsvPreviewModel {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false };
  }
  const raw = parsed.data.filter((row) => row?.some((c) => String(c ?? '').trim() !== ''));
  if (raw.length === 0) {
    return { ok: false };
  }
  const width = Math.max(...raw.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const totalDataRows = raw.length;
  const capped = raw.slice(0, CSV_PREVIEW_MAX_ROWS);
  const rows = capped.map((r) => columns.map((_, i) => String(r[i] ?? '')));
  return {
    ok: true,
    columns,
    rows,
    totalDataRows,
    rowCapped: totalDataRows > CSV_PREVIEW_MAX_ROWS,
  };
}

/** 将 CSV 文本解析为表格模型；失败时返回 ok:false，由调用方退回纯文本预览 */
export function parseCsvForPreview(text: string): CsvPreviewModel {
  const trimmed = String(text ?? '').replace(/^\uFEFF/, '');
  if (!trimmed.trim()) {
    return { ok: false };
  }
  const asObj = parseAsObjects(trimmed);
  if (asObj.ok) return asObj;
  return parseAsArrays(trimmed);
}
