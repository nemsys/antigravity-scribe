const http = require("http");
const WebSocket = require("ws");

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
            t.title === "Launchpad" &&
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
                } catch { /* ignore */ }
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
        if (this.ws) { this.ws.close(); this.ws = null; }
    }
}

const PROBES = {
    "document.URL": `document.URL`,

    "document.title": `document.title`,

    "data-* attrs containing a UUID": `
    (function() {
      const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      return [...document.querySelectorAll('*')]
        .flatMap(el => [...el.attributes])
        .filter(a => UUID.test(a.value))
        .map(a => a.name + '="' + a.value + '"')
        .slice(0, 20);
    })()
  `,

    "window keys matching state/store/session/cascade/conversation/brain": `
    Object.keys(window).filter(k =>
      /state|store|session|cascade|conversation|brain/i.test(k)
    )
  `,

    "UUIDs found in visible page text": `
    (function() {
      const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      return [...new Set(document.body.innerText.match(UUID) || [])];
    })()
  `,

    "UUIDs found in full page HTML": `
    (function() {
      const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      return [...new Set(document.documentElement.innerHTML.match(UUID) || [])];
    })()
  `,

    "React fiber — UUIDs in props/state tree": `
    (function() {
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const found = new Set();

      function walkValue(val, depth) {
        if (depth > 6 || val === null || val === undefined) return;
        const t = typeof val;
        if (t === "string") { if (UUID.test(val)) found.add(val); return; }
        if (t !== "object") return;
        for (const k of Object.keys(val)) {
          try { walkValue(val[k], depth + 1); } catch { /* skip */ }
        }
      }

      function walkFiber(fiber, depth) {
        if (!fiber || depth > 200) return;
        try { walkValue(fiber.memoizedProps, 0); } catch { /* skip */ }
        try { walkValue(fiber.memoizedState, 0); } catch { /* skip */ }
        try { walkValue(fiber.pendingProps, 0); } catch { /* skip */ }
        try { walkFiber(fiber.child, depth + 1); } catch { /* skip */ }
        try { walkFiber(fiber.sibling, depth + 1); } catch { /* skip */ }
      }

      // Find React root — try common root selectors
      const roots = [
        document.getElementById("root"),
        document.getElementById("app"),
        document.querySelector("[data-reactroot]"),
        document.body,
      ].filter(Boolean);

      for (const root of roots) {
        const key = Object.keys(root).find(k =>
          k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
        );
        if (key) {
          walkFiber(root[key], 0);
          break;
        }
      }

      return found.size ? [...found] : null;
    })()
  `,
};

async function main() {
    const port = parseInt(process.argv[2] ?? "9222", 10);
    console.log(`Connecting to CDP on port ${port}...`);

    const target = await findTarget(port);
    if (!target) {
        console.error("No CDP target found. Is Antigravity running with --remote-debugging-port?");
        process.exit(1);
    }
    console.log(`Target: ${target.title}\nURL:    ${target.url}\n`);

    const cdp = new CDPClient();
    await cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");

    console.log("=== UUID PROBES ===\n");
    for (const [label, expr] of Object.entries(PROBES)) {
        let result;
        try {
            result = await cdp.evalJS(expr);
        } catch (e) {
            result = `ERROR: ${e.message}`;
        }
        console.log(`[${label}]`);
        console.log(JSON.stringify(result, null, 2));
        console.log();
    }
    console.log("=== END ===");

    cdp.close();
}

main().catch(console.error);