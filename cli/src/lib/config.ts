import Conf from "conf";

type Schema = {
  token?: string;
  apiUrl: string;
  mock?: boolean;
};

// Default backend URL precedence (highest wins):
//   1. DPLOY_API_URL env var (runtime override — for self-hosters or local dev)
//   2. DPLOY_DEFAULT_API_URL constant baked in at bundle time (set in
//      tsup.bundle.config.ts → published npm bundle points at the prod backend)
//   3. http://localhost:8000 (local-dev fallback when running `pnpm build` /
//      `pnpm dev` without the bundle config)
const BAKED_DEFAULT_API_URL = process.env.DPLOY_DEFAULT_API_URL;

export const DEFAULT_API_URL = (
  process.env.DPLOY_API_URL ??
  BAKED_DEFAULT_API_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

const configDir = process.env.DPLOY_CONFIG_DIR;

export const config = new Conf<Schema>({
  projectName: "dploy",
  cwd: configDir,
  defaults: { apiUrl: DEFAULT_API_URL },
});
