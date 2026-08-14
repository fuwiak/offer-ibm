const path = require("path");
const fs = require("fs");
const { toChunks, reportEmbeddingProgress } = require("../../helpers");
const { v4 } = require("uuid");
const { SUPPORTED_NATIVE_EMBEDDING_MODELS } = require("./constants");
const { withOnnxLock, withModelDownloadLock } = require("./onnxLock");
const {
  resolveModelsCacheDir,
  forceModelRefresh,
  inspectCachedModel,
  ensureCacheDir,
  pinProcessCacheEnv,
  pinTransformersCacheEnv,
  ensureOnnxOnDisk,
  sidecarsPresent,
} = require("./modelDiskCache");

/** @type {Map<string, Promise<any>>} modelId -> in-flight / resolved pipeline */
const sharedPipelineByModel = new Map();

// Pin cache path before any @xenova/transformers import in this process.
pinProcessCacheEnv(resolveModelsCacheDir());

class NativeEmbedder {
  static defaultModel = "Xenova/all-MiniLM-L6-v2";

  /**
   * Supported embedding models for native.
   * @type {Record<string, {
   *   chunkPrefix: string;
   *   queryPrefix: string;
   *   apiInfo: {
   *     id: string;
   *     name: string;
   *     description: string;
   *     lang: string;
   *     size: string;
   *     modelCard: string;
   *   };
   * }>}
   */
  static supportedModels = SUPPORTED_NATIVE_EMBEDDING_MODELS;

  // This is a folder that Mintplex Labs hosts for those who cannot capture the HF model download
  // endpoint for various reasons. This endpoint is not guaranteed to be active or maintained
  // and may go offline at any time at Mintplex Labs's discretion.
  #fallbackHost = "https://cdn.offerKp.com/support/models/";

  constructor() {
    this.className = "NativeEmbedder";
    this.model = this.getEmbeddingModel();
    this.modelInfo = this.getEmbedderInfo();
    this.cacheDir = resolveModelsCacheDir();
    this.modelPath = path.resolve(this.cacheDir, ...this.model.split("/"));
    this.modelDownloaded = this.#refreshDownloadedFlag();

    // Limit of how many strings we can process in a single pass to stay with resource or network limits
    this.maxConcurrentChunks = this.modelInfo.maxConcurrentChunks;
    this.embeddingMaxChunkLength = this.modelInfo.embeddingMaxChunkLength;
    this.pipeline = null;

    ensureCacheDir(this.cacheDir);
    this.log(
      `Initialized ${this.model} (cache=${this.cacheDir}, onDisk=${this.modelDownloaded})`
    );
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  #refreshDownloadedFlag() {
    if (forceModelRefresh()) return false;
    return inspectCachedModel(this.cacheDir, this.model).complete;
  }

  /**
   * Get the selected model from the environment variable.
   * @returns {string}
   */
  static _getEmbeddingModel() {
    const envModel =
      process.env.EMBEDDING_MODEL_PREF ?? NativeEmbedder.defaultModel;
    if (NativeEmbedder.supportedModels?.[envModel]) return envModel;
    return NativeEmbedder.defaultModel;
  }

  get embeddingPrefix() {
    return NativeEmbedder.supportedModels[this.model]?.chunkPrefix || "";
  }

  get queryPrefix() {
    return NativeEmbedder.supportedModels[this.model]?.queryPrefix || "";
  }

  /**
   * Get the available models in an API response format
   * we can use to populate the frontend dropdown.
   * @returns {{id: string, name: string, description: string, lang: string, size: string, modelCard: string}[]}
   */
  static availableModels() {
    return Object.values(NativeEmbedder.supportedModels).map(
      (model) => model.apiInfo
    );
  }

  /**
   * Get the embedding model to use.
   * We only support a few models and will default to the default model if the environment variable is not set or not supported.
   *
   * Why only a few? Because we need to mirror them on the CDN so non-US users can download them.
   * eg: "Xenova/all-MiniLM-L6-v2"
   * eg: "Xenova/nomic-embed-text-v1"
   * @returns {string}
   */
  getEmbeddingModel() {
    const envModel =
      process.env.EMBEDDING_MODEL_PREF ?? NativeEmbedder.defaultModel;
    if (NativeEmbedder.supportedModels?.[envModel]) return envModel;
    return NativeEmbedder.defaultModel;
  }

  /**
   * Get the embedding model info.
   *
   * Will always fallback to the default model if the model is not supported.
   * @returns {Object}
   */
  getEmbedderInfo() {
    const model = this.getEmbeddingModel();
    return NativeEmbedder.supportedModels[model];
  }

