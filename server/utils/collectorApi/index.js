const { EncryptionManager } = require("../EncryptionManager");
const { Agent } = require("undici");

/**
 * @typedef {Object} CollectorOptions
 * @property {string} whisperProvider - The provider to use for whisper, defaults to "local"
 * @property {string} WhisperModelPref - The model to use for whisper if set.
 * @property {string} openAiKey - The API key to use for OpenAI interfacing, mostly passed to OAI Whisper provider.
 * @property {Object} ocr - The OCR options
 * @property {{allowAnyIp: "true"|null|undefined}} runtimeSettings - The runtime settings that are passed to the collector. Persisted across requests.
 */

// When running locally will occupy the 0.0.0.0 hostname space but when deployed inside
// of docker this endpoint is not exposed so it is only on the Docker instances internal network
// so no additional security is needed on the endpoint directly. Auth is done however by the express
// middleware prior to leaving the node-side of the application so that is good enough >:)
class CollectorApi {
  /** @type {number} - The default collector port */
  static DEFAULT_COLLECTOR_PORT = 8888;

  /** @type {number} - The maximum timeout for extension requests in milliseconds */
  extensionRequestTimeout = 15 * 60_000; // 15 minutes
  /** @type {Agent} - The agent for extension requests */
  extensionRequestAgent = new Agent({
    headersTimeout: this.extensionRequestTimeout,
    bodyTimeout: this.extensionRequestTimeout,
  });

  /**
   * Gets the collector port from the environment variables.
   * If the port is not set, it will fall back to the default port.
   * If the port is invalid, it will log a warning and return the default port.
   * @returns {number}
   */
  static getCollectorPort() {
    if (!("COLLECTOR_PORT" in process.env)) return this.DEFAULT_COLLECTOR_PORT;
    const port = Number(
      process.env.COLLECTOR_PORT || this.DEFAULT_COLLECTOR_PORT
    );
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;

    console.warn(
      `Invalid COLLECTOR_PORT "${process.env.COLLECTOR_PORT}". Falling back to ${this.DEFAULT_COLLECTOR_PORT}.`
    );
    return this.DEFAULT_COLLECTOR_PORT;
  }

