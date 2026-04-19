import { defineConfig } from "tsup";

// Production bundle config: inlines every npm dep into a single file so the
// release tarball doesn't need `node_modules` on the user's machine. Used by
// CI (`pnpm build:bundle`) — local `pnpm build` keeps deps external for fast
// dev rebuilds.
//
// `react-devtools-core` is statically imported by ink/build/devtools.js but
// only used at runtime when REACT_DEVTOOLS=true. We stub it at build time so
// the CLI doesn't carry ~6MB of devtools client code we never use.
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
