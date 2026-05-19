import { broadcastToWorkspaceWindows } from '../broadcast/workspace-window-broadcast';

export function broadcastScrapeJobsUpdated(workspaceRoot: string): void {
  broadcastToWorkspaceWindows(workspaceRoot, 'scrape:jobsUpdated', { workspaceRoot });
}
