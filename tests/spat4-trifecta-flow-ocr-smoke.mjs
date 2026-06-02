import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter } from "node:path";

const require = createRequire(import.meta.url);
const defaultCodexModules = "C:\\Users\\shagi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules";
process.env.NODE_PATH = [process.env.NODE_PATH, defaultCodexModules].filter(Boolean).join(delimiter);
require("node:module").Module._initPaths();

const imagePath = process.argv[2] || process.env.TEST_IMAGE_PATH || "C:\\Users\\shagi\\Downloads\\テスト_三連複.jpg";
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:4174/";

async function assertFileExists(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

const chromePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean)[0];

await assertFileExists(imagePath, "SPAT4 trifecta flow test image");
await assertFileExists(chromePath, "Chrome/Edge executable");

const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${appUrl}?spat4-flow-e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.setInputFiles("#image-input", imagePath);
  await page.click("#run-ocr");
  await page.waitForFunction(() => (document.querySelector("#ocr-progress")?.textContent || "").includes("1/1"), null, {
    timeout: 180_000
  });

  const readRows = () => page.evaluate(() => [...document.querySelectorAll("#candidate-body tr")].map((row) => {
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim().replace(/\s+/g, " "));
    return {
      race: cells[2],
      bet: cells[3],
      stake: cells[4],
      payout: cells[5]
    };
  }));

  const expectedRows = [
    { race: "船橋 12R", bet: "単勝 / 8 / 通常", stake: "￥200", payout: "￥480" },
    { race: "船橋 12R", bet: "三連複 / 軸:1,8 / 5,6 / 軸2頭流し", stake: "￥200", payout: "￥0" }
  ];

  const rows = await readRows();
  assert.deepEqual(rows, expectedRows);

  await page.click("#parse-text");
  const reflectedRows = await readRows();
  assert.deepEqual(reflectedRows, expectedRows, "reflecting OCR text must preserve separated ticket rows");

  console.log(JSON.stringify({ rows, reflectedRows }, null, 2));
} finally {
  await browser.close();
}
