import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".output/**", ".vinxi/**", "node_modules/**", "dist-electron/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}", "electron/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "max-len": ["error", { code: 120, ignoreUrls: true }],
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@solidjs/router",
          importNames: ["createAsync"],
          message: "Use createNonSuspendingAsync from ~/lib/create-non-suspending-async.js;"
            + " a plain createAsync read collapses the root Suspense boundary and blanks the screen.",
        }],
      }],
    },
  },
  {
    files: ["src/lib/create-non-suspending-async.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
