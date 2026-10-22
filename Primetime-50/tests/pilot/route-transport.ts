// In-process Request adapter, NOT an HTTP/browser/cookie transport replacement.
// Callers supply the actual handlers. Fault injection can hold/drop acknowledgements
// AFTER a real handler runs, without fabricating database success.
export function routeTransport(routes: {
  GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response>;
  PUT: (r: Request) => Promise<Response>; complete: (r: Request) => Promise<Response>;
}, after: (request: Request, response: Response) => Promise<Response> = async (_, r) => r): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input), "http://localhost:3000");
    const request = new Request(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: url.origin } });
    const handler = url.pathname.endsWith("/complete") ? routes.complete : request.method === "PUT" ? routes.PUT : request.method === "POST" ? routes.POST : routes.GET;
    return after(request, await handler(request));
  };
}
export function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
