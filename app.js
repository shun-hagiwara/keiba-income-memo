const STORAGE_KEY = "spat4-income-records-v1";

const $ = (id) => document.getElementById(id);

const fields = {
  service: $("service"),
  receiptNumber: $("receipt-number"),
  acceptedAt: $("accepted-at"),
  raceDate: $("race-date"),
  track: $("track"),
  raceNumber: $("race-number"),
  betType: $("bet-type"),
  selection: $("selection"),
  ticketType: $("ticket-type"),
  stake: $("stake"),
  payout: $("payout"),
  refund: $("refund"),
  memo: $("memo"),
  sourceName: $("source-name"),
  sourceIndex: $("source-index"),
  sourceImageName: $("source-image-name"),
  sourceImageType: $("source-image-type"),
  sourceRawText: $("source-raw-text")
};

const state = {
  imageFiles: [],
  imageUrls: [],
  sourceImages: loadImages(),
  candidates: [],
  records: loadRecords(),
  periodMode: "day"
};

const moneyFormat = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

const TRACK_NAMES = ["門別", "盛岡", "水沢", "浦和", "船橋", "大井", "川崎", "金沢", "笠松", "名古屋", "園田", "姫路", "高知", "佐賀", "帯広"];
const BET_TYPES = ["三連単", "三連複", "3連単", "3連複", "ワイド", "枠複", "馬複", "枠単", "馬単", "単勝", "複勝"];
const TICKET_TYPES = ["フォーメーション", "ボックス", "流し", "通常"];
const TRACK_PATTERN = TRACK_NAMES.join("|");

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function loadImages() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-images`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveImages() {
  localStorage.setItem(`${STORAGE_KEY}-images`, JSON.stringify(state.sourceImages));
}

function normalizeText(text) {
  return text
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, "")
    .replace(/[‐ー−]/g, "-")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseJapaneseDate(dateText) {
  const match = dateText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseJapaneseDateTime(text) {
  const match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})[:：]\s*(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}`;
}

function parseYen(value) {
  if (!value) return 0;
  const match = String(value).replace(/,/g, "").match(/(\d+)\s*(?:円|四|囚|口)?/);
  return match ? Number(match[1]) : 0;
}

function firstMatch(text, patterns, group = 1) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[group]) return match[group].trim();
  }
  return "";
}

function compactText(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function parseSpat4Text(rawText) {
  return parseSpat4Entries(rawText)[0] || emptySpat4Entry();
}

function emptySpat4Entry() {
  return {
    service: "SPAT4",
    receiptNumber: "",
    acceptedAt: "",
    raceDate: "",
    track: "",
    raceNumber: "",
    betType: "",
    selection: "",
    ticketType: "",
    stake: 0,
    payout: 0,
    refund: 0
  };
}

function parseSpat4Entries(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const joined = lines.join(" ");
  const compact = compactText(joined);

  const acceptedAt = firstMatch(joined, [
    /受付\s*日\s*時\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*\d{1,2}[:：]\s*\d{2})/,
    /受付日時\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*\d{1,2}[:：]\s*\d{2})/,
    /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*\d{1,2}[:：]\s*\d{2})/
  ]);

  const receiptNumber = firstMatch(joined, [/受付\s*番号\s*([0-9]{1,8})/, /受付番号\s*([0-9]{1,8})/]);
  const raceDateText = firstMatch(joined, [
    /レ\s*[-ー]\s*ス\s*\/\s*式\s*別\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/,
    /レース\/式別\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/,
    /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)\s*[^\s]*\s*\d{1,2}R/
  ]);

  const common = {
    service: "SPAT4",
    receiptNumber,
    acceptedAt: parseJapaneseDateTime(acceptedAt),
    raceDate: parseJapaneseDate(raceDateText || acceptedAt)
  };

  const parsedTickets = parseTicketRows(lines, common);
  if (parsedTickets.length) return parsedTickets;

  const raceMatch = compact.match(new RegExp(`(${TRACK_PATTERN})(\\d{1,2})R`, "i"));
  const betType = firstMatch(compact, [
    new RegExp(`(${BET_TYPES.join("|")})`)
  ]);
  const ticketType = firstMatch(compact, [new RegExp(`(${TICKET_TYPES.join("|")})`)]);

  const payout = parsePayout(joined, compact);
  const stake = parseStake(joined, payout);
  const refund = parseRefund(joined);

  const selection = findSelection(lines, betType, stake);

  return [{
    ...common,
    track: raceMatch?.[1] ?? "",
    raceNumber: raceMatch?.[2] ? `${raceMatch[2]}R` : "",
    betType,
    selection: selection || inferSelectionFromNoisyAmount(joined, stake),
    ticketType,
    stake,
    payout,
    refund
  }];
}

