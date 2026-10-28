import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config resolves a rule to the plugin registered in the same
// config object, so the overrides below re-attach the plugins the
// Next presets already load.
const presetPlugins = Object.assign(
  {},
  ...[...nextVitals, ...nextTs].map(c => c.plugins ?? {})
);

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
    // A built Expo web bundle committed for the app preview page.
    // Generated code; it carried 4,800 of the 5,100 lint findings.
    "public/app-preview/**",
    // The Expo app is its own package with its own idioms (asset
    // require(), Animated value mutation). It has no lint setup of its
    // own yet; see docs/audit-2026-10.md.
    "mobile/**",
  ]),
  {
    plugins: presetPlugins,
    rules: {
      // Plain apostrophes in JSX text are intentional on the public
      // pages; this rule only guards against JSX typos.
      "react/no-unescaped-entities": "off",
      // Typing debt, tracked in docs/audit-2026-10.md. Kept visible as
      // warnings so new code does not add to it unnoticed.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler lints shipped with eslint-config-next 16. The
      // existing findings are localStorage reads inside effects and
      // server-side shuffles, none of them bugs. Warn until each is
      // reworked deliberately.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    // Node scripts run with plain node, where require() is the idiom.
    files: ["scripts/**/*"],
    plugins: presetPlugins,
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
