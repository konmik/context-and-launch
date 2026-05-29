import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".output/**", ".vinxi/**", "node_modules/**"] },
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "max-len": ["error", { code: 120, ignoreUrls: true }],
    },
  },
);
