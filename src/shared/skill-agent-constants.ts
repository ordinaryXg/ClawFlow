/** 与主进程 / 渲染进程共享的 Skill Agent 常量 */

export const SKILL_AGENT_SLOT_ID = 'cf-skill-agent';

/** 不落盘主会话：Skill 审计 run 的虚拟会话 id（须不在 conversations 列表中） */
export const SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID = '__cf_skill_audit__';

/** 主对话每完成若干轮后触发一次技能进化审核 */
export const SKILL_EVOLUTION_INTERVAL_MAIN_TURNS = 10;
