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

const GOOGLE_DRIVE_CLIENT_ID = "449273134542-vii1h2mtrrk29n0sp97s7tfh3m1uuhfe.apps.googleusercontent.com";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_FOLDER_NAME = "KeibaMemo";
const GOOGLE_DRIVE_FILE_NAME = "records.json";
const DEBUG_OCR_AMOUNTS = false;

const state = {
  imageFiles: [],
  imageUrls: [],
  sourceImages: loadImages(),
  candidates: [],
  records: loadRecords(),
  periodMode: "day",
  drive: {
    accessToken: "",
    tokenExpiresAt: 0,
    folderId: "",
    fileId: "",
    tokenClient: null,
    initialized: false,
    initAttempts: 0,
    pendingTokenRequest: null
  }
};

const moneyFormat = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

const TRACK_NAMES = ["門別", "盛岡", "水沢", "浦和", "船橋", "大井", "川崎", "金沢", "笠松", "名古屋", "園田", "姫路", "高知", "佐賀", "帯広"];
const IPAT_TRACK_NAMES = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"];
const BET_TYPES = ["三連単", "三連複", "3連単", "3連複", "ワイド", "枠複", "馬複", "枠単", "馬単", "単勝", "複勝"];
const TICKET_TYPES = ["フォーメーション", "ボックス", "流し", "通常"];
const TRACK_PATTERN = TRACK_NAMES.join("|");
const IPAT_TRACK_PATTERN = IPAT_TRACK_NAMES.join("|");

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

function setDriveStatus(message) {
  const status = document.getElementById("drive-status");
  if (status) {
    status.textContent = message;
  }
}

function setDriveUiState() {
  const loginButton = document.getElementById("google-login");
  const saveButton = document.getElementById("drive-save");
  const loadButton = document.getElementById("drive-load");

  if (loginButton) {
    loginButton.textContent = state.drive.accessToken ? "Google再ログイン" : "Googleログイン";
  }
  if (saveButton) saveButton.disabled = !state.drive.accessToken;
  if (loadButton) loadButton.disabled = !state.drive.accessToken;
}

function saveDriveAuthState() {
  return false;
}

function loadDriveAuthState() {
  return null;
}

function clearDriveAuthState() {
  state.drive.accessToken = "";
  state.drive.tokenExpiresAt = 0;
}

function hasValidDriveToken() {
  if (!state.drive.accessToken) return false;
  if (!state.drive.tokenExpiresAt) return true;
  return state.drive.tokenExpiresAt > Date.now() + 60_000;
}

function restoreDriveAuthState() {
  return false;
}

function normalizeImportedRecord(entry) {
  const normalized = {
    ...entry,
    stake: Number(entry.stake || 0),
    payout: Number(entry.payout || 0),
    refund: Number(entry.refund || 0),
    sourceIndex: Number(entry.sourceIndex || 0),
    createdAt: entry.createdAt || new Date().toISOString(),
    id: entry.id || crypto.randomUUID(),
    dedupeKey: entry.dedupeKey || dedupeKey(entry)
  };

  return normalized;
}

function mergeRecords(entries, { statusTarget = "ocr-status" } = {}) {
  let added = 0;
  let skipped = 0;

  for (const entry of entries) {
    const record = normalizeImportedRecord(entry);
    if (hasDuplicate(record)) {
      skipped += 1;
      continue;
    }
    state.records.push(record);
    added += 1;
  }

  saveRecords();
  renderHistory();

  if (statusTarget === "drive-status") {
    const parts = [];
    if (added) parts.push(`${added}件追加`);
    if (skipped) parts.push(`${skipped}件重複スキップ`);
    setDriveStatus(parts.length ? `Drive同期: ${parts.join(" / ")}` : "Drive同期: 変更なし");
  } else {
    updateImportStatus(added, skipped);
  }

  return { added, skipped };
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
  const match = String(value).replace(/,/g, "").match(/(\d+)\s*(?:円|四|囚|口)/);
  return match ? Number(match[1]) : 0;
}

function debugAmountExtraction(field, value, source, extra = {}) {
  if (DEBUG_OCR_AMOUNTS && typeof console?.debug === "function") {
    console.debug(`[keibaMemo] ${field}`, {
      value,
      source,
      ...extra
    });
  }
}

function hasDateLikeText(text) {
  return /\b\d{4}\s*年\b/.test(text) || /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(text) || /\b\d{1,2}\s*月\s*\d{1,2}\s*日\b/.test(text);
}

