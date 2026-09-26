# Offline dashboard graphics

The MCP renderer uses the dashboard's Manrope and DM Mono fonts, distributed under the included SIL Open Font Licenses. Manrope's variable font was instantiated at weights 500 and 700 using `fonttools varLib.instancer --update-name-table`; static instances render consistently in resvg. Sources: Google Fonts `ofl/manrope/Manrope[wght].ttf` and `ofl/dmmono/DMMono-Regular.ttf` (downloaded 2026-09-26).

`pnpm --filter @agent-capital-tree/plugin build` copies these assets plus the pinned `@resvg/resvg-wasm@2.6.2` binary into `bundle/visual-assets`. Keep that directory with `bundle/server.mjs` in standalone plugin installations. Rendering makes no external requests and loads no system fonts. resvg-js is MPL-2.0: https://github.com/thx/resvg-js/tree/v2.6.2 . The third-party license is included with the bundled assets.
