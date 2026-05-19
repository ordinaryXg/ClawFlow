/**
 * @deprecated 请从 `hermes-memory-index-hooks` 导入；本文件保留 re-export 以兼容旧路径。
 */
export {
  isWorkspaceRelativeUnderHermesSkillTree,
  isWorkspaceRelativeUnderMainMemoryTree,
  isWorkspaceRelativeUnderHermesIndexedTextTree,
  patchSummaryTouchesHermesSkillTree,
  patchSummaryTouchesHermesIndexedText,
  refreshHermesMemoryIndexBestEffort,
  refreshHermesSkillMemoryIndexBestEffort,
} from './hermes-memory-index-hooks';
export type { PatchPathsSummary } from './hermes-memory-index-hooks';
