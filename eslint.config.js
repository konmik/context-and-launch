import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "dist-electron/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}", "electron/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "max-len": ["error", { code: 120, ignoreUrls: true }],
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@solidjs/router",
            importNames: ["createAsync"],
            message: "Use a Solid 2 async memo or projection under Loading and Errored boundaries.",
          },
          { name: "solid-js/web", message: "Import renderer APIs from @solidjs/web." },
          { name: "solid-js/store", message: "Import Solid 2 store APIs from solid-js." },
        ],
      }],
    },
  },
);
