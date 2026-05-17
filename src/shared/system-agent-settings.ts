/** 系统级 Agent 全局偏好（应用缓存 `system/.clawflow/system-agent-settings.v1.json`） */

export type SystemAgentSettings = {
  /** 发送主对话前是否运行认知分配 Agent */
  cognitiveAllocationEnabled: boolean;
  /** 认知分配专用模型；空则沿用发送时模型 / Ask 默认 */
  cognitiveAllocationModelId: string;
  /** M3/M4 时是否在主对话前运行预期规划 Agent */
  expectationPlanningEnabled: boolean;
  /** 预期规划专用模型；空则沿用发送时模型 / Plan 默认 */
  expectationPlanningModelId: string;
  /** 聊天输入区上方显示 M1–M5 分类调试条 */
  showModeClassificationDebug: boolean;
};

export const DEFAULT_SYSTEM_AGENT_SETTINGS: SystemAgentSettings = {
  cognitiveAllocationEnabled: true,
  cognitiveAllocationModelId: '',
  expectationPlanningEnabled: true,
  expectationPlanningModelId: '',
  showModeClassificationDebug: true,
};

export const SYSTEM_AGENT_SETTINGS_BROADCAST = 'cf-system-agent-settings-updated';
