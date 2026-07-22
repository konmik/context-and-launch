import { createHandler, StartServer } from "@solidjs/start/server";
import { PALETTES } from "./components/shared/palette-pure.js";

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
            'document.documentElement.classList.add("dark");',
            'var p=localStorage.getItem("palette");',
            `if(${JSON.stringify([...PALETTES])}.indexOf(p)!==-1)`,
            'document.documentElement.dataset.palette=p',
            "}catch(e){}})()",
          ].join("")}</script>
          {assets}
        </head>
        <body spellcheck="false">
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
