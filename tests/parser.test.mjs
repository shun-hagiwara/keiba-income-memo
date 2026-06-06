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

const spat4MergedSingleAxisFlowOcr = `\u53d7\u4ed8 \u756a\u53f7 0002
\u53d7\u4ed8 \u65e5 \u6642 2026 \u5e74 06 \u6708 02 \u65e5 18:51
\u8cfc\u5165 \u4ef6 \u6570 1 \u4ef6
2026 \u5e74 06 \u6708 02 \u65e5
\u8ef8 :7 8 ( \u5404 100 \u5186 )
\u540d \u53e4\u5c4b 1 OR 46 200 \u5186
\u8ef8 2 \u982d \u6d41\u3057
[\u0053\u0050\u0041\u0054\u0034 \u8868\u9818\u57df\u88dc\u52a9\u004f\u0043\u0052]
\u30ec-\u30b9/\u5f0f\u5225 \u99ac/\u7d44\u756a \u6295\u7968\u91d1\u984d
2026\u5e7406\u670802\u65e5
\u540d\u53e4\u5c4b10\u0052 \u8ef8:7 8 (\u5404100\u5186)
\u4e09\u9023\u8907 4 6 200\u5186
\u8ef82\u982d\u6d41\u3057`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4MergedSingleAxisFlowOcr).map(({ track, raceNumber, betType, selection, ticketType, stake }) => ({
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

const spat4June5OcrPatterns = `受付 番号 0001
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
フォ-メ-ション`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4June5OcrPatterns).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "8R", betType: "馬複", selection: "1:3 / 2:8", ticketType: "フォーメーション", stake: 100, payout: 1210 },
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "8R", betType: "ワイド", selection: "1:3 / 2:8", ticketType: "フォーメーション", stake: 100, payout: 530 }
  ]
);

const spat4SingleFormationWithBrokenTrack = `受付 番号 0002
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
フォ-メ-ション`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleFormationWithBrokenTrack).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "9R", betType: "ワイド", selection: "1:4 / 2:5", ticketType: "フォーメーション", stake: 100, payout: 0 }
  ]
);

const spat4SingleAndExactaFormation = `受付 番号 0003
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
フォ-メ-ション`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleAndExactaFormation).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "10R", betType: "単勝", selection: "6", ticketType: "通常", stake: 300, payout: 0 },
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "10R", betType: "馬単", selection: "1着:6 / 2着:7", ticketType: "フォーメーション", stake: 100, payout: 0 }
  ]
);

const spat4DuplicatedSupplementRows = `受付 番号 0004
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
馬複 馬2:9 100円`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4DuplicatedSupplementRows).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "11R", betType: "馬複", selection: "1:3 / 2:9", ticketType: "フォーメーション", stake: 100, payout: 0 },
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "11R", betType: "ワイド", selection: "1:3 / 2:9", ticketType: "フォーメーション", stake: 300, payout: 0 }
  ]
);

const spat4SingleWinBrokenSupplement = `受付 番号 0005
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
単勝`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleWinBrokenSupplement).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "11R", betType: "単勝", selection: "4", ticketType: "通常", stake: 100, payout: 0 }
  ]
);

const spat4SingleWideFormation = `受付 番号 0006
受付 日 時 2026 年 06 月 05 日 20:45
購入 件 数 1 件
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
ワイド 馬2:9 500円`;

assert.deepEqual(
  plain(parser.parseSpat4Entries(spat4SingleWideFormation).map(({ raceDate, track, raceNumber, betType, selection, ticketType, stake, payout }) => ({
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
    { raceDate: "2026-06-05", track: "船橋", raceNumber: "12R", betType: "ワイド", selection: "1:6 / 2:9", ticketType: "フォーメーション", stake: 500, payout: 0 }
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

const reparsedCandidates = parser.parseTextToCandidates(`--- ipat-1.jpg ---
${noisyIpat}
--- ipat-2.jpg ---
${cleanIpat}`, { requestMissingIpatDate: false });
const preservedCandidates = parser.preserveIpatRaceDates(reparsedCandidates, candidates);
assert.equal(getPromptCount(), 2);
assert.equal(preservedCandidates[0].raceDate, "2026-05-30");
assert.equal(preservedCandidates.at(-1).raceDate, "2026-05-30");

console.log("parser tests passed");
