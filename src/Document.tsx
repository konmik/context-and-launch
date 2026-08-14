import type { Element } from "solid-js";
import { criticalAppearanceScript, criticalBackgroundCss } from "./components/shared/palette-pure.js";

export default function Document(props: { children: Element }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" />
        <title>Context &amp; Launch</title>
        <style>{criticalBackgroundCss()}</style>
        <script>{criticalAppearanceScript()}</script>
      </head>
      <body spellcheck={false}>
        <div id="app">{props.children}</div>
      </body>
    </html>
  );
}
