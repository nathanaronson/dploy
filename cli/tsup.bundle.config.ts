import { defineConfig } from "tsup";

const PROD_API_URL = "https://hackprinceton--dploy-backend-fastapi-app.modal.run";

export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  shims: true,
  banner: {
    js:
      "#!/usr/bin/env node\n" +
      "import { createRequire as __dployCreateRequire } from 'module';\n" +
      "const require = __dployCreateRequire(import.meta.url);\n",
  },
  // Inline the prod URL at build time. config.ts reads this as
  // `process.env.DPLOY_DEFAULT_API_URL`; esbuild substitutes it as a string
  // literal so the runtime never actually touches process.env for it.
  define: {
    "process.env.DPLOY_DEFAULT_API_URL": JSON.stringify(PROD_API_URL),
  },
  noExternal: [/.*/],
  splitting: false,
  treeshake: true,
  minify: false,
  esbuildPlugins: [
    {
      name: "stub-react-devtools-core",
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
          path: args.path,
          namespace: "stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents:
            "const noop = () => {};\nexport default noop;\nexport const connectToDevTools = noop;\n",
          loader: "js",
        }));
      },
    },
  ],
});