function isExcludedAmountLine(text) {
  return /受付\s*番号|受付番号/.test(text) || hasDateLikeText(text);
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

function todayDateString() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value) {
  const text = normalizeText(String(value || "")).trim();
  const match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function requestIpatRaceDate() {
  const input = window.prompt("IPAT/JRAの対象日を入力してください (YYYY-MM-DD)", todayDateString());
  if (input === null) return "";
  const date = normalizeDateInput(input);
  if (!date) {
    window.alert("日付を読み取れませんでした。候補のフォームで日付を入力してから保存してください。");
    return "";
  }
  return date;
}

function normalizeAmountDigits(value) {
  return String(value || "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[OoＯｏ〇○]/g, "0")
    .replace(/[,\s]/g, "");
}

function parseIpatAmount(value) {
  const normalized = normalizeAmountDigits(value);
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : 0;
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
  const stake = parseStake(lines, joined, payout);
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

function parseIpatRaceLine(line) {
  const compact = compactText(line);
  const racePattern = new RegExp(`(${IPAT_TRACK_PATTERN})(\\d{1,2})R(.*)$`, "i");
  const match = compact.match(racePattern);
  if (!match) return null;

  const raceName = (match[3] || "")
    .replace(/購入.*$/g, "")
    .replace(/払戻.*$/g, "")
    .replace(/[。．・\-ー―_]+$/g, "")
    .replace(/([ぁ-んァ-ヶ一-龠])[a-z]$/g, "$1")
    .trim();

  return {
    track: match[1],
    raceNumber: `${match[2]}R`,
    raceName
  };
}

function parseIpatAmounts(text) {
  const compact = compactText(text);
  const stakeMatch = compact.match(/購入[^0-9０-９OoＯｏ〇○]*([0-9０-９OoＯｏ〇○,]{1,8})/);
  if (!stakeMatch) return null;

  const afterStake = compact.slice((stakeMatch.index || 0) + stakeMatch[0].length);
  const payoutMatch = afterStake.match(/(?:払戻|払|戻|#?E|H#?HE)?[^0-9０-９OoＯｏ〇○]*([0-9０-９OoＯｏ〇○,]{1,8})(?:円|m|M)?/);

  return {
    stake: parseIpatAmount(stakeMatch[1]),
    payout: payoutMatch ? parseIpatAmount(payoutMatch[1]) : 0
  };
}

function parseIpatEntries(rawText, raceDate = "") {
  const text = normalizeText(rawText);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const race = parseIpatRaceLine(lines[index]);
    if (!race) continue;

    const amountLines = [lines[index]];
    for (let offset = 1; offset <= 5 && index + offset < lines.length; offset += 1) {
      if (parseIpatRaceLine(lines[index + offset])) break;
      amountLines.push(lines[index + offset]);
    }
    const amountWindow = amountLines.join(" ");
    const amounts = parseIpatAmounts(amountWindow);
    if (!amounts?.stake) continue;

    entries.push({
      service: "IPAT",
      receiptNumber: "",
      acceptedAt: "",
      raceDate,
      track: race.track,
      raceNumber: race.raceNumber,
      betType: "",
      selection: "",
      ticketType: "",
      stake: amounts.stake,
      payout: amounts.payout,
      refund: 0,
      memo: race.raceName
    });
  }

  return entries;
}

function parseEntries(rawText, { ipatRaceDate = "" } = {}) {
  const ipatEntries = parseIpatEntries(rawText, ipatRaceDate);
  return ipatEntries.length ? ipatEntries : parseSpat4Entries(rawText);
}

function applyIpatRaceDate(entries, getDate) {
  if (!entries.some((entry) => entry.service === "IPAT" && !entry.raceDate)) return "";

  const raceDate = getDate();
  if (!raceDate) return "";

  entries.forEach((entry) => {
    if (entry.service === "IPAT" && !entry.raceDate) {
      entry.raceDate = raceDate;
    }
  });
  return raceDate;
}

function inferSelectionFromNoisyAmount(joined, stake) {
  if (!stake) return "";
  const afterStake = joined.match(new RegExp(`${stake}\\s*([一二三四五六七八九])(?:\\s|$)`));
  const map = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };
  return afterStake?.[1] ? map[afterStake[1]] : "";
}

function parseNumericAmountRow(line) {
  const normalizedLine = normalizeText(line).trim();
  const match = normalizedLine.match(/^(\d{1,3})\s+(\d{3,})(?:\s*[A-Za-z]+)?$/);
  if (!match) return null;

  const selection = match[1];
  const stake = Number(match[2]);
  if (!Number.isFinite(stake) || stake < 100 || stake % 100 !== 0) return null;
  if (/^(20\d{2}|19\d{2})$/.test(selection)) return null;

  return {
    track: "",
    raceNumber: "",
    selection,
    stake
  };
}

function parseTicketRows(lines, common) {
  const entries = [];
  let currentDate = common.raceDate;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const date = parseJapaneseDate(line);
    if (date) currentDate = date;

    const numericRow = parseNumericAmountRow(line);
    const row = numericRow || parseTicketLine(line);
    if (!row) continue;

    const lookahead = lines.slice(index + 1, index + 5);
    const lookaheadCompact = compactText(lookahead.join(" "));
    const betType = firstMatch(lookaheadCompact, [new RegExp(`(${BET_TYPES.join("|")})`)]);
    const ticketType = firstMatch(lookaheadCompact, [new RegExp(`(${TICKET_TYPES.join("|")})`)]);
    const payout = parsePayout(lookahead.join(" "), lookaheadCompact);
    const refund = parseRefund(lookahead.join(" "));

    if (numericRow) {
      debugAmountExtraction("selection/stake", { selection: numericRow.selection, stake: numericRow.stake }, line, {
        parser: "parseNumericAmountRow",
        betType,
        ticketType
      });
    } else {
      debugAmountExtraction("stake", row.stake, line, {
        parser: "parseTicketLine",
        track: row.track,
        raceNumber: row.raceNumber,
        betType,
        ticketType
      });
    }

    entries.push({
      ...common,
      raceDate: currentDate || common.raceDate,
      track: row.track,
      raceNumber: row.raceNumber ? `${row.raceNumber}R` : "",
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
  const hitMatch = compact.match(/的中\s*(\d{2,})\s*(?:円|四|囚|口)/);
  if (hitMatch) {
    const value = Number(hitMatch[1]);
    debugAmountExtraction("payout", value, hitMatch[0], { parser: "parsePayout" });
    return value;
  }

  const hitIndex = joined.search(/的\s*中|的中/);
  if (hitIndex >= 0) {
    const matched = joined.slice(hitIndex).match(/(\d{2,})\s*(?:円|四|囚|口)/);
    if (matched) {
      const value = parseYen(matched[0]);
      debugAmountExtraction("payout", value, matched[0], { parser: "parsePayout.joined" });
      return value;
    }
  }
  return 0;
}

function parseRefund(joined) {
  const refundIndex = joined.search(/返還/);
  if (refundIndex < 0) return 0;
  const matched = joined.slice(refundIndex).match(/(\d{2,})\s*(?:円|四|囚|口)/);
  if (matched) {
    const value = parseYen(matched[0]);
    debugAmountExtraction("refund", value, matched[0], { parser: "parseRefund" });
    return value;
  }
  return 0;
}

function parseStake(lines, joined, payout) {
  const lineCandidates = [];
  for (const line of lines) {
    if (isExcludedAmountLine(line)) continue;
    if (/的中|返還/.test(line)) continue;

    const matches = [...line.matchAll(/(\d{2,})\s*(?:円|四|囚|口)(?!\d)/g)].map((match) => ({
      value: Number(match[1]),
      source: match[0],
      index: match.index
    }));

    for (const match of matches) {
      lineCandidates.push({
        value: match.value,
        source: match.source,
        line,
        priority: line.includes("投票金額") ? 3 : 1,
        index: match.index
      });
    }
  }

  if (lineCandidates.length) {
    const best = lineCandidates
      .filter((candidate) => candidate.value !== payout)
      .sort((a, b) => b.priority - a.priority || a.index - b.index)[0];

    if (best) {
      debugAmountExtraction("stake", best.value, best.source, {
        parser: "parseStake.line",
        line: best.line,
        priority: best.priority,
        payout
      });
      return best.value;
    }
  }

  const fallbackMatches = [...joined.matchAll(/(\d{2,})\s*(?:円|四|囚|口)(?!\d)/g)].map((match) => ({
    value: Number(match[1]),
    source: match[0],
    index: match.index
  }));

  const fallbackCandidate = fallbackMatches
    .filter((match) => match.value !== payout)
    .find((match) => !hasDateLikeText(joined.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20)));

  if (fallbackCandidate) {
    debugAmountExtraction("stake", fallbackCandidate.value, fallbackCandidate.source, {
      parser: "parseStake.joinedFallback",
      payout
    });
    return fallbackCandidate.value;
  }

  return 0;
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
  let ipatRaceDate = "";
  let ipatDatePrompted = false;
  return blocks.flatMap((block, index) => {
    const entries = parseEntries(block.text, { ipatRaceDate });
    if (!ipatRaceDate && !ipatDatePrompted && entries.some((entry) => entry.service === "IPAT" && !entry.raceDate)) {
      ipatDatePrompted = true;
      ipatRaceDate = applyIpatRaceDate(entries, requestIpatRaceDate);
    }
    return entries.map((entry, entryIndex) => ({
      ...entry,
      sourceName: block.name || `${index + 1}枚目`,
      sourceIndex: entryIndex + 1,
      rawText: block.text
    }));
  });
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
  const summary = mergeRecords(entries.map((entry) => entry.id ? entry : toRecord(entry)));
  return summary;
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

function updateOcrBatchProgress(done, total, { running = false } = {}) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeDone = Math.min(Math.max(0, Number(done || 0)), safeTotal);
  const percent = safeTotal ? Math.round((safeDone / safeTotal) * 100) : 0;
  const fill = $("ocr-batch-fill");
  const horse = $("ocr-batch-horse");
  const count = $("ocr-batch-count");
  const percentLabel = $("ocr-batch-percent");
  const progress = document.querySelector(".ocr-race-progress");

  if (fill) fill.style.width = `${percent}%`;
  if (horse) horse.style.left = `${percent}%`;
  if (count) count.textContent = `${safeDone}/${safeTotal}枚`;
  if (percentLabel) percentLabel.textContent = `${percent}%`;
  if (progress) progress.classList.toggle("is-running", running && safeTotal > 0 && safeDone < safeTotal);
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
      <td data-label="日付">${escapeHtml(record.raceDate || record.acceptedAt || "")}</td>
      <td data-label="レース">${escapeHtml([record.track, record.raceNumber].filter(Boolean).join(" "))}</td>
      <td data-label="かけ方">
        ${escapeHtml([record.betType, record.selection, record.ticketType].filter(Boolean).join(" / "))}
        ${record.sourceName ? `<div class="row-sub">${escapeHtml(record.sourceName)}${record.sourceIndex ? ` #${record.sourceIndex}` : ""}</div>` : ""}
      </td>
      <td data-label="購入" class="money">${moneyFormat.format(record.stake || 0)}</td>
      <td data-label="払戻" class="money">${moneyFormat.format((record.payout || 0) + (record.refund || 0))}</td>
      <td data-label="収支" class="money ${profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(profit)}</td>
      <td data-label="操作"><button class="secondary delete-row" type="button" data-id="${record.id}">削除</button></td>
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
    renderPeriodChart([]);
    return;
  }

  const rows = getPeriodRows();
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "日付のある履歴がありません。";
    row.append(cell);
    body.append(row);
    renderPeriodChart([]);
    return;
  }

  for (const item of [...rows].sort((a, b) => String(b.key).localeCompare(String(a.key)))) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="期間">${escapeHtml(formatPeriodLabel(item.key, state.periodMode))}</td>
      <td data-label="件数" class="money">${item.count}</td>
      <td data-label="購入" class="money">${moneyFormat.format(item.stake)}</td>
      <td data-label="払戻+返還" class="money">${moneyFormat.format(item.returnAmount)}</td>
      <td data-label="収支" class="money ${item.profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(item.profit)}</td>
      <td data-label="回収率" class="money">${Math.round(item.roi * 10) / 10}%</td>
    `;
    body.append(row);
  }

  renderPeriodChart(rows);
}

function getPeriodRows() {
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

  return [...groups.values()]
    .map((item) => {
      const profit = item.returnAmount - item.stake;
      return {
        ...item,
        profit,
        roi: item.stake ? (item.returnAmount / item.stake) * 100 : 0
      };
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function renderPeriodChart(rows) {
  const chart = $("period-chart");
  const empty = $("period-chart-empty");
  if (!chart || !empty) return;

  chart.textContent = "";
  empty.hidden = rows.length > 0;
  chart.hidden = rows.length === 0;

  const latest = rows[rows.length - 1];
  const best = rows.reduce((current, item) => (!current || item.profit > current.profit ? item : current), null);
  const worst = rows.reduce((current, item) => (!current || item.profit < current.profit ? item : current), null);
  $("chart-latest").textContent = `最新 ${moneyFormat.format(latest?.profit || 0)}`;
  $("chart-best").textContent = `最高 ${moneyFormat.format(best?.profit || 0)}`;
  $("chart-worst").textContent = `最低 ${moneyFormat.format(worst?.profit || 0)}`;

  if (!rows.length) return;

  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 28, bottom: 46, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = rows.map((item) => item.profit);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = Math.max(1, maxValue - minValue);
  const topValue = maxValue + span * 0.16;
  const bottomValue = minValue - span * 0.16;
  const valueRange = Math.max(1, topValue - bottomValue);

  const xFor = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => padding.top + ((topValue - value) / valueRange) * plotHeight;
  const points = rows.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.profit) }));
  const zeroY = yFor(0);
  const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${zeroY.toFixed(2)} L ${points[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
  const gridValues = [topValue, (topValue + bottomValue) / 2, bottomValue];

  const svg = (tag, attributes = {}, text = "") => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    if (text) element.textContent = text;
    return element;
  };

  const defs = svg("defs");
  const gradient = svg("linearGradient", { id: "profitLineGradient", x1: "0", x2: "1", y1: "0", y2: "0" });
  gradient.append(svg("stop", { offset: "0%", "stop-color": "#1ac4ca" }));
  gradient.append(svg("stop", { offset: "100%", "stop-color": "#0f6b8d" }));
  const areaGradient = svg("linearGradient", { id: "profitAreaGradient", x1: "0", x2: "0", y1: "0", y2: "1" });
  areaGradient.append(svg("stop", { offset: "0%", "stop-color": "#1ac4ca", "stop-opacity": "0.24" }));
  areaGradient.append(svg("stop", { offset: "100%", "stop-color": "#1ac4ca", "stop-opacity": "0.02" }));
  defs.append(gradient, areaGradient);
  chart.append(defs);

  for (const value of gridValues) {
    const y = yFor(value);
    chart.append(svg("line", { class: "chart-grid", x1: padding.left, y1: y, x2: width - padding.right, y2: y }));
    chart.append(svg("text", { class: "chart-axis-label", x: padding.left - 12, y: y + 4, "text-anchor": "end" }, compactMoney(value)));
  }

  chart.append(svg("line", { class: "chart-zero-line", x1: padding.left, y1: zeroY, x2: width - padding.right, y2: zeroY }));
  chart.append(svg("path", { class: "chart-area", d: areaPath }));
  chart.append(svg("path", { class: "chart-line", d: linePath }));

  const labelIndexes = rows.length <= 4 ? rows.map((_, index) => index) : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  for (const index of labelIndexes) {
    const point = points[index];
    chart.append(svg("text", { class: "chart-x-label", x: point.x, y: height - 18, "text-anchor": "middle" }, shortPeriodLabel(point.key, state.periodMode)));
  }

  for (const point of points) {
    const group = svg("g", { class: point.profit >= 0 ? "chart-point positive-point" : "chart-point negative-point" });
    group.append(svg("circle", { cx: point.x, cy: point.y, r: 5 }));
    group.append(svg("title", {}, `${formatPeriodLabel(point.key, state.periodMode)} ${moneyFormat.format(point.profit)}`));
    chart.append(group);
  }
}

function compactMoney(value) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10000) return `${Math.round(rounded / 1000) / 10}万`;
  return `${rounded.toLocaleString("ja-JP")}円`;
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

function shortPeriodLabel(key, mode) {
  if (mode === "year") return key;
  if (mode === "month") {
    const [, month] = key.split("-");
    return `${Number(month)}月`;
  }
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
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
      <td data-label="画像">
        <div class="candidate-source">
          ${thumbnail}
          <span>${escapeHtml(sourceLabel || `${index + 1}枚目`)}</span>
        </div>
      </td>
      <td data-label="日付">${escapeHtml(candidate.raceDate || candidate.acceptedAt || "")}</td>
      <td data-label="レース">${escapeHtml([candidate.track, candidate.raceNumber].filter(Boolean).join(" "))}</td>
      <td data-label="かけ方">${escapeHtml([candidate.betType, candidate.selection, candidate.ticketType].filter(Boolean).join(" / "))}</td>
      <td data-label="購入" class="money">${moneyFormat.format(candidate.stake || 0)}</td>
      <td data-label="払戻" class="money">${moneyFormat.format((candidate.payout || 0) + (candidate.refund || 0))}</td>
      <td data-label="収支" class="money ${profit >= 0 ? "positive" : "negative"}">${moneyFormat.format(profit)}</td>
      <td data-label="操作">
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
  $("ocr-progress").textContent = `0/${state.imageFiles.length}枚`;
  updateOcrBatchProgress(0, state.imageFiles.length, { running: true });
  $("run-ocr").disabled = true;
  state.candidates = [];
  renderCandidates();

  const worker = await ocrEngine.createWorker("jpn+eng", 1, {
    logger: (message) => {
      if (message.status) $("ocr-status").textContent = message.status;
    }
  });

  let completedImages = 0;
  let ipatRaceDate = "";
  let ipatDatePrompted = false;
  try {
    const rawTexts = [];
    for (const [index, file] of state.imageFiles.entries()) {
      $("ocr-status").textContent = `OCR中 ${index + 1}/${state.imageFiles.length}`;
      $("ocr-progress").textContent = `${index}/${state.imageFiles.length}枚完了`;
      updateOcrBatchProgress(index, state.imageFiles.length, { running: true });
      const result = await worker.recognize(file);
      const text = normalizeText(result.data.text);
      rawTexts.push(`--- ${file.name || `${index + 1}枚目`} ---\n${text}`);
      const parsedEntries = parseEntries(text, { ipatRaceDate });
      if (!ipatRaceDate && !ipatDatePrompted && parsedEntries.some((entry) => entry.service === "IPAT" && !entry.raceDate)) {
        ipatDatePrompted = true;
        ipatRaceDate = applyIpatRaceDate(parsedEntries, requestIpatRaceDate);
      }
      const entries = parsedEntries.map((entry, entryIndex) => ({
        ...entry,
        sourceName: file.name || `${index + 1}枚目`,
        sourceUrl: state.imageUrls[index],
        sourceIndex: entryIndex + 1,
        sourceImageName: file.name || `${index + 1}枚目`,
        sourceImageType: file.type,
        rawText: text
      }));
      state.candidates.push(...entries);
      const completed = index + 1;
      completedImages = completed;
      $("ocr-progress").textContent = `${completed}/${state.imageFiles.length}枚完了`;
      updateOcrBatchProgress(completed, state.imageFiles.length, { running: completed < state.imageFiles.length });
    }
    $("ocr-text").value = rawTexts.join("\n\n");
    $("ocr-status").textContent = "OCR完了";
    $("ocr-progress").textContent = `${state.imageFiles.length}/${state.imageFiles.length}枚完了`;
    updateOcrBatchProgress(state.imageFiles.length, state.imageFiles.length, { running: false });
    $("parse-text").disabled = false;
    renderCandidates();
    if (state.candidates.some((candidate) => candidate.service === "IPAT" && !candidate.raceDate)) {
      $("ocr-status").textContent = "IPAT/JRA候補は対象日をフォームで入力してから保存してください。";
    }
    if (state.candidates[0]) applyParsedEntry(state.candidates[0]);
  } catch (error) {
    $("ocr-status").textContent = "OCRに失敗しました。手入力または再試行してください。";
    $("ocr-progress").textContent = `${completedImages}/${state.imageFiles.length}枚完了で停止`;
    updateOcrBatchProgress(completedImages, state.imageFiles.length, { running: false });
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
  updateOcrBatchProgress(0, 0, { running: false });
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

async function driveApiFetch(url, options = {}) {
  if (!state.drive.accessToken) {
    throw new Error("Googleログインが必要です。");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.drive.accessToken}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`.trim());
  }

  return response;
}

async function listDriveFiles(query) {
  const response = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=1000`, {
    method: "GET"
  });
  return response.json();
}

async function ensureDriveFolder() {
  const found = await listDriveFiles(`name='${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const folder = found.files?.[0];

  if (folder) {
    state.drive.folderId = folder.id;
    return folder;
  }

  const created = await driveApiFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"]
    })
  });

  const folderMetadata = await created.json();
  state.drive.folderId = folderMetadata.id;
  return folderMetadata;
}

