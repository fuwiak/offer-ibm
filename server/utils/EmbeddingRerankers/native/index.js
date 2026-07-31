"use strict";

const path = require("path");
const {
  resolveModelsCacheDir,
  forceModelRefresh,
  inspectCachedModel,
  ensureCacheDir,
  pinTransformersCacheEnv,
  ensureOnnxOnDisk,
} = require("../../EmbeddingEngines/native/modelDiskCache");

class NativeEmbeddingReranker {
  static #model = null;
  static #tokenizer = null;
  static #transformers = null;
  static #initializationPromise = null;

  // This is a folder that Mintplex Labs hosts for those who cannot capture the HF model download
  // endpoint for various reasons. This endpoint is not guaranteed to be active or maintained
  // and may go offline at any time at Mintplex Labs's discretion.
  #fallbackHost = "https://cdn.offerKp.com/support/models/";

  constructor() {
    // An alternative model to the mixedbread-ai/mxbai-rerank-xsmall-v1 model (speed on CPU is much slower for this model @ 18docs = 6s)
    // Model Card: https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2 (speed on CPU is much faster @ 18docs = 1.6s)
    this.model = "Xenova/ms-marco-MiniLM-L-6-v2";
    this.cacheDir = resolveModelsCacheDir();
    this.modelPath = path.resolve(this.cacheDir, ...this.model.split("/"));
    ensureCacheDir(this.cacheDir);

    this.modelDownloaded =
      !forceModelRefresh() &&
      inspectCachedModel(this.cacheDir, this.model).complete;
    this.log(
      `Initialized (cache=${this.cacheDir}, onDisk=${this.modelDownloaded})`
    );
  }

  log(text, ...args) {
    console.log(`\x1b[36m[NativeEmbeddingReranker]\x1b[0m ${text}`, ...args);
  }

  /**
   * This function will return the host of the current reranker suite.
   * If the reranker suite is not initialized, it will return the default HF host.
   * @returns {string} The host of the current reranker suite.
   */
  get host() {
    if (!NativeEmbeddingReranker.#transformers) return "https://huggingface.co";
    try {
      return new URL(NativeEmbeddingReranker.#transformers.env.remoteHost).host;
    } catch {
      return this.#fallbackHost;
    }
  }

  /**
   * This function will preload the reranker suite and tokenizer.
   * This is useful for reducing the latency of the first rerank call and pre-downloading the models and such
   * to avoid having to wait for the models to download on the first rerank call.
   */
  async preload() {
    try {
      this.log(`Preloading reranker suite...`);
      await this.initClient();
      this.log(
        `Preloaded reranker suite. Reranking is available as a service now.`
      );
      return;
    } catch (e) {
      console.error(e);
      this.log(
        `Failed to preload reranker suite. Reranking will be available on the first rerank call.`
      );
      return;
    }
  }

  async initClient() {
    if (
      NativeEmbeddingReranker.#transformers &&
      NativeEmbeddingReranker.#model &&
      NativeEmbeddingReranker.#tokenizer
    ) {
      this.log(`Reranker suite already fully initialized - reusing.`);
      return;
    }

    if (NativeEmbeddingReranker.#initializationPromise) {
      this.log(`Waiting for existing initialization to complete...`);
      await NativeEmbeddingReranker.#initializationPromise;
      return;
    }

    NativeEmbeddingReranker.#initializationPromise = (async () => {
      try {
        await ensureOnnxOnDisk(this.cacheDir, this.model, {
          force: forceModelRefresh(),
          fallbackHost: this.#fallbackHost.replace(/\/$/, ""),
          log: (msg) => this.log(msg),
        });
        this.modelDownloaded = inspectCachedModel(
          this.cacheDir,
          this.model
        ).complete;

        const { AutoModelForSequenceClassification, AutoTokenizer, env } =
          await import("@xenova/transformers");
        const useLocalOnly = this.modelDownloaded && !forceModelRefresh();
        pinTransformersCacheEnv(env, this.cacheDir, {
          localOnly: useLocalOnly,
        });
        this.log(
          useLocalOnly
            ? `using cached model at ${inspectCachedModel(this.cacheDir, this.model).onnxPath}`
            : `download: loading reranker suite into ${this.cacheDir}`
        );
        NativeEmbeddingReranker.#transformers = {
          AutoModelForSequenceClassification,
          AutoTokenizer,
          env,
        };
        await this.#getPreTrainedModel();
        await this.#getPreTrainedTokenizer();
      } finally {
        NativeEmbeddingReranker.#initializationPromise = null;
      }
    })();

