import type { SubtitleCue, SubtitleWord } from "./subtitles.js";

/**
 * Remotion-ported SRT / WebVTT parsers and TikTok/Reels rhythmic caption pagination
 * (`@remotion/captions`), adapted cleanly to Storia Studio's `SubtitleCue` & `SubtitleWord` schema.
 */

export interface RemotionCaption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  pageBreakAfter?: boolean;
}

export interface TikTokCaptionToken {
  text: string;
  fromMs: number;
  toMs: number;
  pageBreakAfter?: boolean;
}

export interface TikTokCaptionPage {
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  tokens: TikTokCaptionToken[];
}

function parseFlexibleTimestampToMs(raw: string): number {
  const parts = raw.trim().split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid caption timestamp: "${raw}"`);
  }
  const hours = parts.length === 3 ? parts[0]! : "0";
  const minutes = parts.length === 3 ? parts[1]! : parts[0]!;
  const secPart = parts.length === 3 ? parts[2]! : parts[1]!;
  const [seconds, millisRaw] = secPart.trim().split(/[,.]/);
  if (!seconds || !millisRaw) {
    throw new Error(`Invalid caption timestamp: "${raw}"`);
  }
  const millis = millisRaw.padEnd(3, "0").slice(0, 3);
  return (
    parseInt(hours, 10) * 3_600_000 +
    parseInt(minutes, 10) * 60_000 +
    parseInt(seconds, 10) * 1_000 +
    parseInt(millis, 10)
  );
}

/**
 * Parses an SRT subtitle string into Remotion-style timed captions.
 */
export function parseSrtCaptions(input: string): RemotionCaption[] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const captions: RemotionCaption[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const nextLine = lines[i + 1] ?? "";
    if (/^\s*\d+\s*$/.test(line) && nextLine.includes("-->")) {
      const [startRaw, restRaw] = nextLine.split("-->");
      if (!startRaw || !restRaw) continue;
      const endToken = restRaw.trim().split(/\s+/)[0] ?? "";
      const startMs = parseFlexibleTimestampToMs(startRaw);
      const endMs = Math.max(startMs + 50, parseFlexibleTimestampToMs(endToken));
      captions.push({
        text: "",
        startMs,
        endMs,
        timestampMs: (startMs + endMs) / 2,
        confidence: 1,
      });
      i++;
    } else if (line.trim() === "") {
      if (captions.length > 0) {
        const last = captions[captions.length - 1]!;
        last.text = last.text.trim();
      }
    } else if (captions.length > 0) {
      const last = captions[captions.length - 1]!;
      last.text += `${line}\n`;
    }
  }

  return captions
    .map((c) => ({ ...c, text: c.text.replace(/<[^>]*>/g, "").trim() }))
    .filter((c) => c.text.length > 0);
}

/**
 * Parses a WebVTT subtitle string (handles WEBVTT header, NOTE/STYLE/REGION blocks, HTML tags & entities).
 */
export function parseVttCaptions(input: string): RemotionCaption[] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const captions: RemotionCaption[] = [];
  let i = 0;
  if (lines[0]?.trim().startsWith("WEBVTT")) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(line)) {
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "") i++;
      continue;
    }

    const arrowIdx = line.indexOf("-->");
    if (arrowIdx === -1) {
      i++;
      continue;
    }

    const startToken = line.slice(0, arrowIdx).trim();
    const endToken = line.slice(arrowIdx + 3).trim().split(/\s+/)[0] ?? "";
    const startMs = parseFlexibleTimestampToMs(startToken);
    const endMs = Math.max(startMs + 50, parseFlexibleTimestampToMs(endToken));

    i++;
    const textLines: string[] = [];
    while (i < lines.length && (lines[i] ?? "") !== "") {
      textLines.push(lines[i]!);
      i++;
    }

    const decoded = textLines
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => {
        const map: Record<string, string> = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        };
        return map[m] ?? m;
      })
      .trim();

    if (decoded.length > 0) {
      captions.push({
        text: decoded,
        startMs,
        endMs,
        timestampMs: (startMs + endMs) / 2,
        confidence: 1,
      });
    }
  }

  return captions;
}

/**
 * Expands phrase-level captions into proportional word-level tokens (preserving leading spaces like Remotion).
 */
export function expandCaptionsToWordTokens(captions: readonly RemotionCaption[]): RemotionCaption[] {
  const out: RemotionCaption[] = [];
  for (const cap of captions) {
    const words = cap.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (words.length === 0) continue;
    if (words.length === 1) {
      out.push({
        ...cap,
        text: ` ${words[0]!}`,
      });
      continue;
    }
    const totalChars = Math.max(1, words.reduce((acc, w) => acc + Math.max(1, w.length), 0));
    const spanMs = Math.max(80, cap.endMs - cap.startMs);
    let cursorMs = cap.startMs;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      const weight = Math.max(1, w.length) / totalChars;
      const wStart = Math.round(cursorMs);
      const wEnd = i === words.length - 1 ? cap.endMs : Math.max(wStart + 40, Math.round(cursorMs + spanMs * weight));
      cursorMs = wEnd;
      out.push({
        text: ` ${w}`,
        startMs: wStart,
        endMs: wEnd,
        timestampMs: (wStart + wEnd) / 2,
        confidence: cap.confidence,
        ...(i === words.length - 1 && cap.pageBreakAfter ? { pageBreakAfter: true } : {}),
      });
    }
  }
  return out;
}

/**
 * Remotion-ported `createTikTokStyleCaptions`: groups word-level captions into rhythmic pages
 * bounded by `combineTokensWithinMilliseconds`, `maxWordsPerPage`, and natural silence breaks.
 */
export function createTikTokStyleCaptions(input: {
  captions: readonly RemotionCaption[];
  combineTokensWithinMilliseconds: number;
  breakOnSilenceAfterMilliseconds?: number;
  maxWordsPerPage?: number;
}): { pages: TikTokCaptionPage[] } {
  const {
    captions,
    combineTokensWithinMilliseconds,
    breakOnSilenceAfterMilliseconds,
    maxWordsPerPage,
  } = input;

  const pages: TikTokCaptionPage[] = [];
  let currentTokens: TikTokCaptionToken[] = [];
  let currentFrom = 0;
  let currentTo = 0;

  const flush = () => {
    if (currentTokens.length === 0) return;
    const text = currentTokens.map((t) => t.text.trim()).filter(Boolean).join(" ");
    const endMs = Math.max(currentFrom + 100, currentTo);
    pages.push({
      text,
      startMs: currentFrom,
      endMs,
      durationMs: endMs - currentFrom,
      tokens: currentTokens,
    });
    currentTokens = [];
  };

  for (const item of captions) {
    const cleanWord = item.text.trim();
    if (!cleanWord) continue;

    const exceedsDuration =
      currentTokens.length > 0 && item.endMs - currentFrom > combineTokensWithinMilliseconds;
    const exceedsWordCount =
      maxWordsPerPage !== undefined && currentTokens.length >= maxWordsPerPage;
    const shouldBreakOnSilence =
      breakOnSilenceAfterMilliseconds !== undefined &&
      currentTokens.length > 0 &&
      item.startMs - currentTo >= breakOnSilenceAfterMilliseconds;

    if (exceedsDuration || exceedsWordCount || shouldBreakOnSilence) {
      flush();
    }

    if (currentTokens.length === 0) {
      currentFrom = item.startMs;
    }
    currentTo = Math.max(currentTo, item.endMs);
    currentTokens.push({
      text: cleanWord,
      fromMs: item.startMs,
      toMs: Math.max(item.startMs + 40, item.endMs),
      ...(item.pageBreakAfter ? { pageBreakAfter: true } : {}),
    });

    if (item.pageBreakAfter) {
      flush();
    }
  }

  flush();
  return { pages };
}

/**
 * Converts TikTok pages into Storia Studio `SubtitleCue[]` with exact word-level timings.
 */
export function tikTokPagesToSubtitleCues(
  pages: readonly TikTokCaptionPage[],
  idPrefix = "cue_tt",
): SubtitleCue[] {
  return pages
    .map((page, idx): SubtitleCue | null => {
      const start = Number((Math.max(0, page.startMs) / 1000).toFixed(3));
      const end = Number((Math.max(page.startMs + 80, page.endMs) / 1000).toFixed(3));
      const cueId = `${idPrefix}_${idx + 1}`;
      const words: SubtitleWord[] = page.tokens.map((tok, wi) => {
        const ws = Number((Math.max(0, tok.fromMs) / 1000).toFixed(3));
        const we = Number((Math.max(tok.fromMs + 30, tok.toMs) / 1000).toFixed(3));
        return {
          id: `${cueId}_w${wi + 1}`,
          text: tok.text.trim(),
          start: ws,
          end: Math.max(ws, we),
          emphasis: "normal",
        };
      });
      const text = page.text.trim();
      if (!text || end <= start) return null;
      return {
        id: cueId,
        start,
        end,
        text,
        words,
      };
    })
    .filter((c): c is SubtitleCue => c !== null);
}

/**
 * Auto-detects SRT or WebVTT, parses timed captions, expands word timings, and optionally applies
 * TikTok/Reels rhythmic pagination to produce ready-to-save Storia `SubtitleCue[]`.
 */
export function importSubtitlesTextToCues(
  rawText: string,
  options: {
    format?: "auto" | "srt" | "vtt";
    tiktokMode?: boolean;
    combineTokensWithinMs?: number;
    breakOnSilenceAfterMs?: number;
    maxWordsPerPage?: number;
  } = {},
): { format: "srt" | "vtt"; cues: SubtitleCue[] } {
  const trimmed = rawText.replace(/^\uFEFF/, "").trim();
  const detected: "srt" | "vtt" =
    options.format && options.format !== "auto"
      ? options.format
      : trimmed.startsWith("WEBVTT")
        ? "vtt"
        : "srt";

  const rawCaptions = detected === "vtt" ? parseVttCaptions(trimmed) : parseSrtCaptions(trimmed);
  if (rawCaptions.length === 0) {
    return { format: detected, cues: [] };
  }

  const wordTokens = expandCaptionsToWordTokens(rawCaptions);

  if (options.tiktokMode !== false) {
    const { pages } = createTikTokStyleCaptions({
      captions: wordTokens,
      combineTokensWithinMilliseconds: options.combineTokensWithinMs ?? 1400,
      breakOnSilenceAfterMilliseconds: options.breakOnSilenceAfterMs ?? 450,
      maxWordsPerPage: options.maxWordsPerPage ?? 4,
    });
    return { format: detected, cues: tikTokPagesToSubtitleCues(pages, `cue_${detected}`) };
  }

  // Keep original cue boundaries while preserving proportional word timings
  const cues: SubtitleCue[] = rawCaptions.map((cap, idx) => {
    const cueId = `cue_${detected}_${idx + 1}`;
    const start = Number((Math.max(0, cap.startMs) / 1000).toFixed(3));
    const end = Number((Math.max(cap.startMs + 80, cap.endMs) / 1000).toFixed(3));
    const expanded = expandCaptionsToWordTokens([cap]);
    const words: SubtitleWord[] = expanded.map((w, wi) => {
      const ws = Number((Math.max(0, w.startMs) / 1000).toFixed(3));
      const we = Number((Math.max(w.startMs + 30, w.endMs) / 1000).toFixed(3));
      return {
        id: `${cueId}_w${wi + 1}`,
        text: w.text.trim(),
        start: ws,
        end: Math.max(ws, we),
        emphasis: "normal",
      };
    });
    return {
      id: cueId,
      start,
      end,
      text: cap.text.replace(/\s+/g, " ").trim(),
      words,
    };
  });

  return { format: detected, cues };
}

/**
 * Re-paginates existing Storia `SubtitleCue[]` (e.g. from Whisper or TTS) into rhythmic
 * TikTok / Reels pages using Remotion's timing + silence-break algorithm while preserving word emphasis.
 */
export function rechunkSubtitleCuesToTikTok(
  cues: readonly SubtitleCue[],
  options: {
    combineTokensWithinMs?: number;
    breakOnSilenceAfterMs?: number;
    maxWordsPerPage?: number;
  } = {},
): SubtitleCue[] {
  const flatWords: (RemotionCaption & { emphasis?: SubtitleWord["emphasis"]; styleOverride?: SubtitleWord["styleOverride"] })[] = [];

  for (const cue of [...cues].sort((a, b) => a.start - b.start)) {
    if (cue.words.length > 0) {
      for (const w of cue.words) {
        flatWords.push({
          text: ` ${w.text.trim()}`,
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(Math.max(w.start + 0.04, w.end) * 1000),
          timestampMs: Math.round(((w.start + w.end) / 2) * 1000),
          confidence: 1,
          emphasis: w.emphasis,
          styleOverride: w.styleOverride,
        });
      }
    } else {
      const expanded = expandCaptionsToWordTokens([
        {
          text: cue.text,
          startMs: Math.round(cue.start * 1000),
          endMs: Math.round(cue.end * 1000),
          timestampMs: Math.round(((cue.start + cue.end) / 2) * 1000),
          confidence: 1,
        },
      ]);
      for (const w of expanded) flatWords.push(w);
    }
  }

  if (flatWords.length === 0) return [];

  const { pages } = createTikTokStyleCaptions({
    captions: flatWords,
    combineTokensWithinMilliseconds: options.combineTokensWithinMs ?? 1350,
    breakOnSilenceAfterMilliseconds: options.breakOnSilenceAfterMs ?? 420,
    maxWordsPerPage: options.maxWordsPerPage ?? 3,
  });

  let wordCursor = 0;
  return pages.map((page, idx) => {
    const cueId = `cue_tiktok_${idx + 1}`;
    const start = Number((Math.max(0, page.startMs) / 1000).toFixed(3));
    const end = Number((Math.max(page.startMs + 80, page.endMs) / 1000).toFixed(3));
    const words: SubtitleWord[] = page.tokens.map((tok, wi) => {
      const orig = flatWords[wordCursor++];
      const ws = Number((Math.max(0, tok.fromMs) / 1000).toFixed(3));
      const we = Number((Math.max(tok.fromMs + 30, tok.toMs) / 1000).toFixed(3));
      return {
        id: `${cueId}_w${wi + 1}`,
        text: tok.text.trim(),
        start: ws,
        end: Math.max(ws, we),
        emphasis: orig?.emphasis ?? "normal",
        ...(orig?.styleOverride ? { styleOverride: orig.styleOverride } : {}),
      };
    });
    return {
      id: cueId,
      start,
      end,
      text: page.text,
      words,
    };
  });
}
