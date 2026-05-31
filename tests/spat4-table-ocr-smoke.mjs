import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter } from "node:path";

const require = createRequire(import.meta.url);
const defaultCodexModules = "C:\\Users\\shagi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules";
process.env.NODE_PATH = [process.env.NODE_PATH, defaultCodexModules].filter(Boolean).join(delimiter);
require("node:module").Module._initPaths();

const imagePath = process.argv[2] || process.env.TEST_IMAGE_PATH || "C:\\Users\\shagi\\Downloads\\テスト4.jpg";
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:4174/";

async function assertFileExists(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

function resolveChromeExecutable() {
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean)[0];
}

await assertFileExists(imagePath, "SPAT4 test image");
const chromePath = resolveChromeExecutable();
await assertFileExists(chromePath, "Chrome/Edge executable");

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${appUrl}?spat4-e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.setInputFiles("#image-input", imagePath);
  await page.click("#run-ocr");
  await page.waitForFunction(() => (document.querySelector("#ocr-progress")?.textContent || "").includes("1/1"), {
    timeout: 180_000
  });

  const result = await page.evaluate(() => ({
    status: document.querySelector("#ocr-status")?.textContent || "",
    rows: [...document.querySelectorAll("#candidate-body tr")].map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim().replace(/\s+/g, " "));
      return {
        race: cells[2],
        bet: cells[3],
        stake: cells[4],
        payout: cells[5]
      };
    }),
    ocrText: document.querySelector("#ocr-text")?.value || ""
  }));

  assert.ok(result.status.startsWith("OCR完了"), `unexpected OCR status: ${result.status}`);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    race: "佐賀 8R",
    bet: "単勝 / 1 / 通常",
    stake: "￥200",
    payout: "￥0"
  });
  assert.ok(result.ocrText.includes("[SPAT4 表領域補助OCR]"));

  await page.click("#parse-text");
  const reflectedRows = await page.evaluate(() => [...document.querySelectorAll("#candidate-body tr")].map((row) => {
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim().replace(/\s+/g, " "));
    return {
      race: cells[2],
      bet: cells[3],
      stake: cells[4],
      payout: cells[5]
    };
  }));
  assert.deepEqual(reflectedRows, result.rows, "reflecting OCR text must not duplicate supplemental rows");

  console.log(JSON.stringify({ ...result, reflectedRows }, null, 2));
} finally {
  await browser.close();
}
