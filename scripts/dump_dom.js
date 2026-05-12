const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function findTarget(port) {
  const targets = await httpGetJson(`http://localhost:${port}/json`);
  if (!targets) return null;

  let pages = targets.filter(
    (t) =>
      t.type === "page" &&
      !t.url.includes("webviewkey") &&
      !!t.webSocketDebuggerUrl
  );

  if (!pages.length) {
    pages = targets.filter(
      (t) => ["page", "other"].includes(t.type) && !!t.webSocketDebuggerUrl
    );
  }

  if (!pages.length) return null;

  pages.sort((a, b) => (b.title?.length ?? 0) - (a.title?.length ?? 0));
  return pages[0];
}

class CDPClient {
  constructor() {
    this.ws = null;
    this._id = 0;
    this._pending = new Map();
  }

  async connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { maxPayload: 10 * 1024 * 1024 });
      this.ws = ws;

      ws.on("open", resolve);
      ws.on("error", reject);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id !== undefined) {
            const pending = this._pending.get(msg.id);
            if (pending) {
              this._pending.delete(msg.id);
              pending.resolve(msg);
            }
          }
        } catch {
          // ignore
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error("Not connected"));

      const id = ++this._id;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timeout on ${method}`));
      }, 10000);

      this._pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJS(js) {
    const result = await this.send("Runtime.evaluate", {
      expression: js,
      returnByValue: true,
      awaitPromise: false,
    });
    return result?.result?.result?.value ?? null;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function main() {
  console.log("Connecting to Antigravity CDP on port 9222...");
  const target = await findTarget(9222);
  if (!target) {
    console.error("Could not find a valid CDP target. Is Antigravity running with --remote-debugging-port=9222?");
    process.exit(1);
  }

  console.log(`Connected to target: ${target.title}`);
  const cdp = new CDPClient();
  await cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");

  console.log("Extracting #conversation outerHTML...");
  const js = `(function() {
    const el = document.querySelector("#conversation");
    if (!el) return null;
    return el.outerHTML;
  })()`;

  const html = await cdp.evalJS(js);
  cdp.close();

  if (!html) {
    console.error("Failed to extract #conversation. Is a chat panel open?");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "scraper", "DOM-exports");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filename = `live_dom_${Date.now()}.html`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, html, "utf8");

  console.log(`\n✅ Success! Dumped live DOM to: ${outPath}`);
}

main().catch(console.error);