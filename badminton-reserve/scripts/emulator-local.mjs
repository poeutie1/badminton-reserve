import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const env = { ...process.env, CI: "true", XDG_CONFIG_HOME: resolve(".local-tools/config"), FIREBASE_EMULATORS_PATH: resolve(".local-tools/firebase") };
const jreDirectory = resolve(".local-tools/jre");
if (existsSync(jreDirectory)) {
  const jre = readdirSync(jreDirectory).map(name => join(jreDirectory, name, "Contents/Home"))
    .find(directory => existsSync(join(directory, "bin/java")));
  if (jre) { env.JAVA_HOME = jre; env.PATH = `${jre}/bin:${env.PATH}`; }
}
mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
const bundledCLI = join(homedir(), ".nodebrew/current/lib/node_modules/firebase-tools/lib/bin/firebase.js");
const args = ["emulators:start", "--only", "firestore", "--project", "demo-badminton-local", "--config", "firebase.local.json"];
const child = existsSync(bundledCLI)
  ? spawn(process.execPath, [bundledCLI, ...args], { env, stdio: "inherit" })
  : spawn("firebase", args, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
