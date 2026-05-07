import fs from "node:fs";
import path from "node:path";

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const input = fs.readFileSync(0, "utf8");
const event = safeJsonParse(input) ?? {};

// Heuristic: Cursor hook payloads vary; handle common shapes.
const filePath =
  event?.path ??
  event?.filePath ??
  event?.input?.path ??
  event?.toolInput?.path ??
  event?.arguments?.path ??
  "";

if (typeof filePath === "string" && filePath.replaceAll("\\", "/").includes("AICodeFile/")) {
  const stateDir = path.join(process.cwd(), ".cursor", "hooks", "_state");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "aicodefile_read.flag"), String(Date.now()), "utf8");
}

process.stdout.write(JSON.stringify({}) + "\n");

