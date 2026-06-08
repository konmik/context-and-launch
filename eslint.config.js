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
    },
  },
);
