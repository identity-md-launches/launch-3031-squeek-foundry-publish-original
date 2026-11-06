import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const fixture = JSON.parse(
  await readFile("test/fixtures/api-snapshot.json", "utf8"),
);
await mkdir("test/scratch/browser-evidence", { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      "dist",
      new URL(req.url, "http://x").pathname.slice(1) || "index.html",
    );
    if (!path.startsWith(resolve("dist") + "/")) throw Error("Invalid path");
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[extname(path)] || "text/plain",
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
const checks = [];
async function advance(page, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await page.clock.runFor(Math.min(1000, ms - elapsed));
    await new Promise((r) => setTimeout(r, 10));
  }
}
const passed = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.clock.install();
  const counts = { status: 0, economy: 0, settlements: 0 };
  await ctx.route("https://api.squeekchain.com/**", async (route) => {
    const url = route.request().url(),
      key = url.includes("/status")
        ? "status"
        : url.includes("/economy/")
          ? "economy"
          : "settlements";
    counts[key]++;
    await route.fulfill({
      json: fixture[key],
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page
    .locator(".mode-actions")
    .getByRole("button")
    .last()
    .getByText("Stale", { exact: true })
    .waitFor();
  await page.evaluate(() => 0);
  assert.deepEqual(counts, { status: 1, economy: 1, settlements: 1 });
  await advance(page, 14000);
  assert.deepEqual(counts, { status: 1, economy: 1, settlements: 1 });
  await advance(page, 2000);
  await page.evaluate(() => 0);
  assert.equal(counts.status, 2);
  assert.equal(counts.economy, 1);
  assert.equal(counts.settlements, 1);
  passed(
    "status does not poll sooner than 15 seconds; economy/settlements do not follow it",
  );
  await advance(page, 45000);
  await page.evaluate(() => 0);
  assert.ok(counts.status >= 4);
  assert.equal(counts.economy, 2);
  assert.equal(counts.settlements, 2);
  passed("economy and settlements poll at 60 seconds");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = { ...counts };
  await advance(page, 61000);
  assert.deepEqual(counts, before);
  passed("hidden documents stop polling");
  await ctx.close();
  const ctx2 = await browser.newContext({ serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  await p2.clock.install();
  let statusRequests = 0;
  await ctx2.route("https://api.squeekchain.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/status")) {
      statusRequests++;
      if (statusRequests === 1) {
        await route.fulfill({
          status: 429,
          headers: {
            "retry-after": "60",
            "access-control-expose-headers": "Retry-After",
            "access-control-allow-origin": "*",
          },
          body: "busy",
        });
        return;
      }
    }
    const key = url.includes("/status")
      ? "status"
      : url.includes("/economy/")
        ? "economy"
        : "settlements";
    await route.fulfill({
      json: fixture[key],
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await p2.goto(`http://127.0.0.1:${server.address().port}`);
  await p2
    .locator(".mode-actions")
    .getByRole("button")
    .last()
    .getByText("Offline", { exact: true })
    .waitFor();
  await advance(p2, 59000);
  assert.equal(statusRequests, 1);
  await advance(p2, 2000);
  await p2.evaluate(() => 0);
  assert.equal(statusRequests, 2);
  passed("HTTP 429 Retry-After: 60 overrides the shorter backoff");
  await ctx2.close();
  const ctx3 = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  const p3 = await ctx3.newPage();
  let changed = false;
  await ctx3.route("https://api.squeekchain.com/**", async (route) => {
    const url = route.request().url(),
      key = url.includes("/status")
        ? "status"
        : url.includes("/economy/")
          ? "economy"
          : "settlements";
    const data = structuredClone(fixture[key]);
    if (changed && key === "economy") data.release.id = "changed-test-release";
    await route.fulfill({
      json: data,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await p3.goto(`http://127.0.0.1:${server.address().port}`);
  await p3
    .locator(".mode-actions")
    .getByRole("button")
    .last()
    .getByText("Stale", { exact: true })
    .waitFor();
  await p3.getByRole("button", { name: "Power", exact: true }).click();
  await p3.getByRole("button", { name: "Select latest safe batches" }).click();
  await p3
    .locator(".source-details")
    .getByText("sepolia · 11155111", { exact: true })
    .waitFor();
  const pinned = await p3.locator(".power-strip").innerText();
  await p3.getByRole("button", { name: "Step", exact: true }).click();
  changed = true;
  await p3.getByRole("button", { name: "Refresh API" }).click();
  await p3
    .getByRole("alert")
    .getByText(/installation or release changed/)
    .waitFor();
  assert.equal(
    await p3.getByRole("button", { name: "Restart", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await p3.locator(".power-strip").innerText(), pinned);
  await p3.getByRole("button", { name: "Edit again", exact: true }).click();
  assert.equal(
    await p3
      .getByRole("button", { name: "Run factory", exact: true })
      .isDisabled(),
    true,
  );
  passed(
    "release change freezes the pinned source and gates a new Run or Restart",
  );
  await ctx3.close();
  await writeFile(
    "test/scratch/browser-evidence/network.json",
    JSON.stringify(checks, null, 2),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