  #tempfilePath() {
    const filename = `${v4()}.tmp`;
    const tmpPath = process.env.STORAGE_DIR
      ? path.resolve(process.env.STORAGE_DIR, "tmp")
      : path.resolve(__dirname, `../../../storage/tmp`);
    if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true });
    return path.resolve(tmpPath, filename);
  }

  async #writeToTempfile(filePath, data) {
    try {
      await fs.promises.appendFile(filePath, data, { encoding: "utf8" });
    } catch (e) {
      console.error(`Error writing to tempfile: ${e}`);
    }
  }

  async #ensureWeightsOnDisk() {
    const info = await ensureOnnxOnDisk(this.cacheDir, this.model, {
      force: forceModelRefresh(),
      fallbackHost: this.#fallbackHost.replace(/\/$/, ""),
      log: (msg) => this.log(msg),
    });
    this.modelDownloaded = Boolean(info.complete);
    return info;
  }

  /**
   * @param {string|null} hostOverride
   * @param {{ allowRemoteSidecars?: boolean }} [opts]
   */
  async #fetchWithHost(hostOverride = null, opts = {}) {
    try {
      // Weights must already be on disk — we stream them ourselves. xenova only
      // loads (plus small tokenizer/config sidecars on first run).
      const weights = await this.#ensureWeightsOnDisk();
      const useLocalOnly =
        weights.complete &&
        sidecarsPresent(this.cacheDir, this.model) &&
        !forceModelRefresh() &&
        !opts.allowRemoteSidecars;

      // Convert ESM to CommonJS via import so we can load this library.
      const pipeline = (...args) =>
        import("@xenova/transformers").then(({ pipeline, env }) => {
          pinTransformersCacheEnv(env, this.cacheDir, {
            localOnly: useLocalOnly,
          });

          if (useLocalOnly) {
            // Never attach progress_callback: xenova fires it on cache reads
            // and it looks like a download stuck at N%.
            return pipeline(...args);
          }

          if (hostOverride) {
            env.remoteHost = hostOverride;
            env.remotePathTemplate = "{model}/"; // Our S3 fallback url does not support revision File structure.
          }
          this.log(
            `sidecar fetch: ${this.model} via ${env.remoteHost} (onnx already local)`
          );
          return pipeline(...args);
        });

      return {
        pipeline: await pipeline("feature-extraction", this.model, {
          cache_dir: this.cacheDir,
          // Prefer local_files_only when onnx is complete. Sidecar JSON may
          // still be missing on a brand-new cache — then one remote pass
          // without progress spam for the big onnx (already on disk).
          ...(useLocalOnly
            ? { local_files_only: true }
            : {
                progress_callback: (data) => {
                  if (!data.hasOwnProperty("progress")) return;
                  // onnx is streamed by ensureOnnxOnDisk — ignore xenova's
                  // fake "download" progress for weights already on disk.
                  if (
                    String(data.file || "").includes("model_quantized.onnx") ||
                    String(data.file || "").endsWith(".onnx")
                  ) {
                    return;
                  }
                  console.log(
                    `\x1b[36m[NativeEmbedder - Downloading model]\x1b[0m ${
                      data.file
                    } ${~~data?.progress}%`
                  );
                },
              }),
        }),
        retry: false,
        error: null,
      };
    } catch (error) {
      return {
        pipeline: null,
        retry: hostOverride === null ? this.#fallbackHost : false,
        error,
      };
    }
  }

  // This function will do a single fallback attempt (not recursive on purpose) to try to grab the embedder model on first embed
  // since at time, some clients cannot properly download the model from HF servers due to a number of reasons (IP, VPN, etc).
  // Given this model is critical and nobody reads the GitHub issues before submitting the bug, we get the same bug
  // report 20 times a day: https://github.com/Mintplex-Labs/av-elia-bot/issues/821
  // So to attempt to monkey-patch this we have a single fallback URL to help alleviate duplicate bug reports.
  async embedderClient() {
    if (this.pipeline) return this.pipeline;

    // Sync get→set (no await between) — safe singleton under Node's single thread.
    let shared = sharedPipelineByModel.get(this.model);
    if (!shared) {
      shared = withModelDownloadLock(async () => {
        this.modelDownloaded = this.#refreshDownloadedFlag();
        if (!this.modelDownloaded) {
          this.log(
            "Native embedding model missing/incomplete on disk — streaming ONNX into cache once. Subsequent runs load from disk."
          );
        }

        let fetchResponse = await this.#fetchWithHost();
        if (fetchResponse.pipeline !== null) {
          this.modelDownloaded = true;
          return fetchResponse.pipeline;
        }

        // Local-only miss (sidecar gap) → one remote pass for JSON only.
        if (
          this.modelDownloaded ||
          inspectCachedModel(this.cacheDir, this.model).complete
        ) {
          this.log(
            `cache onnx present but load failed (${fetchResponse.error?.message || "unknown"}) — fetching sidecars from Hub`
          );
          fetchResponse = await this.#fetchWithHost(null, {
            allowRemoteSidecars: true,
          });
          if (fetchResponse.pipeline !== null) {
            this.modelDownloaded = true;
            return fetchResponse.pipeline;
          }
        }

        this.log(
          `Failed to load model from primary URL. Using fallback ${fetchResponse.retry}`
        );
        if (!!fetchResponse.retry)
          fetchResponse = await this.#fetchWithHost(fetchResponse.retry);
        if (fetchResponse.pipeline !== null) {
          this.modelDownloaded = true;
          return fetchResponse.pipeline;
        }

        throw fetchResponse.error;
      });
      sharedPipelineByModel.set(this.model, shared);
    }

    try {
      this.pipeline = await shared;
      this.modelDownloaded = true;
      return this.pipeline;
    } catch (error) {
      if (sharedPipelineByModel.get(this.model) === shared) {
        sharedPipelineByModel.delete(this.model);
      }
      throw error;
    }
  }

  /**
   * Apply the query prefix to the text input if it is required by the model.
   * eg: nomic-embed-text-v1 requires a query prefix for embedding/searching.
   * @param {string|string[]} textInput - The text to embed.
   * @returns {string|string[]} The text with the prefix applied.
   */
  #applyQueryPrefix(textInput) {
    if (!this.queryPrefix) return textInput;
    if (Array.isArray(textInput))
      textInput = textInput.map((text) => `${this.queryPrefix}${text}`);
    else textInput = `${this.queryPrefix}${textInput}`;
    return textInput;
  }

  /**
   * Embed a single text input.
   * @param {string|string[]} textInput - The text to embed.
   * @returns {Promise<Array<number>>} The embedded text.
   */
  async embedTextInput(textInput) {
    textInput = this.#applyQueryPrefix(textInput);
    const result = await this.embedChunks(
      Array.isArray(textInput) ? textInput : [textInput]
    );
    return result?.[0] || [];
  }

  // If you are thinking you want to edit this function - you probably don't.
  // This process was benchmarked heavily on a t3.small (2GB RAM 1vCPU)
  // and without careful memory management for the V8 garbage collector
  // this function will likely result in an OOM on any resource-constrained deployment.
  // To help manage very large documents we run a concurrent write-log each iteration
  // to keep the embedding result out of memory. The `maxConcurrentChunk` is set to 25,
  // as 50 seems to overflow no matter what. Given the above, memory use hovers around ~30%
  // during a very large document (>100K words) but can spike up to 70% before gc.
  // This seems repeatable for all document sizes.
  // While this does take a while, it is zero set up and is 100% free and on-instance.
  // It still may crash depending on other elements at play - so no promises it works under all conditions.
  async embedChunks(textChunks = []) {
    // Serialize all ONNX work process-wide — concurrent xenova/ort sessions
    // segfault under memory pressure (Lainey: SEGV mid ShopDB match stream).
    return withOnnxLock(() => this.#embedChunksUnlocked(textChunks));
  }

  async #embedChunksUnlocked(textChunks = []) {
    const tmpFilePath = this.#tempfilePath();
    const chunks = toChunks(textChunks, this.maxConcurrentChunks);
    const chunkLen = chunks.length;
    const totalChunks = textChunks.length;

    for (let [idx, chunk] of chunks.entries()) {
      if (idx === 0) await this.#writeToTempfile(tmpFilePath, "[");
      let data;
      let pipeline = await this.embedderClient();
      let output = await pipeline(chunk, {
        pooling: "mean",
        normalize: true,
      });

      if (output.length === 0) {
        pipeline = null;
        output = null;
        data = null;
        continue;
      }

      // After an ONNX-level failure (std::bad_array_new_length) transformers
      // can hand back tensors with BigInt dims — plain stringify then throws
      // "Do not know how to serialize a BigInt", masking the real error and
      // permanently disabling the embedder for the process. Convert instead.
      data = JSON.stringify(output.tolist(), (_key, value) =>
        typeof value === "bigint" ? Number(value) : value
      );
      await this.#writeToTempfile(tmpFilePath, data);
      this.log(`Embedded Chunk Group ${idx + 1} of ${chunkLen}`);
      if (chunkLen - 1 !== idx) await this.#writeToTempfile(tmpFilePath, ",");
      if (chunkLen - 1 === idx) await this.#writeToTempfile(tmpFilePath, "]");

      reportEmbeddingProgress(
        Math.min((idx + 1) * this.maxConcurrentChunks, totalChunks),
        totalChunks
      );
      pipeline = null;
      output = null;
      data = null;
    }

    const embeddingResults = JSON.parse(
      fs.readFileSync(tmpFilePath, { encoding: "utf-8" })
    );
    fs.rmSync(tmpFilePath, { force: true });
    return embeddingResults.length > 0 ? embeddingResults.flat() : null;
  }
}

/** Test helper — drop shared pipelines (does not delete disk cache). */
function resetNativeEmbedderPipelinesForTests() {
  sharedPipelineByModel.clear();
}

module.exports = {
  NativeEmbedder,
  resetNativeEmbedderPipelinesForTests,
};
