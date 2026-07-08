const { execFile } = require("child_process");
const { promisify } = require("util");
const { offerKpLog } = require("./offerKpLog");

const execFileAsync = promisify(execFile);

const LMS_BIN_PATH = process.env.LMSTUDIO_LMS_BIN_PATH || "/root/.lmstudio/bin";
const LMS_LOAD_GPU = process.env.LMSTUDIO_LMS_GPU || "max";
const LMS_SWITCH_SLEEP_MS = Number(process.env.LMSTUDIO_LMS_SWITCH_SLEEP_MS || 2000);

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function resolveLmStudioSshTarget() {
  if (process.env.LMSTUDIO_LMS_SSH) {
    return String(process.env.LMSTUDIO_LMS_SSH).trim();
  }
  try {
    const base =
      process.env.LMSTUDIO_BASE_PATH || "http://87.228.90.43:1234/v1";
    const url = new URL(base);
    const host = url.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      const user = process.env.LMSTUDIO_LMS_SSH_USER || "root";
      return `${user}@${host}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildSshArgs(sshTarget) {
  const args = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no"];
  const keyPath = process.env.LMSTUDIO_LMS_SSH_KEY;
  if (keyPath) args.push("-i", keyPath);
  args.push(sshTarget);
  return args;
}

async function execLmStudioRemoteShell(shellScript, opts = {}) {
  const sshTarget = opts.sshTarget || resolveLmStudioSshTarget();
  if (!sshTarget) return null;

  const timeoutMs = opts.timeoutMs || 300_000;
  const args = buildSshArgs(sshTarget);
  args.push(shellScript);

  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("ssh", args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, TERM: "dumb" },
    });
    return {
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
      durationMs: Date.now() - startedAt,
      via: "ssh",
    };
  } catch (error) {
    const err = new Error(
      error?.stderr?.toString?.() ||
        error?.stdout?.toString?.() ||
        error?.message ||
        "LM Studio SSH command failed"
    );
    err.cause = error;
    throw err;
  }
}

/**
 * lms unload --all → sleep 2 → lms load MODEL --context-length N --gpu max
 * @param {string} modelId
 * @param {{ contextLength?: number, gpu?: string, sshTarget?: string }} [opts]
 */
async function loadLmStudioModelViaCli(modelId, opts = {}) {
  const id = String(modelId || "").trim();
  if (!id) throw new Error("modelId is required");

  const contextLength =
    opts.contextLength ||
    Number(process.env.LMSTUDIO_MODEL_TOKEN_LIMIT) ||
    32768;
  const gpu = opts.gpu || LMS_LOAD_GPU;

  const shellScript = [
    `export PATH=${shellQuote(`${LMS_BIN_PATH}:$PATH`)}`,
    "lms unload --all",
    `sleep ${Math.max(1, Math.round(LMS_SWITCH_SLEEP_MS / 1000))}`,
    `lms load ${shellQuote(id)} --context-length ${contextLength} --gpu ${shellQuote(gpu)}`,
  ].join(" && ");

  offerKpLog("info", "LM Studio CLI model switch", {
    model: id,
    contextLength,
    gpu,
    ssh: opts.sshTarget || resolveLmStudioSshTarget(),
  });

  const result = await execLmStudioRemoteShell(shellScript, opts);
  if (!result) return null;

  const combined = `${result.stdout}\n${result.stderr}`;
  if (/error loading model/i.test(combined)) {
    throw new Error(
      combined
        .split("\n")
        .map((line) => line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim())
        .filter(Boolean)
        .slice(-4)
        .join(" ") || "LM Studio CLI load failed"
    );
  }

  const loadTimeMatch = combined.match(/loaded successfully in ([\d.]+)s/i);
  const loadTimeSeconds = loadTimeMatch ? Number(loadTimeMatch[1]) : null;

  return {
    success: true,
    model: id,
    status: "loaded",
    alreadyLoaded: false,
    loadTimeSeconds,
    contextLength,
    via: "lms-cli",
    stdout: result.stdout,
  };
}

module.exports = {
  loadLmStudioModelViaCli,
  execLmStudioRemoteShell,
  resolveLmStudioSshTarget,
  LMS_SWITCH_SLEEP_MS,
};
