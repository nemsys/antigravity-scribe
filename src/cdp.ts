import * as http from "http";
import WebSocket from "ws";

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/**
 * Fetch CDP targets from /json and return the best page target.
 */
export async function findTarget(port: number): Promise<CDPTarget | null> {
  const targets = await httpGetJson<CDPTarget[]>(`http://localhost:${port}/json`);
  if (!targets) return null;

  let pages = targets.filter(
    (t) => t.type === "page" && !t.url.includes("webviewkey") && !!t.webSocketDebuggerUrl,
  );

  if (!pages.length) {
    pages = targets.filter((t) => ["page", "other"].includes(t.type) && !!t.webSocketDebuggerUrl);
  }

  if (!pages.length) return null;

  pages.sort((a, b) => (b.title?.length ?? 0) - (a.title?.length ?? 0));
  return pages[0];
}

export class CDPClient {
  private ws: WebSocket | null = null;
  private _id = 0;
  private _pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { maxPayload: 10 * 1024 * 1024 });
      this.ws = ws;

      ws.on("open", resolve);
      ws.on("error", reject);

      ws.on("message", (raw: WebSocket.RawData) => {
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
          // ignore malformed frames
        }
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("CDP socket not connected"));
        return;
      }

      const id = ++this._id;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP timeout on ${method}`));
      }, 10_000);

      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJS(js: string): Promise<string | null> {
    const result = await this.send("Runtime.evaluate", {
      expression: js,
      returnByValue: true,
      awaitPromise: true,
    });
    return result?.result?.result?.value ?? null;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

function httpGetJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}