    await NativeEmbeddingReranker.#initializationPromise;
  }

  /**
   * This function will load the model from the local file system cache, or download and cache it from the remote host.
   * If the model is not found in the local file system cache, it will download and cache it from the remote host.
   * If the model is not found in the remote host, it will download and cache it from the fallback host.
   * @returns {Promise<any>} The loaded model.
   */
  async #getPreTrainedModel() {
    if (NativeEmbeddingReranker.#model) {
      this.log(`Loading model from singleton...`);
      return NativeEmbeddingReranker.#model;
    }

    try {
      const useLocalOnly = this.modelDownloaded && !forceModelRefresh();
      const model =
        await NativeEmbeddingReranker.#transformers.AutoModelForSequenceClassification.from_pretrained(
          this.model,
          {
            cache_dir: this.cacheDir,
            ...(useLocalOnly
              ? { local_files_only: true }
              : {
                  progress_callback: (p) => {
                    if (p.status !== "progress") return;
                    if (String(p.file || "").endsWith(".onnx")) return;
                    this.log(
                      `[${this.host}] Downloading model ${this.model}... ${p?.progress}%`
                    );
                  },
                }),
          }
        );
      this.log(`Loaded model ${this.model}`);
      NativeEmbeddingReranker.#model = model;
      return model;
    } catch (e) {
      this.log(
        `Failed to load model ${this.model} from ${this.host}.`,
        e.message,
        e.stack
      );
      if (
        NativeEmbeddingReranker.#transformers.env.remoteHost ===
        this.#fallbackHost
      ) {
        this.log(`Failed to load model ${this.model} from fallback host.`);
        throw e;
      }

      this.log(`Falling back to fallback host. ${this.#fallbackHost}`);
      NativeEmbeddingReranker.#transformers.env.remoteHost = this.#fallbackHost;
      NativeEmbeddingReranker.#transformers.env.remotePathTemplate = "{model}/";
      NativeEmbeddingReranker.#transformers.env.allowRemoteModels = true;
      this.modelDownloaded = false;
      return await this.#getPreTrainedModel();
    }
  }

  /**
   * This function will load the tokenizer from the local file system cache, or download and cache it from the remote host.
   * If the tokenizer is not found in the local file system cache, it will download and cache it from the remote host.
   * If the tokenizer is not found in the remote host, it will download and cache it from the fallback host.
   * @returns {Promise<any>} The loaded tokenizer.
   */
  async #getPreTrainedTokenizer() {
    if (NativeEmbeddingReranker.#tokenizer) {
      this.log(`Loading tokenizer from singleton...`);
      return NativeEmbeddingReranker.#tokenizer;
    }

    try {
      const useLocalOnly = this.modelDownloaded && !forceModelRefresh();
      const tokenizer =
        await NativeEmbeddingReranker.#transformers.AutoTokenizer.from_pretrained(
          this.model,
          {
            cache_dir: this.cacheDir,
            ...(useLocalOnly
              ? { local_files_only: true }
              : {
                  progress_callback: (p) => {
                    if (p.status !== "progress") return;
                    if (String(p.file || "").endsWith(".onnx")) return;
                    this.log(
                      `[${this.host}] Downloading tokenizer ${this.model}... ${p?.progress}%`
                    );
                  },
                }),
          }
        );
      this.log(`Loaded tokenizer ${this.model}`);
      NativeEmbeddingReranker.#tokenizer = tokenizer;
      return tokenizer;
    } catch (e) {
      this.log(
        `Failed to load tokenizer ${this.model} from ${this.host}.`,
        e.message,
        e.stack
      );
      if (
        NativeEmbeddingReranker.#transformers.env.remoteHost ===
        this.#fallbackHost
      ) {
        this.log(`Failed to load tokenizer ${this.model} from fallback host.`);
        throw e;
      }

      this.log(`Falling back to fallback host. ${this.#fallbackHost}`);
      NativeEmbeddingReranker.#transformers.env.remoteHost = this.#fallbackHost;
      NativeEmbeddingReranker.#transformers.env.remotePathTemplate = "{model}/";
      NativeEmbeddingReranker.#transformers.env.allowRemoteModels = true;
      this.modelDownloaded = false;
      return await this.#getPreTrainedTokenizer();
    }
  }

  /**
   * Reranks a list of documents based on the query.
   * @param {string} query - The query to rerank the documents against.
   * @param {{text: string}[]} documents - The list of document text snippets to rerank. Should be output from a vector search.
   * @param {Object} options - The options for the reranking.
   * @param {number} options.topK - The number of top documents to return.
   * @returns {Promise<any[]>} - The reranked list of documents.
   */
  async rerank(query, documents, options = { topK: 4 }) {
    await this.initClient();
    const model = NativeEmbeddingReranker.#model;
    const tokenizer = NativeEmbeddingReranker.#tokenizer;

    const start = Date.now();
    this.log(`Reranking ${documents.length} documents...`);
    const inputs = tokenizer(new Array(documents.length).fill(query), {
      text_pair: documents.map((doc) => doc.text),
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    const reranked = logits
      .sigmoid()
      .tolist()
      .map(([score], i) => ({
        rerank_corpus_id: i,
        rerank_score: score,
        ...documents[i],
      }))
      .sort((a, b) => b.rerank_score - a.rerank_score)
      .slice(0, options.topK);

    this.log(
      `Reranking ${documents.length} documents to top ${options.topK} took ${Date.now() - start}ms`
    );
    return reranked;
  }
}

module.exports = {
  NativeEmbeddingReranker,
};
