/**
 * Hermes 技能正文轻量安全扫描（S7）；失败则拒绝写入。
 */

export function guardHermesSkillTextContent(text: string): { ok: true } | { ok: false; reason: string } {
  const s = String(text ?? '');
  const max = 512 * 1024;
  if (s.length > max) {
    return { ok: false, reason: `content exceeds ${max} characters` };
  }
  if (/<script[\s/>]/i.test(s)) {
    return { ok: false, reason: '<script> is not allowed in skill text' };
  }
  if (/\bjavascript:\s*[^\s]/i.test(s)) {
    return { ok: false, reason: 'javascript: URLs are not allowed in skill text' };
  }
  return { ok: true };
}

/** 技能目录名：一级文件夹名，如 my-skill */
export function assertValidSkillFolderName(name: string): { ok: true; name: string } | { ok: false; reason: string } {
  const n = String(name ?? '').trim();
  if (!n) return { ok: false, reason: 'skill_name is empty' };
  if (n.length > 128) return { ok: false, reason: 'skill_name too long' };
  if (!/^[a-zA-Z0-9._-]+$/.test(n)) {
    return { ok: false, reason: 'skill_name must match /^[a-zA-Z0-9._-]+$/' };
  }
  if (n === '.' || n === '..') return { ok: false, reason: 'invalid skill_name' };
  return { ok: true, name: n };
}
