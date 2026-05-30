import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function createElement(id = "") {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    checked: false,
    dataset: {},
    style: {},
    className: "",
    classList: { toggle() {}, add() {}, remove() {} },
    append() {},
    prepend() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    closest() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    getContext() {
      return {
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        arc() {},
        fillText() {},
        createLinearGradient() { return { addColorStop() {} }; },
        measureText(text) { return { width: String(text).length * 8 }; }
      };
    }
  };
}

async function loadParser() {
  const code = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const elements = new Map();
  let promptCount = 0;

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    createElement,
    querySelectorAll() { return []; },
    querySelector() { return null; },
    body: createElement("body")
  };

  const window = {
    addEventListener() {},
    matchMedia() { return { matches: true }; },
    confirm() { return true; },
    prompt() {
      promptCount += 1;
      return "2026-05-30";
    },
    alert() {}
  };

  const context = {
    console,
    document,
    window,
    globalThis: window,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    crypto: { randomUUID() { return "test-id"; } },
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    fetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
    Intl,
    Date,
    RegExp,
    String,
    Number,
    Array,
    Map,
    Set,
    JSON,
    Math
  };

  vm.runInNewContext(code, context, { filename: "app.js" });
  return {
    parser: window.keibaMemoParser,
    getPromptCount: () => promptCount
  };
}

const { parser, getPromptCount } = await loadParser();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const cleanIpat = `確 京都 12R
購入 200円 払戻 0円
確 京都 11R 葵S
購入 500円 払戻 0円`;

assert.deepEqual(
  plain(parser.parseIpatEntries(cleanIpat, "2026-05-30").map(({ track, raceNumber, stake, payout, betType, selection, memo }) => ({
    track,
    raceNumber,
    stake,
    payout,
    betType,
    selection,
    memo
  }))),
  [
    { track: "京都", raceNumber: "12R", stake: 200, payout: 0, betType: "", selection: "", memo: "" },
    { track: "京都", raceNumber: "11R", stake: 500, payout: 0, betType: "", selection: "", memo: "葵S" }
  ]
);

const noisyIpat = `鞍 京都 12R 。
購入 200m 払戻 Om
鞍 京都 11R 葵 S
購入 500m #E Om る
鞍 東京 12R -
購入 200m HE Om
鞍 東京 11R アハ ル テ ケ e
購入 300ms H#HE Om`;

assert.deepEqual(
  plain(parser.parseIpatEntries(noisyIpat, "2026-05-30").map(({ track, raceNumber, stake, payout, betType, selection, memo }) => ({
    track,
    raceNumber,
    stake,
    payout,
    betType,
    selection,
    memo
  }))),
  [
    { track: "京都", raceNumber: "12R", stake: 200, payout: 0, betType: "", selection: "", memo: "" },
    { track: "京都", raceNumber: "11R", stake: 500, payout: 0, betType: "", selection: "", memo: "葵S" },
    { track: "東京", raceNumber: "12R", stake: 200, payout: 0, betType: "", selection: "", memo: "" },
    { track: "東京", raceNumber: "11R", stake: 300, payout: 0, betType: "", selection: "", memo: "アハルテケ" }
  ]
);

const candidates = parser.parseTextToCandidates(`--- ipat-1.jpg ---
${noisyIpat}
--- ipat-2.jpg ---
${cleanIpat}`);

assert.equal(candidates.length, 6);
assert.equal(getPromptCount(), 1);
assert.equal(candidates[0].raceDate, "2026-05-30");
assert.equal(candidates.at(-1).sourceName, "ipat-2.jpg");

console.log("parser tests passed");
