import type { UserConfig } from "vite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const scratch = resolve("test/scratch/toolchain/node_modules");
export default {
  base: "./",
  resolve: {
    alias: existsSync(scratch)
      ? [
          { find: /^react-dom(\/.*)?$/, replacement: `${scratch}/react-dom$1` },
          { find: /^react(\/.*)?$/, replacement: `${scratch}/react$1` },
        ]
      : [],
  },
  plugins: [
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const files = [
          "./",
          "./index.html",
          "./favicon.svg",
          "./og-image.png",
          ...Object.keys(bundle).map((f) => "./" + f),
        ];
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE=${JSON.stringify(
            "squeek-foundry-" +
              Object.keys(bundle)
                .filter((name) => name.endsWith(".js"))
                .join("-"),
          )};const FILES=${JSON.stringify(files)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('squeek-foundry-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())));});`,
        });
      },
    },
  ],
  build: { target: "es2022", sourcemap: false },
} satisfies UserConfig;
