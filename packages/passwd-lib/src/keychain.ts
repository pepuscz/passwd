import { execFile } from "node:child_process";

const SERVICE = "passwd.team";
const TIMEOUT = 10_000;

type Backend = "security" | "secret-tool" | "none";
let _backend: Backend | null = null; // null = not yet checked

function run(cmd: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: TIMEOUT }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
    if (stdin !== undefined && child.stdin) {
      child.stdin.end(stdin);
    }
  });
}

async function detectBackend(): Promise<Backend> {
  if (_backend !== null) return _backend;

  if (process.platform === "darwin") {
    try {
      await run("security", ["default-keychain"]);
      _backend = "security";
    } catch {
      _backend = "none";
    }
  } else if (process.platform === "linux") {
    try {
      await run("which", ["secret-tool"]);
      _backend = "secret-tool";
    } catch {
      _backend = "none";
    }
  } else {
    _backend = "none";
  }

  return _backend;
}

function securityQuote(arg: string): string {
  if (/[\r\n\0]/.test(arg)) {
    throw new Error("Keychain arguments must not contain line breaks or NUL characters");
  }
  return `"${arg.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * Build the `security -i` input line that stores a generic password. The
 * value travels over stdin instead of argv, so it never shows up in the
 * process list.
 */
export function securityAddCommand(service: string, account: string, value: string): string {
  const args = ["-s", service, "-a", account, "-w", value].map((a, i) =>
    i % 2 === 0 ? a : securityQuote(a),
  );
  return `add-generic-password ${args.join(" ")} -U\n`;
}

export async function isKeychainAvailable(): Promise<boolean> {
  return (await detectBackend()) !== "none";
}

export async function keychainSave(account: string, value: string): Promise<boolean> {
  const backend = await detectBackend();
  if (backend === "none") return false;
  try {
    if (backend === "security") {
      // `security -i` reads the command from stdin (no process list exposure)
      await run("security", ["-i"], securityAddCommand(SERVICE, account, value));
    } else {
      // secret-tool reads the value from stdin (no process list exposure)
      await run("secret-tool", [
        "store",
        "--label", SERVICE,
        "service", SERVICE,
        "account", account,
      ], value);
    }
    return true;
  } catch {
    return false;
  }
}

export async function keychainLoad(account: string): Promise<string | null> {
  const backend = await detectBackend();
  if (backend === "none") return null;
  try {
    if (backend === "security") {
      const result = await run("security", [
        "find-generic-password",
        "-s", SERVICE,
        "-a", account,
        "-w",
      ]);
      return result.trim() || null;
    } else {
      const result = await run("secret-tool", [
        "lookup",
        "service", SERVICE,
        "account", account,
      ]);
      return result.trim() || null;
    }
  } catch {
    return null;
  }
}

export function resetKeychainCache(): void {
  _backend = null;
}