  constructor() {
    const { CommunicationKey } = require("../comKey");
    this.comkey = new CommunicationKey();
    this.endpoint = `http://0.0.0.0:${CollectorApi.getCollectorPort()}`;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[CollectorApi]\x1b[0m ${text}`, ...args);
  }

  /**
   * Attach options to the request passed to the collector API
   * @returns {CollectorOptions}
   */
  #attachOptions() {
    return {
      whisperProvider: process.env.WHISPER_PROVIDER || "local",
      WhisperModelPref: process.env.WHISPER_MODEL_PREF,
      openAiKey: process.env.OPEN_AI_KEY || null,
      ocr: {
        // ~99% документов в проекте — на русском, изредка на английском.
        // Русский ставится первым, чтобы Tesseract не «ломал» кириллицу.
        langList: process.env.TARGET_OCR_LANG || "rus,eng",
      },
      runtimeSettings: {
        allowAnyIp: process.env.COLLECTOR_ALLOW_ANY_IP ?? "false",
        browserLaunchArgs: process.env.AV_ELIA_BOT_CHROMIUM_ARGS ?? [],
      },
    };
  }

  async online() {
    return await fetch(this.endpoint)
      .then((res) => res.ok)
      .catch(() => false);
  }

  async acceptedFileTypes() {
    return await fetch(`${this.endpoint}/accepts`)
      .then((res) => {
        if (!res.ok) throw new Error("failed to GET /accepts");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return null;
      });
  }

  /**
   * Process a document
   * - Will append the options and optional metadata to the request body
   * @param {string} filename - The filename of the document to process
   * @param {Object} metadata - Optional metadata key:value pairs
   * @returns {Promise<Object>} - The response from the collector API
   */
  async processDocument(filename = "", metadata = {}) {
    if (!filename) return false;

    const data = JSON.stringify({
      filename,
      metadata,
      options: this.#attachOptions(),
    });

    return await fetch(`${this.endpoint}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      body: data,
      dispatcher: new Agent({ headersTimeout: 600000 }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, reason: e.message, documents: [] };
      });
  }

  /**
   * Process a link
   * - Will append the options to the request body
   * @param {string} link - The link to process
   * @param {{[key: string]: string}} scraperHeaders - Custom headers to apply to the web-scraping request URL
   * @param {[key: string]: string} metadata - Optional metadata to attach to the document
   * @returns {Promise<Object>} - The response from the collector API
   */
  async processLink(link = "", scraperHeaders = {}, metadata = {}) {
    if (!link) return false;

    const data = JSON.stringify({
      link,
      scraperHeaders,
      options: this.#attachOptions(),
      metadata: metadata,
    });

    return await fetch(`${this.endpoint}/process-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      body: data,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, reason: e.message, documents: [] };
      });
  }

  /**
   * Process raw text as a document for the collector
   * - Will append the options to the request body
   * @param {string} textContent - The text to process
   * @param {[key: string]: string} metadata - The metadata to process
   * @returns {Promise<Object>} - The response from the collector API
   */
  async processRawText(textContent = "", metadata = {}) {
    const data = JSON.stringify({
      textContent,
      metadata,
      options: this.#attachOptions(),
    });
    return await fetch(`${this.endpoint}/process-raw-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      body: data,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, reason: e.message, documents: [] };
      });
  }

  // We will not ever expose the document processor to the frontend API so instead we relay
  // all requests through the server. You can use this function to directly expose a specific endpoint
  // on the document processor.
  async forwardExtensionRequest({ endpoint, method, body }) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    return await fetch(`${this.endpoint}${endpoint}`, {
      method,
      body: data,
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      // Extensions do a lot of work, and may take a while to complete so we need to increase the timeout
      // substantially so that they do not show a failure to the user early.
      dispatcher: this.extensionRequestAgent,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, data: {}, reason: e.message };
      });
  }

  /**
   * Get the content of a link only in a specific format
   * - Will append the options to the request body
   * @param {string} link - The link to get the content of
   * @param {"text"|"html"} captureAs - The format to capture the content as
   * @returns {Promise<Object>} - The response from the collector API
   */
  async getLinkContent(link = "", captureAs = "text") {
    if (!link) return false;

    const data = JSON.stringify({
      link,
      captureAs,
      options: this.#attachOptions(),
    });
    return await fetch(`${this.endpoint}/util/get-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      body: data,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, content: null };
      });
  }

  /**
   * Parse a document without processing it
   * - Will append the options to the request body
   * @param {string} filename - The filename of the document to parse
   * @param {Object} parseOptions - Additional options for parsing
   * @param {string} parseOptions.absolutePath - If provided, use this absolute path instead of looking in the hotdir
   * @returns {Promise<Object>} - The response from the collector API
   */
  async parseDocument(filename = "", parseOptions = {}) {
    if (!filename) return false;

    const data = JSON.stringify({
      filename,
      options: {
        ...this.#attachOptions(),
        absolutePath: parseOptions.absolutePath || null,
      },
    });

    return await fetch(`${this.endpoint}/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integrity": this.comkey.sign(data),
        "X-Payload-Signer": this.comkey.encrypt(
          new EncryptionManager().xPayload
        ),
      },
      body: data,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Response could not be completed");
        return res.json();
      })
      .then((res) => res)
      .catch((e) => {
        this.log(e.message);
        return { success: false, reason: e.message, documents: [] };
      });
  }

  /**
   * Parse a document while streaming OCR progress events back to the caller.
   * Intermediate events (`stage`, `page`) are relayed via `onEvent`; the final
   * `complete`/`error` event is returned as the resolved value.
   *
   * @param {string} filename - The filename of the document to parse
   * @param {Object} parseOptions
   * @param {string} [parseOptions.absolutePath] - Optional absolute path override
   * @param {(event: Object) => void} onEvent - Called for each intermediate progress event
   * @returns {Promise<{success: boolean, reason: string|null, documents: Object[]}>}
   */
  async parseDocumentStream(filename = "", parseOptions = {}, onEvent = null) {
    if (!filename)
      return { success: false, reason: "No filename provided", documents: [] };

    const data = JSON.stringify({
      filename,
      options: {
        ...this.#attachOptions(),
        absolutePath: parseOptions.absolutePath || null,
      },
    });

    try {
      const res = await fetch(`${this.endpoint}/parse-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integrity": this.comkey.sign(data),
          "X-Payload-Signer": this.comkey.encrypt(
            new EncryptionManager().xPayload
          ),
        },
        body: data,
        dispatcher: new Agent({ headersTimeout: 600000 }),
      });

      if (!res.ok || !res.body)
        throw new Error("Stream response could not be opened");

      const decoder = new TextDecoder();
      let buffer = "";
      let finalEvent = null;

      // undici fetch body is async-iterable over Uint8Array chunks.
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });

        // SSE frames are separated by a blank line.
        let sepIndex;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;

          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "complete" || event.type === "error") {
            finalEvent = event;
          } else if (typeof onEvent === "function") {
            onEvent(event);
          }
        }
      }

      if (finalEvent)
        return {
          success: !!finalEvent.success,
          reason: finalEvent.reason || null,
          documents: finalEvent.documents || [],
        };
      return {
        success: false,
        reason: "Stream ended unexpectedly",
        documents: [],
      };
    } catch (e) {
      this.log(e.message);
      return { success: false, reason: e.message, documents: [] };
    }
  }
}

module.exports.CollectorApi = CollectorApi;
