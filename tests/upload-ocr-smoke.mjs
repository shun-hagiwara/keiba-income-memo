import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter } from "node:path";

const require = createRequire(import.meta.url);

const defaultCodexModules = "C:\\Users\\shagi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules";
process.env.NODE_PATH = [process.env.NODE_PATH, defaultCodexModules].filter(Boolean).join(delimiter);
require("node:module").Module._initPaths();

const imagePath = process.argv[2] || process.env.TEST_IMAGE_PATH || "C:\\Users\\shagi\\Downloads\\S__274374658.jpg";
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:4174/";
const raceDate = process.env.TEST_IPAT_DATE || "2026-05-30";
const expectedRows = Number(process.env.TEST_EXPECTED_ROWS || 4);

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);

  return candidates[0];
}

async function assertFileExists(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

await assertFileExists(imagePath, "test image");
const chromePath = resolveChromeExecutable();
await assertFileExists(chromePath, "Chrome/Edge executable");

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept(raceDate);
    } else {
      await dialog.accept();
    }
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.setInputFiles("#image-input", imagePath);
  await page.click("#run-ocr");

  await page.waitForFunction(() => {
    const rows = document.querySelectorAll("#candidate-body tr").length;
    const status = document.querySelector("#ocr-status")?.textContent || "";
    return rows > 0 || status.includes("失敗") || status.toLowerCase().includes("error");
  }, { timeout: 180_000 });

  const result = await page.evaluate(() => ({
    status: document.querySelector("#ocr-status")?.textContent || "",
    progress: document.querySelector("#ocr-progress")?.textContent || "",
    rows: [...document.querySelectorAll("#candidate-body tr")].map((row) => {
      const cells = [...row.querySelectorAll("td")].map((td) => td.textContent.trim());
      return {
        source: cells[0],
        date: cells[1],
        race: cells[2],
        bet: cells[3],
        stake: cells[4],
        payout: cells[5],
        profit: cells[6]
      };
    }),
    ocrText: document.querySelector("#ocr-text")?.value || ""
  }));

  assert.equal(result.status, "OCR完了");
  assert.equal(result.rows.length, expectedRows);
  assert.deepEqual(result.rows.map((row) => row.race), ["京都 12R", "京都 11R", "東京 12R", "東京 11R"]);
  assert.deepEqual(result.rows.map((row) => row.stake), ["￥200", "￥500", "￥200", "￥300"]);
  assert.ok(result.ocrText.includes("Om"), "fixture should exercise OCR amount noise");

  console.log(JSON.stringify({
    status: result.status,
    progress: result.progress,
    rows: result.rows
  }, null, 2));
} finally {
  await browser.close();
}
