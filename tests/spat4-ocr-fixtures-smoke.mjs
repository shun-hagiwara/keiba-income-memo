import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter } from "node:path";

const require = createRequire(import.meta.url);
const defaultCodexModules = "C:\\Users\\shagi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules";
process.env.NODE_PATH = [process.env.NODE_PATH, defaultCodexModules].filter(Boolean).join(delimiter);
require("node:module").Module._initPaths();

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

await assertFileExists(chromePath, "Chrome/Edge executable");

const fixtures = new Map([
  ["IMG_7833", {
    text: `--- IMG_7833.png ---
受付 番号 0001
受付 日 時 2026 年 06 月 05 日 18:20
購入 件 数 2 件
2020 0 月 05 日
船橋 8R 馬 1:3 ( 衝 100 同
馬 複 ’2:8 的 中 1.210 円
フォ - メ -ション
2026 年 06 月 05 日 る 100 円
船橋 8R 馬 1:3 ( 衝 100 同
ワイ ド 二 8 的 中 530 円
- メ -ション
[SPAT4 表領域補助OCR]
2026年06月05日
. (各100円)
船橋8R 回癌 100円
馬複 知人 的中 1.210円
フォ-メ-ション
2026年06月05日
. (各100円)
船橋8R 5 100円
に m2: 的中 _530円
フォ-メ-ション`,
    rows: [
      { date: "2026-06-05", race: "船橋 8R", bet: "馬複 / 1:3 / 2:8 / フォーメーション", stake: "￥100", payout: "￥1,210" },
      { date: "2026-06-05", race: "船橋 8R", bet: "ワイド / 1:3 / 2:8 / フォーメーション", stake: "￥100", payout: "￥530" }
    ]
  }],
  ["IMG_7834", {
    text: `--- IMG_7834.png ---
受付 番号 0002
受付 日 時 2026 年 06 月 05 日 18:48
購入 件 数 1 件
2026 年 06 月 05 日
) 橋 9R 馬 1:4 ( 各 100 円 )
i = 馬 2:5 100 円
フォ - メ -ション
[SPAT4 表領域補助OCR]
2026年06月05日
答橋9R 馬1:4 (各100円)
ワイド 馬2:5 100円
フォ-メ-ション`,
    rows: [
      { date: "2026-06-05", race: "船橋 9R", bet: "ワイド / 1:4 / 2:5 / フォーメーション", stake: "￥100", payout: "￥0" }
    ]
  }],
  ["IMG_7835", {
    text: `--- IMG_7835.png ---
受付 番号 0003
受付 日 時 2026 年 06 月 05 日 19:34
購入 件 数 2 件
2026 年 06 月 05 日
船橋 10R 6 300 円
単勝
通常
2026 年 06 月 05 日
j 橋 10R 1 着 :6 ( 各 100 円 )
jik 0 2 着 :7 100 円
フォ - メ -ション
[SPAT4 表領域補助OCR]
2026年06月05日
船橋10R 6 300円
単勝
世常
2026年06月05日
船橋10R 1着:6 (各100円)
馬単 2着:7 100円
フォ-メ-ション`,
    rows: [
      { date: "2026-06-05", race: "船橋 10R", bet: "単勝 / 6 / 通常", stake: "￥300", payout: "￥0" },
      { date: "2026-06-05", race: "船橋 10R", bet: "馬単 / 1着:6 / 2着:7 / フォーメーション", stake: "￥100", payout: "￥0" }
    ]
  }],
  ["IMG_7836", {
    text: `--- IMG_7836.png ---
受付 番号 0004
受付 日 時 2026 年 06 月 05 日 19:54
購入 件 数 2 件
2026 年 06 月 05 日
j 橋 11R 馬 1:3 ( 各 100 円 )
dit 馬 2:9 100 円
フォ - メ -ション
2026 年 06 月 05 日
j 栓 11R 馬 1:3 ( 各 300 円 )
店 ド 馬 2:9 300 円
フォ - メ -ション
[SPAT4 表領域補助OCR]
2026年06月05日
船橋11R 馬1:3 (各100円)
馬複 馬2:9 100円
JxA—AX—=23V
2026年06月05日
船橋11R 馬1:3 (各300円)
T4K 馬2:9 300円
JxA—X—=>3V
2026年06月05日
船橋11R 馬1:3 (各100円)
馬複 馬2:9 100円`,
    rows: [
      { date: "2026-06-05", race: "船橋 11R", bet: "馬複 / 1:3 / 2:9 / フォーメーション", stake: "￥100", payout: "￥0" },
      { date: "2026-06-05", race: "船橋 11R", bet: "ワイド / 1:3 / 2:9 / フォーメーション", stake: "￥300", payout: "￥0" }
    ]
  }],
  ["IMG_7837", {
    text: `--- IMG_7837.png ---
受付 番号 0005
受付 日 時 2026 年 06 月 05 日 20:00
購入 件 数 1 件
2026 年 06 月 05 日
船橋 11R 4 100 円
単勝
通常
[SPAT4 表領域補助OCR]
2026年06月05日
船橋11R 4 100円
単勝
世常
レ-ス/式別 馬/組番 投票金額
2026年06月05日
4 100MH
単勝`,
    rows: [
      { date: "2026-06-05", race: "船橋 11R", bet: "単勝 / 4 / 通常", stake: "￥100", payout: "￥0" }
    ]
  }],
  ["IMG_7838", {
    text: `--- IMG_7838.png ---
受付 番号 0006
受付 日 時 2026 年 06 月 05 日 20:45
購入 件 数 1 件
レ- ス / 式 別 馬 / 組 番 投票金額
2026 年 06 月 05 日
船橋 12R 馬 1:6 ( 各 500 円 )
ワイ ド 馬 2:9 500 円
フォ - メ -ション
[SPAT4 表領域補助OCR]
2026年06月05日
船橋12R 馬1:6 (各500円)
ワイド 馬2:9 500円
レ-ス/式別 馬/組番 投票金額
2026年06月05日
馬1:6 (各500円)
ワイド 馬2:9 500円`,
    rows: [
      { date: "2026-06-05", race: "船橋 12R", bet: "ワイド / 1:6 / 2:9 / フォーメーション", stake: "￥500", payout: "￥0" }
    ]
  }]
]);

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

try {
  for (const [name, fixture] of fixtures) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await page.goto(`${appUrl}?spat4-fixture=${Date.now()}`, { waitUntil: "domcontentloaded" });
      await page.evaluate((text) => {
        const textarea = document.querySelector("#ocr-text");
        textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }, fixture.text);
      await page.click("#parse-text");
      const rows = await readRows(page);
      assert.deepEqual(rows, fixture.rows, `${name}: parsed rows`);
      console.log(`${name}: ${rows.length} row(s) passed`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("all OCR fixtures passed");
