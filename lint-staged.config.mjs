import { defineConfig } from "lint-staged/config";

export default defineConfig({
  "*.{js,mjs,cjs,ts,tsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write",
  ],
  "*.{json,md,css,yml,yaml}": "prettier --write",
});