function inferSelectionFromNoisyAmount(joined, stake) {
  if (!stake) return "";
  const afterStake = joined.match(new RegExp(`${stake}\\s*([一二三四五六七八九])(?:\\s|$)`));
  const map = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };
  return afterStake?.[1] ? map[afterStake[1]] : "";
}

function parseTicketRows(lines, common) {
  const entries = [];
  let currentDate = common.raceDate;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const date = parseJapaneseDate(line);
    if (date) currentDate = date;

    const row = parseTicketLine(line);
    if (!row) continue;

    const lookahead = lines.slice(index + 1, index + 5);
    const lookaheadCompact = compactText(lookahead.join(" "));
    const betType = firstMatch(lookaheadCompact, [new RegExp(`(${BET_TYPES.join("|")})`)]);
    const ticketType = firstMatch(lookaheadCompact, [new RegExp(`(${TICKET_TYPES.join("|")})`)]);
    const payout = parsePayout(lookahead.join(" "), lookaheadCompact);
    const refund = parseRefund(lookahead.join(" "));

    entries.push({
      ...common,
      raceDate: currentDate || common.raceDate,
      track: row.track,
      raceNumber: `${row.raceNumber}R`,
      betType,
      selection: row.selection || inferSelectionFromNoisyAmount(line, row.stake),
      ticketType,
      stake: row.stake,
      payout,
      refund
    });
  }

  return entries;
}

function parseTicketLine(line) {
  const compact = compactText(line);
  const rowPattern = new RegExp(`(${TRACK_PATTERN})(\\d{1,2})R(.+)$`, "i");
  const match = compact.match(rowPattern);
  if (!match) return null;

  const [, track, raceNumber, rawRest] = match;
  let rest = rawRest.replace(new RegExp(`^${raceNumber}R`), "");
  let selection = "";
  let stakeText = "";

  if (/[円囚口]$/.test(rest)) {
    const withoutUnit = rest.replace(/[円囚口]$/, "");
    for (let length = 3; length <= Math.min(6, withoutUnit.length - 1); length += 1) {
      const maybeStake = withoutUnit.slice(-length);
      const maybeSelection = withoutUnit.slice(0, -length);
      const amount = Number(maybeStake);
      if (Number.isInteger(amount) && amount >= 100 && amount % 100 === 0 && maybeSelection) {
        selection = maybeSelection;
        stakeText = maybeStake;
        break;
      }
    }
  }

  const kanjiAfterAmountMatch = rest.match(/^(\d{2,})([一二三四五六七八九])$/);
  if (!stakeText && kanjiAfterAmountMatch) {
    const map = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };
    stakeText = kanjiAfterAmountMatch[1];
    selection = map[kanjiAfterAmountMatch[2]];
  }

  if (!stakeText) return null;

  return {
    track,
    raceNumber,
    selection,
    stake: Number(stakeText)
  };
}

function parsePayout(joined, compact) {
  const hitMatch = compact.match(/的中(\d{2,})円/);
  if (hitMatch) return Number(hitMatch[1]);

  const hitIndex = joined.search(/的\s*中|的中/);
  if (hitIndex >= 0) {
    const value = joined.slice(hitIndex).match(/(\d{2,})\s*(?:円|四|囚|口)/);
    return parseYen(value?.[0]);
  }
  return 0;
}

function parseRefund(joined) {
  const refundIndex = joined.search(/返還/);
  if (refundIndex < 0) return 0;
  return parseYen(joined.slice(refundIndex).match(/(\d{2,})\s*(?:円|四|囚|口)/)?.[0]);
}