async function findDriveFile(folderId) {
  const found = await listDriveFiles(`'${folderId}' in parents and name='${GOOGLE_DRIVE_FILE_NAME}' and trashed=false`);
  return found.files?.[0] || null;
}

function normalizeDrivePayload(payload) {
  if (Array.isArray(payload)) {
    return { exportedAt: new Date().toISOString(), records: payload };
  }

  if (payload && Array.isArray(payload.records)) {
    return {
      exportedAt: payload.exportedAt || new Date().toISOString(),
      records: payload.records
    };
  }

  throw new Error("records.jsonの形式が不正です。");
}

async function ensureDriveAccessToken({ prompt = "none" } = {}) {
  if (!state.drive.tokenClient) {
    throw new Error("Google認証ライブラリの準備がまだ完了していません。ページを更新してください。");
  }

  if (prompt === "none" && hasValidDriveToken()) {
    return state.drive.accessToken;
  }

  if (prompt === "none" && !state.drive.accessToken) {
    throw new Error("Google Driveの再認証が必要です。Google再ログインを押してください。");
  }

  if (prompt === "none" && state.drive.tokenExpiresAt > Date.now()) {
    return state.drive.accessToken;
  }

  return new Promise((resolve, reject) => {
    state.drive.pendingTokenRequest = { resolve, reject };
    try {
      state.drive.tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      state.drive.pendingTokenRequest = null;
      reject(error);
    }
  });
}

