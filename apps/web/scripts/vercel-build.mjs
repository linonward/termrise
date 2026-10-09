// Vercel build entry (vercel.json buildCommand). Preview builds migrate their own Neon
// branch first; Production never migrates during build. See docs/architecture/deployment.md.
import { execSync } from "node:child_process";

const run = (command) => execSync(command, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "preview") {
  run("pnpm db:migrate");
}
run("pnpm build");
