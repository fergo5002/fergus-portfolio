import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url),
    ),
    production ? "start" : "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.LAB_PORT || "3106",
  ],
  { cwd: root, env: { ...process.env, FERGUSOS_LAB: "1" }, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
