const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  await readFile("test/fixtures/api-snapshot.json", "utf8"),
);
const outputs = [];
const report = (name, detail) => {
  outputs.push({ name, detail, passed: true });
  console.log("PASS", name, detail || "");
};
await mkdir("test/scratch/browser-evidence", { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    let p = new URL(req.url, "http://localhost").pathname;
    if (!p.startsWith("/preview/")) {
      res.writeHead(404).end();
      return;
    }
    p = p.slice(9) || "index.html";
    const file = resolve("dist", p);
    if (!file.startsWith(resolve("dist") + "/")) throw Error("bad path");
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("missing");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const calls = [];
  await ctx.route("https://api.squeekchain.com/**", async (route) => {
    const url = route.request().url();
    calls.push({ url, time: Date.now() });
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
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Run factory", exact: true })
    .waitFor();
  await page.screenshot({ path: "test/scratch/browser-evidence/desktop.png" });
  report("production subpath renders");
  await page
    .getByRole("button", { name: "Open tutorial", exact: true })
    .click();
  await page.getByRole("button", { name: "Next", exact: false }).click();
  await page.getByRole("heading", { name: "Save a spark for later" }).waitFor();
  await page.getByRole("button", { name: "Next", exact: false }).click();
  await page
    .getByRole("heading", { name: "Give your machines a plan" })
    .waitFor();
  await page.getByRole("button", { name: "Try the tutorial factory" }).click();
  await page.getByRole("button", { name: "4×", exact: true }).click();
  await page.getByRole("button", { name: "Run factory", exact: true }).click();
  await page.clock.runFor(6500);
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Shift complete", exact: true })
    .waitFor();
  report("tutorial completion", "96 integer ticks, results opened");
  await page.getByRole("button", { name: "Scrub replay", exact: true }).click();
  await page.locator("#replay").fill("20");
  assert.equal(await page.locator("#replay").inputValue(), "20");
  report("scrubbable replay");
  // edit freezes and restart resets
  await page.getByRole("button", { name: "Edit again", exact: true }).click();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  assert.match(await page.locator(".stats-bar").innerText(), /0\s*\/ 96/);
  await page.getByRole("button", { name: "Edit again", exact: true }).click();
  const cell = page.locator('[data-cell="0"]');
  await page.getByRole("button", { name: /^Conveyor/ }).click();
  await cell.click();
  assert.match(await cell.getAttribute("aria-label"), /Conveyor/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.match(await cell.getAttribute("aria-label"), /Empty cell/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.match(await cell.getAttribute("aria-label"), /Conveyor/);
  await page
    .getByRole("button", { name: "Rotate clockwise", exact: true })
    .click();
  await page.locator(".tool").filter({ hasText: "Select" }).click();
  await cell.click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  assert.match(await cell.getAttribute("aria-label"), /Empty cell/);
  report("place/select/rotate/remove/undo/redo");
  // three solution contracts
  const scores = [];
  for (const [i, name] of [
    "First Shipment",
    "Buffer the Burst",
    "Priority Automation",
  ].entries()) {
    await page.locator(".mode-actions>button").first().click();
    await page
      .locator(".contract-choice")
      .nth(i)
      .getByRole("button", { name: "Load solution", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run factory", exact: true })
      .click();
    await page.clock.runFor(i === 0 ? 8500 : 12500);
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Shift complete", exact: true })
      .waitFor();
    const score = Number(await page.locator(".result-hero>strong").innerText());
    scores.push(score);
    await page.screenshot({
      path: `test/scratch/browser-evidence/contract-${i + 1}.png`,
    });
    assert.match(
      await page.locator(".contract-outcome").innerText(),
      /Contract complete/,
    );
    if (i === 2) {
      const rows = await page.locator(".comparison tbody tr").allTextContents();
      assert.match(rows[0], /17/);
      assert.match(rows[2], /15/);
    }
    await page
      .getByRole("button", { name: "Edit again", exact: true })
      .last()
      .click();
  }
  report("three tested contracts", scores.join(", "));
  // functional rules editing
  await page.getByRole("button", { name: "Rules 3", exact: true }).click();
  const before = await page.locator(".rule").count();
  await page.getByRole("button", { name: "Add rule", exact: false }).click();
  assert.equal(await page.locator(".rule").count(), before + 1);
  await page.getByRole("button", { name: "Move rule 4 up" }).click();
  await page.getByRole("button", { name: "Delete rule 3" }).click();
  report("rule editor add/reorder/remove");
  // export blueprint and import
  await page.getByRole("button", { name: "Blueprint", exact: true }).click();
  let json = await page.locator(".json-text").inputValue();
  assert.equal(JSON.parse(json).format, "squeek-foundry-blueprint");
  const d1 = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  await (await d1).saveAs("test/scratch/browser-evidence/blueprint.json");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator(".json-text").fill(json);
  await page.getByRole("button", { name: "Validate and import" }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  report("blueprint JSON download/import");
  // historical API source pin, source metadata, run, baseline and run bundle
  await page.getByRole("button", { name: "Power", exact: true }).click();
  await page
    .getByRole("button", { name: "Select latest safe batches" })
    .click();
  await page
    .locator(".source-details")
    .getByText("sepolia · 11155111", { exact: true })
    .waitFor();
  await page
    .getByText("sepolia-core-sepolia-20261103", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Run factory", exact: true }).click();
  await page.clock.runFor(12500);
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Shift complete", exact: true })
    .waitFor();
  const hs = Number(await page.locator(".result-hero>strong").innerText());
  assert.ok(hs > 0);
  await page.screenshot({
    path: "test/scratch/browser-evidence/historical-results.png",
  });
  await page.getByRole("button", { name: "Export run", exact: true }).click();
  json = await page.locator(".json-text").inputValue();
  const run = JSON.parse(json);
  assert.equal(run.source.records.length, 6);
  assert.equal(run.horizon, 192);
  assert.equal(run.source.chainId, "11155111");
  assert.equal(run.sourceFingerprint.length, 64);
  await writeFile("test/scratch/browser-evidence/run.json", json);
  report(
    "Historical Shift with actual captured API schema",
    "6 safe batches; " +
      hs +
      " pods (fixture transport, no onchain verification)",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .locator(".json-text")
    .fill(JSON.stringify({ ...run, score: run.score + 1 }));
  await page.getByRole("button", { name: "Validate and import" }).click();
  await page
    .getByRole("dialog")
    .getByText(/Import rejected: Score mismatch/)
    .waitFor();
  report("tampered score rejected with visible error");
  await page.locator(".json-text").fill(json);
  await page.getByRole("button", { name: "Validate and import" }).click();
  await page
    .getByRole("dialog")
    .getByText(/Imported \/ untrusted/)
    .waitFor();
  report("run import recomputes and marks source untrusted");
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const d = await png;
  await d.saveAs("test/scratch/browser-evidence/factory.png");
  const pngBytes = await readFile("test/scratch/browser-evidence/factory.png");
  assert.equal(pngBytes.subarray(1, 4).toString(), "PNG");
  report("actual PNG results export", pngBytes.length + " bytes");
  await page.getByRole("button", { name: "Scrub replay" }).click();
  await page
    .getByRole("button", { name: "Switch to Simplified Chinese" })
    .click();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.getByRole("button", { name: "查看结果", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "班次完成", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test/scratch/browser-evidence/chinese-results.png",
  });
  await page
    .getByRole("button", { name: "重新编辑", exact: true })
    .last()
    .click();
  report("Simplified Chinese interface/results");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test/scratch/browser-evidence/mobile-zh.png",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator(".mobile-inspect").click();
  await page.getByRole("button", { name: "90 秒入门", exact: true }).click();
  await page
    .getByRole("heading", { name: "入门 90 秒", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator(".inspector.drawer-open").count(), 1);
  await page.getByRole("button", { name: "关闭检查面板" }).click();
  await page.getByRole("button", { name: "切换到英语" }).click();
  await page.screenshot({ path: "test/scratch/browser-evidence/mobile.png" });
  const viewport = page.locator(".board-viewport");
  await viewport.evaluate((el) => (el.scrollLeft = 300));
  assert.ok((await viewport.evaluate((el) => el.scrollLeft)) > 0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  report("390px mobile pan/zoom and inspector drawer");
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report("320px no page overflow");
  // keyboard cell navigation
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-cell="37"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(":focus").getAttribute("data-cell"), "38");
  await page.keyboard.press("Enter");
  report("keyboard grid navigation");
  // offline cached shell and tutorial
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Run factory", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Open tutorial", exact: true })
    .click();
  await page.getByRole("button", { name: "Try the tutorial factory" }).click();
  await page.getByRole("button", { name: "4×", exact: true }).click();
  await page.getByRole("button", { name: "Run factory", exact: true }).click();
  await page.clock.runFor(6500);
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Shift complete", exact: true })
    .waitFor();
  report("cached production reload and tutorial offline");
  await page
    .getByRole("button", { name: "Edit again", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator(".json-text").fill(json);
  await page.getByRole("button", { name: "Validate and import" }).click();
  await page
    .getByRole("dialog")
    .getByText(/Imported \/ untrusted/)
    .waitFor();
  report("historical bundle recomputes offline with untrusted label");
  await page
    .getByRole("button", { name: "Edit again", exact: true })
    .last()
    .click();
  await page.locator(".mode-actions>button").first().click();
  await page
    .getByRole("button", { name: "Open Practice", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Run factory", exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedTick = await page.locator(".stats-bar>div").last().innerText();
  await page.clock.runFor(1000);
  assert.equal(
    await page.locator(".stats-bar>div").last().innerText(),
    pausedTick,
  );
  assert.ok((await page.locator(".tool:disabled").count()) >= 7);
  report("Pause freezes ticks and scored layout is locked");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
    0,
  );
  await page.clock.runFor(12500);
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Shift complete", exact: true })
    .waitFor();
  report("Practice completes offline with reduced-motion setting");
  assert.deepEqual(errors, []);
  report("no uncaught browser errors");
  await writeFile(
    "test/scratch/browser-evidence/results.json",
    JSON.stringify({ checks: outputs, apiCalls: calls }, null, 2),
  );
  console.log("ALL", outputs.length, "CHECKS PASSED");
  await ctx.close();
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
