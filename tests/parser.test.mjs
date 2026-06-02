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

const attachedIpatExamples = `\u78ba \u6771\u4eac 11R \u30aa\u30fc\u30af\u30b9
\u8cfc\u5165 900\u5186 \u6255\u623b 0\u5186
\u78ba \u4eac\u90fd 12R
\u8cfc\u5165 600\u5186 \u6255\u623b 0\u5186
\u78ba \u6771\u4eac 12R B S \u30a4\u30ec\u30d6
\u8cfc\u5165 1,000\u5186 \u6255\u623b 3,120\u5186
\u78ba \u6771\u4eac 11R \u30f4\u30a3\u30af\u30c8\u30ea
\u8cfc\u5165 900\u5186 \u6255\u623b 550\u5186`;

assert.deepEqual(
  plain(parser.parseIpatEntries(attachedIpatExamples, "2026-05-31").map(({ track, raceNumber, stake, payout, memo }) => ({
    track,
    raceNumber,
    stake,
    payout,
    memo
  }))),
  [
    { track: "\u6771\u4eac", raceNumber: "11R", stake: 900, payout: 0, memo: "\u30aa\u30fc\u30af\u30b9" },
    { track: "\u4eac\u90fd", raceNumber: "12R", stake: 600, payout: 0, memo: "" },
    { track: "\u6771\u4eac", raceNumber: "12R", stake: 1000, payout: 3120, memo: "BS\u30a4\u30ec\u30d6" },
    { track: "\u6771\u4eac", raceNumber: "11R", stake: 900, payout: 550, memo: "\u30f4\u30a3\u30af\u30c8\u30ea" }
  ]
);

const realIpatOcr = `B \u6771\u4eac 11R \u30aa- \u30af\u30b9 -
\u8cfc\u5165 900m #HE Om \u3054
\u8f03 \u4eac\u90fd 12R ®
\u8cfc\u5165 600mg \u6255\u623b Om
\u8f03 \u6771\u4eac 12R BS \u30a4\u30ec \u30d6
\u8cfc\u5165 1000m #HE 3120m \u306b
\u8f03 \u6771\u4eac 11R \u30f4\u30a3 \u30af\u30c8 \u30ea \u3063
\u8cfc\u5165 900m \u6255\u623b 550g`;

assert.deepEqual(
  plain(parser.parseIpatEntries(realIpatOcr, "2026-06-01").map(({ track, raceNumber, stake, payout, memo }) => ({
    track,
    raceNumber,
    stake,
    payout,
    memo
  }))),
  [
    { track: "\u6771\u4eac", raceNumber: "11R", stake: 900, payout: 0, memo: "\u30aa\u30fc\u30af\u30b9" },
    { track: "\u4eac\u90fd", raceNumber: "12R", stake: 600, payout: 0, memo: "" },
    { track: "\u6771\u4eac", raceNumber: "12R", stake: 1000, payout: 3120, memo: "BS\u30a4\u30ec\u30d6" },
    { track: "\u6771\u4eac", raceNumber: "11R", stake: 900, payout: 550, memo: "\u30f4\u30a3\u30af\u30c8\u30ea" }
  ]
);

const iphoneIpatOcr = `3 \u4eac\u90fd 12R
\u8cfc\u5165 600q \u6255\u623b Om \u306b
\u8f03 \u6771\u4eac 12hR BS \u30a4\u30ec \u30d6 6
\u8cfc\u5165 1000m \u6255\u623b 3120m
\u8f03 \u6771\u4eac 11R \u30f4\u30a3 \u30af\u30c8 \u30ea 6
\u8cfc\u5165 900m _ \u6255\u623b 550m`;

assert.deepEqual(
  plain(parser.parseIpatEntries(iphoneIpatOcr, "2026-05-17").map(({ track, raceNumber, stake, payout, memo }) => ({
    track,
    raceNumber,
    stake,
    payout,
    memo
  }))),
  [
    { track: "\u4eac\u90fd", raceNumber: "12R", stake: 600, payout: 0, memo: "" },
    { track: "\u6771\u4eac", raceNumber: "12R", stake: 1000, payout: 3120, memo: "BS\u30a4\u30ec\u30d6" },
    { track: "\u6771\u4eac", raceNumber: "11R", stake: 900, payout: 550, memo: "\u30f4\u30a3\u30af\u30c8\u30ea" }
  ]
);