function parseStake(joined, payout) {
  const trackRaceStake = joined.match(/(門別|盛岡|水沢|浦和|船橋|大井|川崎|金沢|笠松|名古屋|園田|姫路|高知|佐賀|帯広)\s*\d{1,2}\s*R\s+(\d{2,})\s*(?:円|四|囚|口)?/i);
  if (trackRaceStake?.[2]) return Number(trackRaceStake[2]);

  const explicitYen = [...joined.matchAll(/(\d{2,})\s*円/g)].map((match) => Number(match[1]));
  const stakeCandidate = explicitYen.find((value) => value !== payout);
  if (stakeCandidate) return stakeCandidate;

  const amountArea = joined.match(/投票\s*金額\s*(.+?)(?:的\s*中|的中|※|$)/);
  const amountMatch = amountArea?.[1]?.match(/(\d{2,})\s*(?:円|四|囚|口)?/);
  return amountMatch ? Number(amountMatch[1]) : 0;
}

function findSelection(lines, betType, stake) {
  const numericLines = lines.filter((line) => /^\d{1,2}(?:[-,]\d{1,2})*$/.test(line) && Number(line) !== stake);
  if (numericLines.length) return numericLines[0];

  const stakeText = stake ? `${stake}円` : "";
  const joined = lines.join(" ").replace(/\s+/g, "");
  if (betType && stakeText) {
    const pattern = new RegExp(`${betType}\\s*(?:${escapeRegExp("通常")})?\\s*([0-9,-]+)\\s*${stake}`);
    const match = joined.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyParsedEntry(entry) {
  fields.service.value = entry.service || "SPAT4";
  fields.receiptNumber.value = entry.receiptNumber || "";
  fields.acceptedAt.value = entry.acceptedAt || "";
  fields.raceDate.value = entry.raceDate || "";
  fields.track.value = entry.track || "";
  fields.raceNumber.value = entry.raceNumber || "";
  fields.betType.value = entry.betType || "";
  fields.selection.value = entry.selection || "";
  fields.ticketType.value = entry.ticketType || "";
  fields.stake.value = entry.stake || 0;
  fields.payout.value = entry.payout || 0;
  fields.refund.value = entry.refund || 0;
  fields.memo.value = entry.memo || "";
  fields.sourceName.value = entry.sourceName || "";
  fields.sourceIndex.value = entry.sourceIndex || "";
  fields.sourceImageName.value = entry.sourceImageName || "";
  fields.sourceImageType.value = entry.sourceImageType || "";
  fields.sourceRawText.value = entry.rawText || "";
  updateComputed();
}

function toRecord(entry) {
  const record = {
    service: entry.service || "SPAT4",
    receiptNumber: entry.receiptNumber || "",
    acceptedAt: entry.acceptedAt || "",
    raceDate: entry.raceDate || "",
    track: entry.track || "",
    raceNumber: entry.raceNumber || "",
    betType: entry.betType || "",
    selection: entry.selection || "",
    ticketType: entry.ticketType || "",
    stake: Number(entry.stake || 0),
    payout: Number(entry.payout || 0),
    refund: Number(entry.refund || 0),
    memo: entry.memo || "",
    sourceName: entry.sourceName || "",
    sourceIndex: Number(entry.sourceIndex || 0),
    sourceImageName: entry.sourceImageName || entry.sourceName || "",
    sourceImageType: entry.sourceImageType || "",
    rawText: entry.rawText || ""
  };

  return {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    dedupeKey: dedupeKey(record)
  };
}

function parseTextToCandidates(rawText) {
  const blocks = splitOcrBlocks(rawText);
  return blocks.flatMap((block, index) =>
    parseSpat4Entries(block.text).map((entry, entryIndex) => ({
      ...entry,
      sourceName: block.name || `${index + 1}枚目`,
      sourceIndex: entryIndex + 1,
      rawText: block.text
    }))
  );
}

function splitOcrBlocks(rawText) {
  const lines = rawText.split("\n");
  const blocks = [];
  let current = { name: "", lines: [] };

  for (const line of lines) {
    const header = line.match(/^---\s*(.+?)\s*---$/);
    if (header) {
      if (current.lines.some((item) => item.trim())) blocks.push(current);
      current = { name: header[1].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }

  if (current.lines.some((item) => item.trim())) blocks.push(current);
  if (!blocks.length && rawText.trim()) return [{ name: "", text: rawText }];
  return blocks.map((block) => ({ name: block.name, text: block.lines.join("\n") }));
}

function getFormEntry() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    service: fields.service.value,
    receiptNumber: fields.receiptNumber.value.trim(),
    acceptedAt: fields.acceptedAt.value,
    raceDate: fields.raceDate.value,
    track: fields.track.value.trim(),
    raceNumber: fields.raceNumber.value.trim(),
    betType: fields.betType.value.trim(),
    selection: fields.selection.value.trim(),
    ticketType: fields.ticketType.value.trim(),
    stake: Number(fields.stake.value || 0),
    payout: Number(fields.payout.value || 0),
    refund: Number(fields.refund.value || 0),
    memo: fields.memo.value.trim(),
    sourceName: fields.sourceName.value,
    sourceIndex: Number(fields.sourceIndex.value || 0),
    sourceImageName: fields.sourceImageName.value,
    sourceImageType: fields.sourceImageType.value,
    rawText: fields.sourceRawText.value
  };
}

function dedupeKey(entry) {
  return [
    entry.service || "SPAT4",
    entry.receiptNumber || "",
    entry.raceDate || "",
    entry.track || "",
    entry.raceNumber || "",
    entry.betType || "",
    entry.selection || "",
    entry.ticketType || "",
    Number(entry.stake || 0),
    Number(entry.payout || 0),
    Number(entry.refund || 0),
    entry.sourceName || "",
    Number(entry.sourceIndex || 0)
  ].join("|");
}

function hasDuplicate(entry) {
  const key = entry.dedupeKey || dedupeKey(entry);
  return state.records.some((record) => (record.dedupeKey || dedupeKey(record)) === key);
}

function addRecords(entries) {
  let added = 0;
  let skipped = 0;
  for (const entry of entries) {
    const record = entry.id ? { ...entry, dedupeKey: entry.dedupeKey || dedupeKey(entry) } : toRecord(entry);
    if (hasDuplicate(record)) {
      skipped += 1;
      continue;
    }
    state.records.push(record);
    added += 1;
  }
  saveRecords();
  renderHistory();
  updateImportStatus(added, skipped);
  return { added, skipped };
}

function updateImportStatus(added, skipped) {
  const parts = [];
  if (added) parts.push(`${added}件保存`);
  if (skipped) parts.push(`${skipped}件重複スキップ`);
  if (parts.length) $("ocr-status").textContent = parts.join(" / ");
}

function profitOf(entry) {
  return Number(entry.payout || 0) + Number(entry.refund || 0) - Number(entry.stake || 0);
}

function roiOf(entry) {
  const stake = Number(entry.stake || 0);
  if (!stake) return 0;
  return ((Number(entry.payout || 0) + Number(entry.refund || 0)) / stake) * 100;
}

function updateComputed() {
  const entry = getFormEntry();
  $("profit").textContent = moneyFormat.format(profitOf(entry));
  $("profit").className = profitOf(entry) >= 0 ? "positive" : "negative";
  $("roi").textContent = `${Math.round(roiOf(entry) * 10) / 10}%`;
}

function renderHistory() {
  const body = $("history-body");
  body.textContent = "";

  if (!state.records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "保存済み履歴はありません。";
    row.append(cell);
    body.append(row);
    updateTotals();
    renderPeriodSummary();
    return;
  }

  for (const record of [...state.records].sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)))) {
    const row = document.createElement("tr");
    const profit = profitOf(record);
    row.innerHTML = `
      <td>${escapeHtml(record.raceDate || record.acceptedAt || "")}</td>
      <td>${escapeHtml([record.track, record.raceNumber].filter(Boolean).join(" "))}</td>
      <td>
        ${escapeHtml([record.betType, record.selection, record.ticketType].filter(Boolean).join(" / "))}
        ${record.sourceName ? `<div class="row-sub">${escapeHtml(record.sourceName)}${record.sourceIndex ? ` #${record.sourceIndex}` : ""}</div>` : ""}
      </td>
      <td class="money">${moneyFormat.format(record.stake || 0)}</td>
      <td class="money">${moneyFormat.format((record.payout || 0) + (record.refund || 0))}</td>
      <td class="money ${profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(profit)}</td>
      <td><button class="secondary delete-row" type="button" data-id="${record.id}">削除</button></td>
    `;
    body.append(row);
  }

  updateTotals();
  renderPeriodSummary();
}

