import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware({
  onRequest: [
    (event) => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith("/api/")) {
        console.log(`${event.request.method} ${url.pathname}`);
      }
    },
  ],
  onBeforeResponse: [
    (event, response) => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith("/api/")) {
        const status = (response as Response)?.status ?? "?";
        console.log(`${event.request.method} ${url.pathname} -> ${status}`);
      }
    },
  ],
});
