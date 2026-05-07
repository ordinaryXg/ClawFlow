import fs from "node:fs";
import { execSync } from "node:child_process";

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const input = fs.readFileSync(0, "utf8");
const event = safeJsonParse(input) ?? {};
const cmd =
  event?.command ??
  event?.input?.command ??
  event?.toolInput?.command ??
  event?.arguments?.command ??
  "";

function hasLogChanges() {
  try {
    const out = execSync("git status --porcelain=v1", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
    if (!out) return false;
    return out
      .split(/\r?\n/)
      .some((line) => line.includes("AICodeFile/90_LOGS/") || line.includes("AICodeFile\\90_LOGS\\"));
  } catch {
    return false;
  }
}

// Only warn on commit/push commands.
if (typeof cmd === "string" && cmd.match(/git\s+(commit|push)/)) {
  if (!hasLogChanges()) {
    process.stdout.write(
      JSON.stringify({
        permission: "ask",
        user_message:
          "提示：检测到你在执行 git commit/push，但本次工作区未发现 AICodeFile/90_LOGS/ 的日志变更。建议先回写进度日志再提交（除非这次提交仅为配置/清理类）。",
        agent_message: "Warned about missing log changes on commit/push."
      }) + "\n"
    );
    process.exit(0);
  }
}

process.stdout.write(JSON.stringify({ permission: "allow" }) + "\n");

