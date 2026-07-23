import { createHandler, StartServer } from "@solidjs/start/server";
import { criticalAppearanceScript, criticalBackgroundCss } from "./components/shared/palette-pure.js";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" />
          <title>Context & Launch</title>
          <style>{criticalBackgroundCss()}</style>
          <script>{criticalAppearanceScript()}</script>
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
