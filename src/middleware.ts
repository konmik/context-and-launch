import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware({
  onRequest: [
    (event) => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith("/_server")) {
        console.log(`${event.request.method} ${url.pathname}`);
      }
    },
  ],
});
