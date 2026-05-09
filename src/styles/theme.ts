import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

export type AppTheme = 'light' | 'dark';

const BASE_TOKEN = {
  colorPrimary: '#1E5B45',
  colorInfo: '#1E5B45',
  colorSuccess: '#1E5B45',
  colorWarning: '#8A6A2A',
  colorError: '#C24B4B',
  borderRadius: 0,
  borderRadiusLG: 0,
  borderRadiusSM: 0,
  fontFamily:
    'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  fontFamilyCode:
    'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
};

export function getAntdTheme(appTheme: AppTheme): ThemeConfig {
  const isLight = appTheme === 'light';
  return {
    algorithm: isLight ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
    token: {
      ...BASE_TOKEN,
      colorBgLayout: isLight ? '#f4f5f7' : '#0F1113',
      colorBgContainer: isLight ? '#ffffff' : '#1A1D21',
      colorBorder: isLight ? '#d8dce3' : '#2F353D',
      colorText: isLight ? '#1a1d21' : '#E6E9ED',
      colorTextSecondary: isLight ? '#5c6370' : '#A7B0B8',
    },
    components: {
      Button: {
        controlHeight: 34,
        paddingInline: 12,
      },
      Card: {
        borderRadiusLG: 0,
      },
      Menu: {
        itemBorderRadius: 0,
      },
      Drawer: {
        colorBgElevated: isLight ? '#ffffff' : '#1A1D21',
      },
      Modal: {
        colorBgElevated: isLight ? '#ffffff' : '#1A1D21',
      },
      Popconfirm: {
        colorBgElevated: isLight ? '#ffffff' : '#1A1D21',
      },
      /** 下拉选项：提高未选中项与悬停对比度（避免灰字白底难辨认） */
      Select: {
        colorBgElevated: isLight ? '#ffffff' : '#1A1D21',
        optionSelectedBg: isLight ? '#cfe6d8' : 'rgba(30,91,69,.28)',
        optionActiveBg: isLight ? '#e8f0ec' : 'rgba(255,255,255,.08)',
        optionSelectedColor: isLight ? '#0d1117' : '#E6E9ED',
        colorText: isLight ? '#1a1d21' : '#E6E9ED',
      },
      Dropdown: {
        colorBgElevated: isLight ? '#ffffff' : '#1A1D21',
        colorText: isLight ? '#1a1d21' : '#E6E9ED',
      },
    },
  };
}

