const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
await mkdir("test/scratch/browser-evidence", { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const file = resolve(
      "dist",
      new URL(req.url, "http://x").pathname.slice(1) || "index.html",
    );
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(file)] || "text/plain",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("https://api.squeekchain.com/**", (r) => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const axePath = process.env.IMD_AXE || "node_modules/axe-core/axe.min.js";
  await page.addScriptTag({ path: axePath });
  const results = [];
  for (const state of ["workshop", "tutorial", "mobile-drawer"]) {
    if (state === "tutorial")
      await page
        .getByRole("button", { name: "Open tutorial", exact: true })
        .click();
    if (state === "mobile-drawer") {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".mobile-inspect").click();
    }
    const result = await page.evaluate(async () => {
      const r = await window.axe.run();
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            summary: n.failureSummary,
          })),
        })),
        incomplete: r.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            summary: n.failureSummary,
          })),
        })),
      };
    });
    console.log(
      state,
      JSON.stringify({
        violations: result.violations.length,
        incomplete: result.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
      }),
    );
    if (result.violations.length) process.exitCode = 1;
    results.push({ state, ...result });
  }
  await writeFile(
    "test/scratch/browser-evidence/axe.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
