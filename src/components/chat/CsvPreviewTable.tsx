import { FC } from 'react';
import type { TFunction } from 'i18next';
import type { CsvPreviewModel } from './csvPreviewParse';
import { CSV_PREVIEW_MAX_ROWS } from './csvPreviewParse';

type OkModel = Extract<CsvPreviewModel, { ok: true }>;

export const CsvPreviewTable: FC<{
  model: OkModel;
  fileTruncated: boolean;
  t: TFunction;
}> = ({ model, fileTruncated, t }) => {
  return (
    <div className="cf-filePreview__csvWrap">
      {fileTruncated ? (
        <div className="cf-filePreview__warn cf-sub">{t('chat.rightTabs.previewTruncated')}</div>
      ) : null}
      <div className="cf-filePreview__csvScroll">
        <table className="cf-filePreview__csvTable">
          <thead>
            <tr>
              {model.columns.map((c, ci) => (
                <th key={`${ci}:${c}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cf-sub cf-filePreview__csvMeta">
        {t('chat.rightTabs.previewCsvMeta', {
          shown: model.rows.length,
          total: model.totalDataRows,
          max: CSV_PREVIEW_MAX_ROWS,
        })}
        {model.rowCapped ? ` ${t('chat.rightTabs.previewCsvRowCap')}` : ''}
      </div>
    </div>
  );
};
