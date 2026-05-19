#!/usr/bin/env python3
"""
Hermes SKILL.md 验证脚本（ClawFlow 版）
检查 .agent/.skills/<name>/ 下技能包的质量、完整性与安全性。

用法:
  python .agent/.skills/skill-creator/scripts/validate_skill.py .agent/.skills/my-skill
  python validate_skill.py <绝对或相对路径>
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List


class SkillValidator:
    def __init__(self, skill_path: str):
        self.skill_path = Path(skill_path).resolve()
        self.skill_md_path = self.skill_path / "SKILL.md"
        self.issues: List[str] = []
        self.warnings: List[str] = []
        self.security_issues: Dict[str, List[str]] = {"P0": [], "P1": [], "P2": []}

    def validate(self) -> bool:
        print(f"🔍 验证 Hermes 技能: {self.skill_path.name}")
        print("=" * 60)

        self.check_file_structure()

        if self.skill_md_path.exists():
            content = self.skill_md_path.read_text(encoding="utf-8")
            self.check_frontmatter(content)
            self.check_markdown_structure(content)
            self.check_examples(content)
            self.check_security(content)
            self.check_clawflow_paths(content)

        self.check_meta_json()
        self.print_report()

        return len(self.security_issues["P0"]) == 0 and len(self.issues) == 0

    def check_file_structure(self) -> None:
        print("\n📁 文件结构...")
        if not self.skill_path.is_dir():
            self.issues.append(f"❌ 目录不存在: {self.skill_path}")
            return

        if not self.skill_md_path.is_file():
            self.issues.append("❌ 缺少 SKILL.md")

        if not (self.skill_path / "_meta.json").is_file():
            self.warnings.append("⚠️ 缺少推荐文件 _meta.json")

        if (self.skill_path / "references").is_dir():
            print("  ✅ references/")
        if (self.skill_path / "scripts").is_dir():
            print("  ✅ scripts/")
        if (self.skill_path / "examples").is_dir():
            print("  ✅ examples/")

    def check_frontmatter(self, content: str) -> None:
        print("\n📝 YAML frontmatter...")
        match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if not match:
            self.issues.append("❌ 缺少 YAML frontmatter（建议 Hermes 技能以 --- 包裹元数据）")
            return

        fm = match.group(1)
        for field in ("name", "description", "version"):
            if f"{field}:" not in fm:
                self.warnings.append(f"⚠️ frontmatter 建议包含: {field}")

    def check_markdown_structure(self, content: str) -> None:
        print("\n📋 Markdown 结构...")
        for section in ("工作流程", "Workflow", "示例", "Examples", "触发"):
            if section in content:
                print(f"  ✅ 含「{section}」相关章节")
                break
        else:
            self.warnings.append("⚠️ 未找到工作流程/触发词/示例类章节")

    def check_examples(self, content: str) -> None:
        print("\n💡 示例...")
        if not re.search(r"##\s+示例|##\s+Examples|###\s+示例", content):
            self.warnings.append("⚠️ 建议增加「示例」章节")

    def check_clawflow_paths(self, content: str) -> None:
        print("\n🦞 ClawFlow 路径...")
        if ".agent/.skills" in content or "workspace_skill_" in content:
            print("  ✅ 提及工作区技能路径或工具")
        else:
            self.warnings.append(
                "⚠️ 未提及 .agent/.skills 或 workspace_skill_*；若仅文档型技能可忽略"
            )
        if re.search(r"~/.cursor/skills", content) and ".agent/.skills" not in content:
            self.warnings.append(
                "⚠️ 仅引用 Cursor 个人技能路径；工作区 Hermes 技能应写在 .agent/.skills/"
            )

    def check_security(self, content: str) -> None:
        print("\n🔒 安全扫描...")
        p0 = [
            (r"os\.system\s*\(", "命令注入风险: os.system"),
            (r"subprocess\.[^(]+\([^)]*shell\s*=\s*True", "subprocess shell=True"),
            (r"eval\s*\(", "eval()"),
            (r"(?i)(api[_-]?key|secret|password)\s*=\s*['\"][^'\"]+['\"]", "可能的密钥硬编码"),
        ]
        p1 = [
            (r"requests\.(get|post)\s*\(", "HTTP 请求需防 SSRF"),
            (r"open\s*\([^)]*['\"]w", "文件写入需防路径穿越"),
        ]
        for pattern, desc in p0:
            if re.search(pattern, content):
                self.security_issues["P0"].append(desc)
        for pattern, desc in p1:
            if re.search(pattern, content):
                self.security_issues["P1"].append(desc)

    def check_meta_json(self) -> None:
        print("\n📦 _meta.json...")
        meta_path = self.skill_path / "_meta.json"
        if not meta_path.is_file():
            return
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            for field in ("name", "version", "description"):
                if field not in meta:
                    self.warnings.append(f"⚠️ _meta.json 缺少字段: {field}")
            print("  ✅ JSON 合法")
        except json.JSONDecodeError as e:
            self.issues.append(f"❌ _meta.json 解析失败: {e}")

    def print_report(self) -> None:
        print("\n" + "=" * 60)
        print("📊 报告")
        if self.issues:
            print(f"\n❌ {len(self.issues)} 个问题:")
            for i in self.issues:
                print(f"  {i}")
        if self.warnings:
            print(f"\n⚠️ {len(self.warnings)} 条警告:")
            for w in self.warnings:
                print(f"  {w}")
        for level in ("P0", "P1", "P2"):
            if self.security_issues[level]:
                print(f"\n{level}: {len(self.security_issues[level])} 项")
                for s in self.security_issues[level]:
                    print(f"  - {s}")
        print("\n" + "=" * 60)
        if self.security_issues["P0"] or self.issues:
            print("❌ 未通过")
        else:
            print("✅ 通过（含警告时仍可使用，建议迭代）")


def main() -> None:
    if len(sys.argv) < 2:
        print("用法: python validate_skill.py <skill-directory>")
        print("示例: python .agent/.skills/skill-creator/scripts/validate_skill.py .agent/.skills/my-skill")
        sys.exit(1)
    v = SkillValidator(sys.argv[1])
    sys.exit(0 if v.validate() else 1)


if __name__ == "__main__":
    main()
