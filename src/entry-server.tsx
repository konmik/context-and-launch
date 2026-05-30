import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" />
          <title>Context & Launch</title>
          <script>{[
            "(function(){try{",
            'var t=localStorage.getItem("theme");',
            'if(t==="dark"||',
            '(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))',
            'document.documentElement.classList.add("dark")',
            "}catch(e){}})()",
          ].join("")}</script>
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
