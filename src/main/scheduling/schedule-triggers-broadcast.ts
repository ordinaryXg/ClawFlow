import { broadcastToWorkspaceWindows } from '../broadcast/workspace-window-broadcast';

export function broadcastScheduleTriggersUpdated(workspaceRoot: string): void {
  broadcastToWorkspaceWindows(workspaceRoot, 'schedule-triggers:updated', { workspaceRoot });
}
