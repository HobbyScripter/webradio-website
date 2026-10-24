import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local scratch space (logs, test fixtures, backups) – git-ignored
    ".local-db/**",
    // Prisma generated files
    "prisma/contract.d.ts",
    "prisma/contract.json",
    // Prisma skills (generated dependencies)
    ".agents/**",
    ".claude/**",
    ".cursor/**",
    ".devin/**",
  ]),
  {
    rules: {
      // Allow require() in Jest config
      "@typescript-eslint/no-require-imports": "off",
      // Ignore empty object types in generated files
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);

export default eslintConfig;
