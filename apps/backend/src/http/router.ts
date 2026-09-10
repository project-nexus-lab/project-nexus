/**
 * A hand-rolled router — no framework dependency. The endpoint count this
 * layer needs (a dozen or so, all thin wrappers over already-tested
 * functions) does not earn a routing library; this is ~40 lines and every
 * line is exercised by the route table below.
 */

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export type RouteHandler = (ctx: RouteContext) => Promise<RouteResult>;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, pattern: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
  }

  get(pattern: string, handler: RouteHandler): void {
    this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): void {
    this.add("POST", pattern, handler);
  }

  match(
    method: string,
    pathname: string,
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    const segments = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.segments.length !== segments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i] as string;
        const seg = segments[i] as string;
        if (routeSeg.startsWith(":")) {
          params[routeSeg.slice(1)] = decodeURIComponent(seg);
        } else if (routeSeg !== seg) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }
}
