import fs from "node:fs";
import path from "node:path";

const flagPath = path.join(process.cwd(), ".cursor", "hooks", "_state", "aicodefile_read.flag");

if (!fs.existsSync(flagPath)) {
  // For preToolUse, returning permission + message is supported.
  // If Cursor ignores stdout, failClosed will still prevent the edit.
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      user_message:
        "已启用仓库流程：在进行任何代码修改前，必须先读取 AICodeFile（00_INDEX、产品原型、代码架构、功能说明）。请先阅读后再继续写代码。",
      agent_message: "Blocked ApplyPatch because AICodeFile has not been read in this session."
    }) + "\n"
  );
  process.exit(2);
}

process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");

