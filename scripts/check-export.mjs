import assert from "node:assert/strict";
import { readdir, readFile, stat, lstat } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
const root = resolve("."),
  limit = 8388608;
const skip = new Set([
  ".git",
  ".github",
  ".imd",
  ".cache",
  ".npm",
  ".vite",
  ".vite-temp",
  "node_modules",
  "coverage",
]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name),
      rel = relative(root, path).replaceAll("\\", "/");
    if (
      skip.has(entry.name) ||
      rel === "test/scratch" ||
      entry.name === ".env" ||
      entry.name.startsWith(".env.") ||
      entry.name.endsWith(".tsbuildinfo")
    )
      continue;
    if (entry.isDirectory()) await walk(path);
    else {
      assert.ok(
        !(await lstat(path)).isSymbolicLink(),
        `Unexpected symlink: ${rel}`,
      );
      files.push({ path: rel, bytes: (await stat(path)).size });
    }
  }
}
await walk(root);
const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
assert.ok(bytes <= limit, `Submission ${bytes} exceeds ${limit}`);
assert.ok(
  (await stat(".gitignore")).size <= 1024,
  "Ignore file exceeds explicit 1024-byte path budget",
);
assert.ok(
  !files.some((f) => /\.(tgz|zip|tar|gz)$/.test(f.path)),
  "Unnecessary dependency/archive file",
);
assert.ok(
  !files.some((f) => f.path === ".gitmodules"),
  "Unexpected git submodule manifest",
);
const html = await readFile("dist/index.html", "utf8");
for (const requirement of [
  /<title>[^<]+<\/title>/,
  /name="description"/,
  /property="og:title"/,
  /property="og:image"/,
  /rel="icon"/,
])
  assert.match(html, requirement);
const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const url of urls) {
  assert.ok(url.startsWith("./"), `Non-relative export URL: ${url}`);
  await stat(join("dist", url));
}
await stat("dist/og-image.png");
await stat("dist/sw.js");
await stat("package-lock.json");
console.log(
  JSON.stringify(
    {
      passed: true,
      files: files.length,
      submissionBytes: bytes,
      limitBytes: limit,
      remainingBytes: limit - bytes,
      distBytes: files
        .filter((f) => f.path.startsWith("dist/"))
        .reduce((n, f) => n + f.bytes, 0),
      ignoreBytes: (await stat(".gitignore")).size,
      relativeAssetURLs: urls,
    },
    null,
    2,
  ),
);
