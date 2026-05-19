import { broadcastToWorkspaceWindows } from '../broadcast/workspace-window-broadcast';

export function broadcastTodoTriggersUpdated(workspaceRoot: string): void {
  broadcastToWorkspaceWindows(workspaceRoot, 'todo-triggers:updated', { workspaceRoot });
}
