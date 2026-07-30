const fs = require("fs");
const os = require("os");
const path = require("path");

describe("pipelineDiagnostics", () => {
  let tmpDir;
  let prevStorage;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-kp-pipeline-"));
    prevStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = tmpDir;
  });

  afterEach(() => {
    if (prevStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevStorage;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function load() {
    // eslint-disable-next-line global-require
    return require("../../../utils/offerKp/pipelineDiagnostics");
  }

  it("formats LLM context with match progress", () => {
    const {
      createPipelineDiagnostics,
      updateMatchProgress,
      formatDiagnosticsForLlm,
    } = load();
    const diag = createPipelineDiagnostics({
      requestId: "abc",
      intent: { primaryIntent: "create_quote", confidence: 0.95 },
    });
    updateMatchProgress(diag, {
      progressStage: "searching",
      matchedCount: 7,
      total: 9,
    });
    const block = formatDiagnosticsForLlm(diag);
    expect(block).toContain("matching: 7/9");
    expect(block).toContain("create_quote");
    expect(block).toContain("requestId: abc");
  });

  it("enriches Connection error with stage and match progress", () => {
    const {
      createPipelineDiagnostics,
      updateMatchProgress,
      setGenerationTarget,
      formatAbortError,
    } = load();
    const diag = createPipelineDiagnostics({ requestId: "r1" });
    updateMatchProgress(diag, { matchedCount: 7, total: 9 });
    setGenerationTarget(diag, { provider: "LMStudio", model: "qwen" });
    const msg = formatAbortError(new Error("Connection error."), diag);
    expect(msg).toContain("Connection error.");
    expect(msg).toContain("7/9");
    expect(msg).toContain("generation");
    expect(msg).toContain("requestId=r1");
  });

  it("persists failure JSONL for ops / LLM follow-up", async () => {
    const {
      createPipelineDiagnostics,
      updateMatchProgress,
      recordPipelineFailure,
      FAILURES_FILE,
    } = load();
    const diag = createPipelineDiagnostics({ requestId: "fail-1" });
    updateMatchProgress(diag, { matchedCount: 7, total: 9 });
    recordPipelineFailure(diag, new Error("Connection error."));
    await new Promise((r) => setTimeout(r, 50));
    const raw = fs.readFileSync(FAILURES_FILE, "utf8");
    expect(raw).toContain("fail-1");
    expect(raw).toContain("Connection error.");
    expect(raw).toContain('"matchedCount":7');
  });
});
