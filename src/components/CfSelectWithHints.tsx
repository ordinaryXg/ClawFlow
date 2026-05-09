import { Select, Tooltip } from 'antd';
import './cf-select-hint.css';

export type CfHintOption = {
  value: string;
  label: string;
  hint: string;
};

export type CfSelectWithHintsProps = {
  id?: string;
  className?: string;
  popupClassName?: string;
  /** 与 antd Form.Item 连用时由 Form 注入 */
  value?: string;
  onChange?: (v: string) => void;
  options: CfHintOption[];
  disabled?: boolean;
  'aria-label'?: string;
  popupMatchSelectWidth?: boolean | number;
  /** 用于 ⓘ 的 aria-label 前缀 */
  hintIconAriaBase: string;
};

export function CfSelectWithHints({
  id,
  className = '',
  popupClassName = '',
  value: valueProp,
  onChange: onChangeProp,
  options,
  disabled,
  'aria-label': ariaLabel,
  popupMatchSelectWidth = false,
  hintIconAriaBase,
}: CfSelectWithHintsProps) {
  const value = valueProp ?? '';
  const onChange = onChangeProp ?? (() => {});
  return (
    <Select<string>
      id={id}
      className={`cf-selectHint ${className}`.trim()}
      popupClassName={`cf-selectHintDropdown ${popupClassName}`.trim()}
      disabled={disabled}
      value={value}
      onChange={(v) => onChange(String(v))}
      optionLabelProp="label"
      aria-label={ariaLabel}
      popupMatchSelectWidth={popupMatchSelectWidth}
    >
      {options.map((o) => (
        <Select.Option key={o.value === '' ? '__empty' : o.value} value={o.value} label={o.label}>
          <div className="cf-selectHintRow">
            <span className="cf-selectHintRow__label">{o.label}</span>
            <Tooltip title={o.hint} placement="right" mouseEnterDelay={0.12} getPopupContainer={() => document.body}>
              <button
                type="button"
                className="cf-selectHintRow__ico"
                aria-label={`${hintIconAriaBase} · ${o.label}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                ⓘ
              </button>
            </Tooltip>
          </div>
        </Select.Option>
      ))}
    </Select>
  );
}