async function saveToDrive() {
  try {
    setDriveStatus("Google Driveへ保存中...");
    await ensureDriveAccessToken({ prompt: "none" });
    const folder = await ensureDriveFolder();
    const existing = await findDriveFile(folder.id);
    const payload = {
      exportedAt: new Date().toISOString(),
      records: state.records
    };
    const content = JSON.stringify(payload, null, 2);

    if (existing?.id) {
      const response = await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: content
      });
      await response.text();
      state.drive.fileId = existing.id;
    } else {
      const boundary = `----keiba-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({
        name: GOOGLE_DRIVE_FILE_NAME,
        mimeType: "application/json",
        parents: [folder.id]
      });
      const multipartBody = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n`,
        `--${boundary}--\r\n`
      ].join("");

      const response = await driveApiFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      const created = await response.json();
      state.drive.fileId = created.id;
    }

    setDriveStatus(`Driveへ保存しました (${new Date().toLocaleString("ja-JP")})`);
  } catch (error) {
    setDriveStatus(`Drive保存に失敗しました: ${error.message}`);
  }
}

async function loadFromDrive() {
  try {
    setDriveStatus("Google Driveから読込中...");
    await ensureDriveAccessToken({ prompt: "none" });
    const folder = await ensureDriveFolder();
    const existing = await findDriveFile(folder.id);

    if (!existing) {
      setDriveStatus("Driveに records.json が見つかりませんでした。");
      return;
    }

    const response = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`, {
      method: "GET"
    });
    const text = await response.text();
    let payload;

    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error("records.json はJSONとして読み込めませんでした。");
    }

    const { records } = normalizeDrivePayload(payload);
    const result = mergeRecords(records, { statusTarget: "drive-status" });
    state.drive.fileId = existing.id;
    setDriveStatus(`Driveから読込ました: ${result.added}件追加、${result.skipped}件重複スキップ`);
  } catch (error) {
    setDriveStatus(`Drive読込に失敗しました: ${error.message}`);
  }
}

function initializeGoogleDrive() {
  if (state.drive.initialized) return;

  restoreDriveAuthState();

  if (!globalThis.google?.accounts?.oauth2) {
    state.drive.initAttempts += 1;
    if (state.drive.initAttempts > 60) {
      setDriveStatus("Google認証ライブラリの読み込みに失敗しました。ネットワークを確認して再読み込みしてください。");
      return;
    }
    setDriveStatus("Google認証ライブラリを読み込み中です...");
    window.setTimeout(initializeGoogleDrive, 250);
    return;
  }

  state.drive.tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_DRIVE_CLIENT_ID,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (response) => {
      const pending = state.drive.pendingTokenRequest;
      state.drive.pendingTokenRequest = null;

      if (response.error) {
        clearDriveAuthState();
        setDriveStatus(`Googleログインに失敗しました: ${response.error}`);
        setDriveUiState();
        if (pending) {
          pending.reject(new Error(response.error));
        }
        return;
      }

      state.drive.accessToken = response.access_token;
      state.drive.tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
      saveDriveAuthState();
      state.drive.initialized = true;
      setDriveUiState();
      setDriveStatus("Google Driveに接続しました。保存と読込ができます。");
      if (pending) {
        pending.resolve(response.access_token);
      }
    }
  });

  state.drive.initialized = true;
  setDriveUiState();
  if (hasValidDriveToken()) {
    setDriveStatus("保存済みのGoogle認証を復元しました。保存と読込ができます。");
  } else {
    setDriveStatus("Google Drive連携の準備完了です。Googleログインしてください。");
  }
}

async function handleGoogleLogin() {
  if (!state.drive.tokenClient) {
    setDriveStatus("Google認証ライブラリの準備がまだ完了していません。ページを更新してください。");
    return;
  }

  try {
    setDriveStatus("Googleログイン中...");
    await ensureDriveAccessToken({ prompt: "consent" });
  } catch (error) {
    setDriveStatus(`Googleログインに失敗しました: ${error.message}`);
  }
}

function formatFileSize(size) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const extension = name.split(".").pop() || "";
  const allowedExtensions = new Set(["png", "jpg", "jpeg", "heic", "heif", "webp"]);
  return type.startsWith("image/") || allowedExtensions.has(extension);
}

function describeFile(file) {
  const type = file.type || "unknown";
  return `${file.name} (${type || "unknown"}, ${formatFileSize(file.size)})`;
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
  const selectedFiles = Array.from(event.target.files || []);
  if (!selectedFiles.length) {
    $("ocr-status").textContent = "画像ファイルを選択してください。";
    $("run-ocr").disabled = true;
    $("clear-image").disabled = true;
    return;
  }

  const acceptedFiles = [];
  const rejectedFiles = [];
  for (const file of selectedFiles) {
    if (isImageFile(file)) acceptedFiles.push(file);
    else rejectedFiles.push(file);
  }

  const statusMessages = [];
  for (const file of acceptedFiles) {
    statusMessages.push(`選択済み: ${describeFile(file)}`);
  }
  for (const file of rejectedFiles) {
    statusMessages.push(`画像形式を認識できません: ${file.name} (${file.type || "unknown"})`);
  }

  if (acceptedFiles.length) {
    state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
    state.imageFiles = acceptedFiles;
    state.imageUrls = acceptedFiles.map((file) => URL.createObjectURL(file));

    try {
      for (const file of acceptedFiles) {
        try {
          state.sourceImages[file.name] = {
            name: file.name,
            type: file.type,
            size: file.size,
            savedAt: new Date().toISOString(),
            dataUrl: await fileToDataUrl(file)
          };
        } catch (error) {
          state.sourceImages[file.name] = {
            name: file.name,
            type: file.type,
            size: file.size,
            savedAt: new Date().toISOString()
          };
        }
      }
      saveImages();
      state.candidates = [];
      const previewUrl = state.imageUrls[0];
      if (previewUrl) {
        $("image-preview").src = previewUrl;
        $("image-preview").style.display = "block";
      } else {
        $("image-preview").removeAttribute("src");
        $("image-preview").style.display = "none";
      }
    } catch (error) {
      console.error("画像プレビューの準備に失敗しました", error);
      $("image-preview").removeAttribute("src");
      $("image-preview").style.display = "none";
    }

    $("ocr-status").textContent = `${statusMessages.join(" / ")} / ${acceptedFiles.length}枚選択済み`;
    $("ocr-progress").textContent = `0/${acceptedFiles.length}枚`;
    updateOcrBatchProgress(0, acceptedFiles.length, { running: false });
    $("run-ocr").disabled = false;
    $("parse-text").disabled = true;
    $("clear-image").disabled = false;
    renderCandidates();
    return;
  }

  state.imageFiles = [];
  state.imageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.imageUrls = [];
  state.candidates = [];
  $("image-preview").removeAttribute("src");
  $("image-preview").style.display = "none";
  $("ocr-status").textContent = statusMessages.join(" / ");
  $("ocr-progress").textContent = "";
  updateOcrBatchProgress(0, 0, { running: false });
  $("run-ocr").disabled = true;
  $("parse-text").disabled = true;
  $("clear-image").disabled = true;
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
$("google-login").addEventListener("click", () => { void handleGoogleLogin(); });
$("drive-save").addEventListener("click", () => { void saveToDrive(); });
$("drive-load").addEventListener("click", () => { void loadFromDrive(); });
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
  const record = state.records.find((item) => item.id === button.dataset.id);
  const label = record
    ? [record.raceDate, record.track, record.raceNumber, record.betType, record.selection].filter(Boolean).join(" ")
    : "この履歴";
  if (!window.confirm(`${label} を削除しますか？`)) return;
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

function initializeHeaderMotion() {
  const header = document.querySelector(".app-header");
  if (!header || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let targetX = 0;
  let targetY = 0;
  let targetRotate = 0;
  let currentX = 0;
  let currentY = 0;
  let currentRotate = 0;
  let frameRequested = false;

  const render = () => {
    frameRequested = false;
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;
    currentRotate += (targetRotate - currentRotate) * 0.12;
    header.style.setProperty("--hero-x", `${currentX.toFixed(2)}px`);
    header.style.setProperty("--hero-y", `${currentY.toFixed(2)}px`);
    header.style.setProperty("--hero-rotate", `${currentRotate.toFixed(3)}deg`);

    if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2 || Math.abs(targetRotate - currentRotate) > 0.02) {
      window.requestAnimationFrame(render);
      frameRequested = true;
    }
  };

  const schedule = () => {
    if (!frameRequested) {
      frameRequested = true;
      window.requestAnimationFrame(render);
    }
  };

  header.addEventListener("pointermove", (event) => {
    const rect = header.getBoundingClientRect();
    const xRatio = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const yRatio = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    targetX = Math.max(-1, Math.min(1, xRatio)) * 10;
    targetY = Math.max(-1, Math.min(1, yRatio)) * 6;
    targetRotate = Math.max(-1, Math.min(1, xRatio)) * 1.8;
    schedule();
  }, { passive: true });

  header.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    targetRotate = 0;
    schedule();
  });

  window.addEventListener("scroll", () => {
    const offset = Math.min(18, window.scrollY * 0.04);
    targetY = -offset;
    schedule();
  }, { passive: true });
}

renderHistory();
renderCandidates();
updateComputed();
updateOcrBatchProgress(0, 0, { running: false });
setDriveUiState();
setDriveStatus("Google Drive連携は未接続です。Googleログインしてください。");
window.addEventListener("load", initializeGoogleDrive);
window.addEventListener("load", initializeHeaderMotion);

globalThis.keibaMemoParser = {
  parseSpat4Text,
  parseSpat4Entries,
  parseIpatEntries,
  parseEntries,
  parseTextToCandidates,
  normalizeDateInput
};
