// Velvet feed sync runner for GitHub Actions.
// Provides the small Scriptable API surface used by velvet-feed-sync.js,
// then executes the existing validated feed engine without requiring Scriptable/iPhone.

const realFetch = globalThis.fetch.bind(globalThis);

class ScriptableRequest {
  constructor(url) {
    this.url = String(url);
    this.method = "GET";
    this.headers = {};
    this.body = null;
    this.timeoutInterval = 30;
    this.response = null;
  }

  async loadString() {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, Number(this.timeoutInterval || 30)) * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await realFetch(this.url, {
        method: this.method || "GET",
        headers: this.headers || {},
        body: this.body ?? undefined,
        redirect: "follow",
        signal: controller.signal
      });
      this.response = {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      };
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${this.url}: ${text.slice(0, 180)}`);
        error.statusCode = response.status;
        throw error;
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async loadJSON() {
    return JSON.parse(await this.loadString());
  }
}

class ScriptableAlert {
  constructor() {
    this.title = "";
    this.message = "";
    this.fields = [];
  }
  addAction() {}
  addCancelAction() {}
  addTextField(_placeholder = "", value = "") { this.fields.push(String(value)); }
  addSecureTextField(_placeholder = "", value = "") { this.fields.push(String(value)); }
  textFieldValue(index) { return this.fields[index] || ""; }
  async presentAlert() {
    const message = [this.title, this.message].filter(Boolean).join(" — ");
    if (message) console.log(`[Velvet] ${message}`);
    return 0;
  }
}

const DataShim = {
  fromBase64String(value) {
    const buffer = Buffer.from(String(value || ""), "base64");
    return { toRawString: () => buffer.toString("utf8") };
  },
  fromString(value) {
    const buffer = Buffer.from(String(value ?? ""), "utf8");
    return { toBase64String: () => buffer.toString("base64") };
  }
};

const token = String(process.env.GITHUB_TOKEN || "").trim();
if (!token) {
  console.error("GITHUB_TOKEN is unavailable. The workflow needs contents: write permission.");
  process.exit(2);
}

const KeychainShim = {
  contains() { return Boolean(token); },
  get() { return token; },
  set() {},
  remove() {}
};

const ScriptShim = {
  complete() {}
};

globalThis.Request = ScriptableRequest;
globalThis.Alert = ScriptableAlert;
globalThis.Data = DataShim;
globalThis.Keychain = KeychainShim;
globalThis.Script = ScriptShim;

const syncUrl = new URL("../velvet-feed-sync.js", import.meta.url);
const moduleSource = await (await import("node:fs/promises")).readFile(syncUrl, "utf8");

console.log("[Velvet] GitHub Actions feed sync starting");
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(moduleSource)();
  console.log("[Velvet] GitHub Actions feed sync finished");
} catch (error) {
  console.error("[Velvet] Feed sync crashed:", error?.stack || error);
  process.exitCode = 1;
}
