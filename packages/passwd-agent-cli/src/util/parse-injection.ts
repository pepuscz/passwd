/**
 * Parsed injection spec from --inject VAR=SECRET_ID:FIELD.
 */
export interface InjectionSpec {
  varName: string;
  secretId: string;
  field: string;
}

/**
 * Environment variables that must never be set via --inject.
 * These can hijack process execution, load arbitrary code, or redirect
 * network traffic before the child process runs user-visible commands.
 */
const BLOCKED_ENV_VARS = new Set([
  // Dynamic linker — load arbitrary shared objects
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",

  // Runtime code injection
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "RUBYLIB",
  "RUBYOPT",
  "PERL5LIB",
  "PERL5OPT",

  // Process execution redirection
  "PATH",
  "HOME",
  "SHELL",
  "BASH_ENV",
  "ENV",
  "CDPATH",

  // TLS / proxy interception
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "NO_PROXY",

  // passwd-internal (already scrubbed, but block explicit override too)
  "PASSWD_ORIGIN",
  "PASSWD_API_URL",
  "PASSWD_CLIENT_ID",
]);

/**
 * Parse a single --inject spec string into its components.
 * Format: VAR=SECRET_ID:FIELD
 *
 * Throws on malformed input or blocked variable names.
 */
export function parseInjection(spec: string): InjectionSpec {
  const eqIdx = spec.indexOf("=");
  if (eqIdx === -1) {
    throw new Error(`Invalid --inject format: '${spec}'. Expected VAR=SECRET_ID:FIELD`);
  }
  const varName = spec.slice(0, eqIdx);
  const rest = spec.slice(eqIdx + 1);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Invalid --inject format: '${spec}'. Expected VAR=SECRET_ID:FIELD`);
  }
  if (BLOCKED_ENV_VARS.has(varName)) {
    throw new Error(`Blocked environment variable: '${varName}'. Cannot override security-sensitive variables via --inject.`);
  }
  const secretId = rest.slice(0, colonIdx);
  const field = rest.slice(colonIdx + 1);
  return { varName, secretId, field };
}

/**
 * Parse a single --inject-file spec: VAR=SECRET_ID, or VAR=SECRET_ID:file.
 * The only field a file injection can take is the attachment itself.
 *
 * Throws on malformed input or blocked variable names.
 */
export function parseFileInjection(spec: string): InjectionSpec {
  const eqIdx = spec.indexOf("=");
  if (eqIdx === -1 || eqIdx === spec.length - 1) {
    throw new Error(`Invalid --inject-file format: '${spec}'. Expected VAR=SECRET_ID`);
  }
  const varName = spec.slice(0, eqIdx);
  if (BLOCKED_ENV_VARS.has(varName)) {
    throw new Error(`Blocked environment variable: '${varName}'. Cannot override security-sensitive variables via --inject-file.`);
  }
  const rest = spec.slice(eqIdx + 1);
  const colonIdx = rest.indexOf(":");
  const secretId = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
  const field = colonIdx === -1 ? "file" : rest.slice(colonIdx + 1);
  if (field !== "file") {
    throw new Error(`Invalid --inject-file field: '${field}'. Only the file attachment can be injected as a file`);
  }
  return { varName, secretId, field };
}