function renderPeriodSummary() {
  const body = $("period-body");
  body.textContent = "";

  if (!state.records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "集計できる履歴はありません。";
    row.append(cell);
    body.append(row);
    return;
  }

  const groups = new Map();
  for (const record of state.records) {
    const key = periodKey(record, state.periodMode);
    if (!key) continue;
    const current = groups.get(key) || { key, count: 0, stake: 0, returnAmount: 0 };
    current.count += 1;
    current.stake += Number(record.stake || 0);
    current.returnAmount += Number(record.payout || 0) + Number(record.refund || 0);
    groups.set(key, current);
  }

  const rows = [...groups.values()].sort((a, b) => String(b.key).localeCompare(String(a.key)));
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "日付のある履歴がありません。";
    row.append(cell);
    body.append(row);
    return;
  }

  for (const item of rows) {
    const profit = item.returnAmount - item.stake;
    const roi = item.stake ? (item.returnAmount / item.stake) * 100 : 0;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatPeriodLabel(item.key, state.periodMode))}</td>
      <td class="money">${item.count}</td>
      <td class="money">${moneyFormat.format(item.stake)}</td>
      <td class="money">${moneyFormat.format(item.returnAmount)}</td>
      <td class="money ${profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(profit)}</td>
      <td class="money">${Math.round(roi * 10) / 10}%</td>
    `;
    body.append(row);
  }
}

function periodKey(record, mode) {
  const date = record.raceDate || String(record.acceptedAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  if (mode === "year") return date.slice(0, 4);
  if (mode === "month") return date.slice(0, 7);
  return date;
}

function formatPeriodLabel(key, mode) {
  if (mode === "year") return `${key}年`;
  if (mode === "month") {
    const [year, month] = key.split("-");
    return `${year}年${Number(month)}月`;
  }
  const [year, month, day] = key.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function renderCandidates() {
  const area = $("candidate-area");
  const body = $("candidate-body");
  body.textContent = "";
  area.hidden = state.candidates.length === 0;
  $("save-candidates").disabled = state.candidates.length === 0;

  state.candidates.forEach((candidate, index) => {
    const profit = profitOf(candidate);
    const sourceLabel = candidate.sourceIndex ? `${candidate.sourceName} #${candidate.sourceIndex}` : candidate.sourceName;
    const duplicate = hasDuplicate(candidate);
    const thumbnail = candidate.sourceUrl
      ? `<img class="candidate-thumb" src="${escapeHtml(candidate.sourceUrl)}" alt="${escapeHtml(sourceLabel || "読み取り画像")}">`
      : `<div class="candidate-thumb placeholder-thumb">画像なし</div>`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="candidate-source">
          ${thumbnail}
          <span>${escapeHtml(sourceLabel || `${index + 1}枚目`)}</span>
        </div>
      </td>
      <td>${escapeHtml(candidate.raceDate || candidate.acceptedAt || "")}</td>
      <td>${escapeHtml([candidate.track, candidate.raceNumber].filter(Boolean).join(" "))}</td>
      <td>${escapeHtml([candidate.betType, candidate.selection, candidate.ticketType].filter(Boolean).join(" / "))}</td>
      <td class="money">${moneyFormat.format(candidate.stake || 0)}</td>
      <td class="money">${moneyFormat.format((candidate.payout || 0) + (candidate.refund || 0))}</td>
      <td class="money ${profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(profit)}</td>
      <td>
        ${duplicate ? '<span class="status-pill">重複</span>' : ""}
        <button class="secondary delete-row" type="button" data-load-candidate="${index}">フォームへ</button>
        <button class="secondary delete-row" type="button" data-save-candidate="${index}" ${duplicate ? "disabled" : ""}>保存</button>
        <button class="secondary delete-row" type="button" data-remove-candidate="${index}">除外</button>
      </td>
    `;
    body.append(row);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateTotals() {
  const totalStake = state.records.reduce((sum, record) => sum + Number(record.stake || 0), 0);
  const totalReturn = state.records.reduce((sum, record) => sum + Number(record.payout || 0) + Number(record.refund || 0), 0);
  const profit = totalReturn - totalStake;
  const roi = totalStake ? (totalReturn / totalStake) * 100 : 0;

  $("total-stake").textContent = moneyFormat.format(totalStake);
  $("total-return").textContent = moneyFormat.format(totalReturn);
  $("total-profit").textContent = moneyFormat.format(profit);
  $("total-profit").className = profit >= 0 ? "positive" : "negative";
  $("total-roi").textContent = `${Math.round(roi * 10) / 10}%`;
}

async function runOcr() {
  if (!state.imageFiles.length) return;
  const ocrEngine = globalThis.Tesseract;
  if (!ocrEngine?.createWorker) {
    $("ocr-status").textContent = "OCRライブラリを読み込めませんでした。通信状態を確認して再読み込みしてください。";
    return;
  }

  $("ocr-status").textContent = "OCR準備中";
  $("ocr-progress").textContent = "";
  $("run-ocr").disabled = true;
  state.candidates = [];
  renderCandidates();

  const worker = await ocrEngine.createWorker("jpn+eng", 1, {
    logger: (message) => {
      if (message.status) $("ocr-status").textContent = message.status;
      if (typeof message.progress === "number") {
        $("ocr-progress").textContent = `${Math.round(message.progress * 100)}%`;
      }
    }
  });

  try {
    const rawTexts = [];
    for (const [index, file] of state.imageFiles.entries()) {
      $("ocr-status").textContent = `OCR中 ${index + 1}/${state.imageFiles.length}`;
      const result = await worker.recognize(file);
      const text = normalizeText(result.data.text);
      rawTexts.push(`--- ${file.name || `${index + 1}枚目`} ---\n${text}`);
      const entries = parseSpat4Entries(text).map((entry, entryIndex) => ({
        ...entry,
        sourceName: file.name || `${index + 1}枚目`,
        sourceUrl: state.imageUrls[index],
        sourceIndex: entryIndex + 1,
        sourceImageName: file.name || `${index + 1}枚目`,
        sourceImageType: file.type,
        rawText: text
      }));
      state.candidates.push(...entries);
    }
    $("ocr-text").value = rawTexts.join("\n\n");
    $("ocr-status").textContent = "OCR完了";
    $("ocr-progress").textContent = "";
    $("parse-text").disabled = false;
    renderCandidates();
    if (state.candidates[0]) applyParsedEntry(state.candidates[0]);
  } catch (error) {
    $("ocr-status").textContent = "OCRに失敗しました。手入力または再試行してください。";
    $("ocr-progress").textContent = "";
    console.error(error);
  } finally {
    await worker.terminate();
    $("run-ocr").disabled = false;
  }
}

function resetImage() {
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageFiles = [];
  state.imageUrls = [];
  state.candidates = [];
  $("image-input").value = "";
  $("image-preview").removeAttribute("src");
  $("image-preview").style.display = "none";
  $("ocr-text").value = "";
  $("ocr-status").textContent = "画像未選択";
  $("ocr-progress").textContent = "";
  $("run-ocr").disabled = true;
  $("parse-text").disabled = true;
  $("save-candidates").disabled = true;
  $("clear-image").disabled = true;
  renderCandidates();
}

function resetForm() {
  $("entry-form").reset();
  fields.service.value = "SPAT4";
  updateComputed();
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records: state.records }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `keiba-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportArchive() {
  const zipLib = globalThis.JSZip;
  if (!zipLib) {
    $("ocr-status").textContent = "ZIP出力ライブラリを読み込めませんでした。";
    return;
  }

  const zip = new zipLib();
  zip.file("records.json", JSON.stringify({ exportedAt: new Date().toISOString(), records: state.records }, null, 2));
  const imageFolder = zip.folder("images");
  const ocrFolder = zip.folder("ocr");

  for (const [name, image] of Object.entries(state.sourceImages)) {
    if (!image?.dataUrl) continue;
    const base64 = image.dataUrl.split(",")[1];
    imageFolder.file(name, base64, { base64: true });
  }

  for (const record of state.records) {
    if (!record.rawText) continue;
    const name = `${sanitizeFileName(record.sourceName || record.id)}-${record.sourceIndex || 1}.txt`;
    ocrFolder.file(name, record.rawText);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `keiba-archive-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

$("image-input").addEventListener("change", (event) => {
  void handleImageSelection(event);
});

async function handleImageSelection(event) {
  const files = [...(event.target.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  if (files.length !== event.target.files.length) {
    $("ocr-status").textContent = "画像ファイルを選択してください。";
    return;
  }

  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageFiles = files;
  state.imageUrls = files.map((file) => URL.createObjectURL(file));
  for (const file of files) {
    state.sourceImages[file.name] = {
      name: file.name,
      type: file.type,
      size: file.size,
      savedAt: new Date().toISOString(),
      dataUrl: await fileToDataUrl(file)
    };
  }
  saveImages();
  state.candidates = [];
  $("image-preview").src = state.imageUrls[0];
  $("image-preview").style.display = "block";
  $("ocr-status").textContent = `${files.length}枚選択済み`;
  $("ocr-progress").textContent = "";
  $("run-ocr").disabled = false;
  $("parse-text").disabled = false;
  $("clear-image").disabled = false;
  renderCandidates();
}

$("run-ocr").addEventListener("click", runOcr);
$("clear-image").addEventListener("click", resetImage);
$("parse-text").addEventListener("click", () => {
  state.candidates = parseTextToCandidates($("ocr-text").value);
  renderCandidates();
  if (state.candidates[0]) applyParsedEntry(state.candidates[0]);
});
$("ocr-text").addEventListener("input", () => {
  $("parse-text").disabled = !$("ocr-text").value.trim();
});
$("reset-form").addEventListener("click", resetForm);
$("export-json").addEventListener("click", exportJson);
$("export-archive").addEventListener("click", exportArchive);
$("period-day").addEventListener("click", () => setPeriodMode("day"));
$("period-month").addEventListener("click", () => setPeriodMode("month"));
$("period-year").addEventListener("click", () => setPeriodMode("year"));
$("save-candidates").addEventListener("click", () => {
  addRecords(state.candidates);
  state.candidates = [];
  renderCandidates();
});

$("entry-form").addEventListener("input", updateComputed);
$("entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = getFormEntry();
  if (!entry.raceDate && !entry.acceptedAt) {
    fields.raceDate.focus();
    return;
  }
  if (!entry.stake) {
    fields.stake.focus();
    return;
  }
  const result = addRecords([entry]);
  if (result.added) resetForm();
});

$("history-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  state.records = state.records.filter((record) => record.id !== button.dataset.id);
  saveRecords();
  renderHistory();
});

$("candidate-body").addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-candidate]");
  const saveButton = event.target.closest("[data-save-candidate]");
  const removeButton = event.target.closest("[data-remove-candidate]");

  if (loadButton) {
    const candidate = state.candidates[Number(loadButton.dataset.loadCandidate)];
    if (candidate) applyParsedEntry(candidate);
    return;
  }

  if (saveButton) {
    const index = Number(saveButton.dataset.saveCandidate);
    const candidate = state.candidates[index];
    if (!candidate) return;
    const result = addRecords([candidate]);
    if (result.added) state.candidates.splice(index, 1);
    renderCandidates();
    return;
  }

  if (removeButton) {
    const index = Number(removeButton.dataset.removeCandidate);
    state.candidates.splice(index, 1);
    renderCandidates();
  }
});

function setPeriodMode(mode) {
  state.periodMode = mode;
  for (const button of document.querySelectorAll("[data-period]")) {
    button.classList.toggle("active", button.dataset.period === mode);
  }
  renderPeriodSummary();
}

renderHistory();
renderCandidates();
updateComputed();

globalThis.keibaMemoParser = { parseSpat4Text, parseSpat4Entries, parseTextToCandidates };
