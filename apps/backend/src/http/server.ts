import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { NexusDb } from "../db/client.js";
import { errorBody, statusForError } from "./errors.js";
import { buildRoutes } from "./routes.js";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return undefined;
  return JSON.parse(text);
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * Enabling layer, not the full §16 1a REST surface — see
 * `docs/history/iteration-1/REPORT.md`. Every route is a thin wrapper; all
 * domain logic lives in `src/proposal`, `src/work`, `src/workpackage`,
 * `src/graph`, and is tested independently of this file.
 */
export function createHttpServer(db: NexusDb): Server {
  const router = buildRoutes(db);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = router.match(req.method ?? "GET", url.pathname);
      if (!match) {
        send(res, 404, { error: "NotFound", message: `no route for ${req.method} ${url.pathname}` });
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        send(res, 400, { error: "InvalidJson", message: "request body is not valid JSON" });
        return;
      }

      const result = await match.handler({ params: match.params, query: url.searchParams, body });
      send(res, result.status, result.body);
    } catch (err) {
      send(res, statusForError(err), errorBody(err));
    }
  });
}