const spat4MultiFormationOcr = `\u53d7\u4ed8 \u756a\u53f7 0003
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 05 \u6708 31 \u65e5 18:01
\u8cfc\u5165 \u4ef6 \u6570 2 \u4ef6
2026 \u5e74 05 \u6708 31 \u65e5 ( \u5404 200 \u5186 )
\u4f50\u8cc0 6R \u6642 212 200 \u5186
\u30ef\u30a4 \u30c9 9 \u7684 \u4e2d 360 \u5186
\u30d5\u30a9 - \u30e1 -\u30b7\u30e7\u30f3
2026 \u5e74 05 \u6708 31 \u65e5 \u99ac 1:5
\u4f50\u8cc0 6R \u99ac 2.7 ( \u5404 100 \u5186 )
\u4e09 \u9023 \u8907 \u99ac 3:12 100H
\u30d5\u30a9 - \u30e1 -\u30b7\u30e7\u30f3`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4MultiFormationOcr).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
    raceDate,
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake,
    payout
  }))),
  [
    { raceDate: "2026-05-31", track: "\u4f50\u8cc0", raceNumber: "6R", betType: "\u30ef\u30a4\u30c9", selection: "", ticketType: "\u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: 200, payout: 360 },
    { raceDate: "2026-05-31", track: "\u4f50\u8cc0", raceNumber: "6R", betType: "\u4e09\u9023\u8907", selection: "1:5 / 2.7 / 3:12", ticketType: "\u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: 100, payout: 0 }
  ]
);

const spat4SupplementedSingleOcr = `\u53d7\u4ed8 \u756a\u53f7 0004
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 05 \u6708 31 \u65e5 18:23
\u8cfc\u5165 \u4ef6 \u6570 1 \u4ef6
\u5358 \u52dd
\u901a \u5e38
[SPAT4 \u8868\u9818\u57df\u88dc\u52a9OCR]
\u30ec\u30fc\u30b9/\u5f0f\u5225 \u99ac/\u7d44\u756a \u6295\u7968\u91d1\u984d
2026\u5e7405\u670831\u65e5
\u4f50\u8cc08R 200\u5186
\u5358\u52dd
\u901a\u5e38
[SPAT4 \u99ac\u30fb\u7d44\u756a\u88dc\u52a9OCR]
1`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SupplementedSingleOcr).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
    raceDate,
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake,
    payout
  }))),
  [
    { raceDate: "2026-05-31", track: "\u4f50\u8cc0", raceNumber: "8R", betType: "\u5358\u52dd", selection: "1", ticketType: "\u901a\u5e38", stake: 200, payout: 0 }
  ]
);

const spat4SupplementedFormationOcr = `\u53d7\u4ed8 \u756a\u53f7 0003
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 05 \u6708 31 \u65e5 18:01
\u8cfc\u5165 \u4ef6 \u6570 2 \u4ef6
2026 \u5e74 05 \u6708 31 \u65e5 ( \u5404 200 \u5186
71RK \u7684 \u4e2d 360 \u5186
\u30d5\u30a9 - \u30e1 -\u30b7\u30e7\u30f3
2026 \u5e74 05 \u6708 31 \u65e5
\u4f50\u8cc0 6R ( \u5404 100 \u5186 )
\u4e09 \u9023 \u8907 \u99ac 3:12 1
\u30d5\u30a9 - \u30e1 -\u30b7\u30e7\u30f3
[SPAT4 \u8868\u9818\u57df\u88dc\u52a9OCR]
\u30ec-\u30b9/\u5f0f\u5225 \u99ac/\u7d44\u756a \u6295\u7968\u91d1\u984d
2026\u5e7405\u670831\u65e5
\u30ef\u30a4\u30c9 \u99ac2:1 \u7684\u4e2d 360\u5186
\u30d5\u30a9-\u30e1-\u30b7\u30e7\u30f3
2026\u5e7405\u670831\u65e5
\u4f50\u8cc06R ( \u5404 100\u5186 )
\u4e09\u9023\u8907 \u99ac3:12`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SupplementedFormationOcr).map(({ track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake,
    payout
  }))),
  [
    { track: "\u4f50\u8cc0", raceNumber: "6R", betType: "\u30ef\u30a4\u30c9", selection: "", ticketType: "\u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: 200, payout: 360 },
    { track: "\u4f50\u8cc0", raceNumber: "6R", betType: "\u4e09\u9023\u8907", selection: "3:12", ticketType: "\u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: 100, payout: 0 }
  ]
);

const spat4AxisFlowOcr = `\u53d7\u4ed8 \u756a\u53f7 0005
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 06 \u6708 02 \u65e5 20:23
\u8cfc\u5165 \u4ef6 \u6570 2 \u4ef6
2026 \u5e74 06 \u6708 02 \u65e5
j \u6109 12R 200 \u5186
\u9047 \u4eba 8 \u7684 \u4e2d 480 \u5186
\u901a\u5e38
2026 \u5e74 06 \u6708 02 \u65e5
\u8239\u6a4b 12R \u8ef8 :1 8 ( \u5404 100 \u5186 )
\u4e09 \u9023 \u8907 5 6 200 \u5186
\u8ef8 2 \u982d \u6d41\u3057
[SPAT4 \u8868\u9818\u57df\u88dc\u52a9OCR]
2026\u5e7406\u670802\u65e5
\u8239\u6a4b12R 200\u5186
\u5358\u52dd \u65e5 \u7684\u4e2d 480\u5186
\u901a\u5e38
2026\u5e7406\u670802\u65e5
5 \u8ef8:1 8 (\u5404100\u5186)
\u8ef82\u982d\u6d41\u3057`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4AxisFlowOcr).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
    raceDate,
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake,
    payout
  }))),
  [
    { raceDate: "2026-06-02", track: "\u8239\u6a4b", raceNumber: "12R", betType: "\u5358\u52dd", selection: "8", ticketType: "\u901a\u5e38", stake: 200, payout: 480 },
    { raceDate: "2026-06-02", track: "\u8239\u6a4b", raceNumber: "12R", betType: "\u4e09\u9023\u8907", selection: "\u8ef8:1,8 / 5,6", ticketType: "\u8ef82\u982d\u6d41\u3057", stake: 200, payout: 0 }
  ]
);

