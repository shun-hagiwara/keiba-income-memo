import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, join } from "node:path";

const require = createRequire(import.meta.url);
const defaultCodexModules = "C:\\Users\\shagi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules";
process.env.NODE_PATH = [process.env.NODE_PATH, defaultCodexModules].filter(Boolean).join(delimiter);
require("node:module").Module._initPaths();

const imageDir = process.env.TEST_IMAGES_DIR || "C:\\Users\\shagi\\Downloads";
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:4174/";
const ipatRaceDate = process.env.TEST_IPAT_RACE_DATE || "2026-05-30";

const expectedRows = new Map([
  ["\u30c6\u30b9\u30c81.jpg", [
    { date: "2026-05-30", race: "\u6771\u4eac 11R", bet: "", stake: "\uffe5900", payout: "\uffe50" }
  ]],
  ["\u30c6\u30b9\u30c82.jpg", [
    { date: "2026-05-30", race: "\u4eac\u90fd 12R", bet: "", stake: "\uffe5600", payout: "\uffe50" },
    { date: "2026-05-30", race: "\u6771\u4eac 12R", bet: "", stake: "\uffe51,000", payout: "\uffe53,120" },
    { date: "2026-05-30", race: "\u6771\u4eac 11R", bet: "", stake: "\uffe5900", payout: "\uffe5550" }
  ]],
  ["\u30c6\u30b9\u30c83.jpg", [
    { date: "2026-05-31", race: "\u4f50\u8cc0 6R", bet: "\u30ef\u30a4\u30c9 / 1:7 / 2:12 / \u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: "\uffe5200", payout: "\uffe5360" },
    { date: "2026-05-31", race: "\u4f50\u8cc0 6R", bet: "\u4e09\u9023\u8907 / 3:12 / \u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: "\uffe5100", payout: "\uffe50" }
  ]],
  ["\u30c6\u30b9\u30c84.jpg", [
    { date: "2026-05-31", race: "\u4f50\u8cc0 8R", bet: "\u5358\u52dd / 1 / \u901a\u5e38", stake: "\uffe5200", payout: "\uffe50" }
  ]],
  ["\u30c6\u30b9\u30c8_\u4e09\u9023\u8907.jpg", [
    { date: "2026-06-02", race: "\u8239\u6a4b 12R", bet: "\u5358\u52dd / 8 / \u901a\u5e38", stake: "\uffe5200", payout: "\uffe5480" },
    { date: "2026-06-02", race: "\u8239\u6a4b 12R", bet: "\u4e09\u9023\u8907 / \u8ef8:1,8 / 5,6 / \u8ef82\u982d\u6d41\u3057", stake: "\uffe5200", payout: "\uffe50" }
  ]],
  ["\u30c6\u30b9\u30c8_\u540d\u53e4\u5c4b.jpg", [
    { date: "2026-06-02", race: "\u540d\u53e4\u5c4b 10R", bet: "\u4e09\u9023\u8907 / \u8ef8:7,8 / 4,6 / \u8ef82\u982d\u6d41\u3057", stake: "\uffe5200", payout: "\uffe50" }
  ]]
]);

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

await assertFileExists(chromePath, "Chrome/Edge executable");

const imageNames = (await readdir(imageDir))
  .filter((name) => /^\u30c6\u30b9\u30c8.*\.jpg$/i.test(name))
  .sort((left, right) => left.localeCompare(right, "ja"));
assert.deepEqual(imageNames, [...expectedRows.keys()].sort((left, right) => left.localeCompare(right, "ja")));

const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

async function readRows(page) {
  return page.evaluate(() => [...document.querySelectorAll("#candidate-body tr")].map((row) => {
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim().replace(/\s+/g, " "));
    return {
      date: cells[1],
      race: cells[2],
      bet: cells[3],
      stake: cells[4],
      payout: cells[5]
    };
  }));
}

async function completeOcr(page) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await page.locator("#ipat-date-modal").isVisible()) {
      await page.fill("#ipat-date-input", ipatRaceDate);
      await page.click("#ipat-date-form button[type=submit]");
    }
    const progress = await page.locator("#ocr-progress").textContent();
    if ((progress || "").includes("1/1")) return;
    await page.waitForTimeout(150);
  }
  throw new Error("OCR did not complete within 180 seconds");
}

try {
  for (const imageName of imageNames) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await page.goto(`${appUrl}?all-images-e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
      await page.setInputFiles("#image-input", join(imageDir, imageName));
      await page.click("#run-ocr");
      await completeOcr(page);

      const rows = await readRows(page);
      assert.deepEqual(rows, expectedRows.get(imageName), `${imageName}: OCR candidates`);

      await page.click("#parse-text");
      const reflectedRows = await readRows(page);
      assert.deepEqual(reflectedRows, expectedRows.get(imageName), `${imageName}: reflected OCR candidates`);
      console.log(`${imageName}: ${rows.length} row(s) passed`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("all test images passed");
