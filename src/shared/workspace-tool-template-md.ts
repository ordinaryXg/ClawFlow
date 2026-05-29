/**
 * 从 `workspace-tool-docs/*.md` 加载工作区工具契约正文。
 * 工具名列表仍由 `workspace-tool-manifest-bridge.ts` 注入（`{{TOOLS:…}}` 占位符）。
 */

import docsTemplate from './workspace-tool-docs/docs.md';
import browserTemplate from './workspace-tool-docs/browser.md';
import shellTemplate from './workspace-tool-docs/shell.md';
import gitTemplate from './workspace-tool-docs/git.md';
import schedulingTemplate from './workspace-tool-docs/scheduling.md';
import skillsTemplate from './workspace-tool-docs/skills.md';
import knowledgeBaseTemplate from './workspace-tool-docs/knowledge_base.md';
import feishuTemplate from './workspace-tool-docs/feishu.md';

import {
  WORKSPACE_CAPABILITY_TOOL_NAMES,
  WORKSPACE_TOOLS_ALWAYS_ALLOWED,
} from './workspace-tool-manifest-bridge';
import type { WorkspaceToolId } from './workspace-tools';

function bulletTools(names: readonly string[]): string {
  return names.map((n) => `- \`${n}\``).join('\n');
}

function alwaysAllowedInline(): string {
  return WORKSPACE_TOOLS_ALWAYS_ALLOWED.map((n) => `\`${n}\``).join('、');
}

type ToolPlaceholderId = WorkspaceToolId | 'web_search' | 'web_scrape';

function renderToolDoc(template: string): string {
  let out = template;
  for (const [capId, names] of Object.entries(WORKSPACE_CAPABILITY_TOOL_NAMES) as Array<
    [ToolPlaceholderId, readonly string[]]
  >) {
    out = out.split(`{{TOOLS:${capId}}}`).join(bulletTools(names));
  }
  out = out.split('{{ALWAYS_ALLOWED}}').join(alwaysAllowedInline());
  return out.endsWith('\n') ? out : `${out}\n`;
}

export function buildWorkspaceToolDocsMd(): string {
  return renderToolDoc(docsTemplate);
}

export function buildWorkspaceToolBrowserMd(): string {
  return renderToolDoc(browserTemplate);
}

export function buildWorkspaceToolShellMd(): string {
  return renderToolDoc(shellTemplate);
}

export function buildWorkspaceToolGitMd(): string {
  return renderToolDoc(gitTemplate);
}

export function buildWorkspaceToolSchedulingMd(): string {
  return renderToolDoc(schedulingTemplate);
}

export function buildWorkspaceToolSkillsMd(): string {
  return renderToolDoc(skillsTemplate);
}

export function buildWorkspaceToolKnowledgeBaseMd(): string {
  return renderToolDoc(knowledgeBaseTemplate);
}

export function buildWorkspaceToolFeishuMd(): string {
  return renderToolDoc(feishuTemplate);
}