const spat4SingleFormationOcr = `\u53d7\u4ed8 \u756a\u53f7 0001
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 06 \u6708 02 \u65e5 18:44
\u8cfc\u5165 \u4ef6 \u6570 1 \u4ef6
2026 \u5e74 06 \u6708 02 \u65e5
\u91d1\u6ca2 12R \u99ac 1:1 ( \u5404 500 \u5186 )
\u30ef\u30a4 \u30c9 \u99ac 2:7 500 \u5186
\u30d5\u30a9 - \u30e1 -\u30b7\u30e7\u30f3`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleFormationOcr).map(({ track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake,
    payout
  }))),
  [
    { track: "\u91d1\u6ca2", raceNumber: "12R", betType: "\u30ef\u30a4\u30c9", selection: "1:1 / 2:7", ticketType: "\u30d5\u30a9\u30fc\u30e1\u30fc\u30b7\u30e7\u30f3", stake: 500, payout: 0 }
  ]
);

const spat4SingleAxisFlowOcr = `\u53d7\u4ed8 \u756a\u53f7 0002
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 06 \u6708 02 \u65e5 18:51
\u8cfc\u5165 \u4ef6 \u6570 1 \u4ef6
2026 \u5e74 06 \u6708 02 \u65e5
\u540d \u53e4\u5c4b 10R \u8ef8 :7 8 ( \u5404 100 \u5186 )
\u4e09 \u9023 \u8907 4 6 200\u5186
\u8ef8 2 \u982d \u6d41\u3057`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleAxisFlowOcr).map(({ track, raceNumber, betType, selection, ticketType, stake }) => ({
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake
  }))),
  [
    { track: "\u540d\u53e4\u5c4b", raceNumber: "10R", betType: "\u4e09\u9023\u8907", selection: "\u8ef8:7,8 / 4,6", ticketType: "\u8ef82\u982d\u6d41\u3057", stake: 200 }
  ]
);

const spat4SingleFlowOcr = `\u53d7\u4ed8 \u756a\u53f7 0004
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 06 \u6708 02 \u65e5 19:34
\u8cfc\u5165 \u4ef6 \u6570 1 \u4ef6
2026 \u5e74 06 \u6708 02 \u65e5
\u8239\u6a4b 11R \u8ef8 :2 ( \u5404 100 \u5186 )
\u30ef\u30a4 \u30c9 4 10 200 \u5186
\u6d41\u3057`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleFlowOcr).map(({ track, raceNumber, betType, selection, ticketType, stake }) => ({
    track,
    raceNumber,
    betType,
    selection,
    ticketType,
    stake
  }))),
  [
    { track: "\u8239\u6a4b", raceNumber: "11R", betType: "\u30ef\u30a4\u30c9", selection: "\u8ef8:2 / 4,10", ticketType: "\u6d41\u3057", stake: 200 }
  ]
);

const candidates = parser.parseTextToCandidates(`--- ipat-1.jpg ---
${noisyIpat}
--- ipat-2.jpg ---
${cleanIpat}`);

assert.equal(candidates.length, 6);
assert.equal(getPromptCount(), 2);
assert.equal(candidates[0].raceDate, "2026-05-30");
assert.equal(candidates.at(-1).sourceName, "ipat-2.jpg");

console.log("parser tests passed");
