import type { SubtitleTrack } from "@storia/schema";

function formatSrtTime(seconds: number, decimalSep: "," | "." = ","): string {
  const s = Math.max(0, seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const safeMs = ms >= 1000 ? 999 : ms;
  return (
    `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:` +
    `${String(secs).padStart(2, "0")}${decimalSep}${String(safeMs).padStart(3, "0")}`
  );
}

/**
 * Generates a clean UTF-8 SRT subtitle file from a Storia Studio SubtitleTrack.
 */
export function generateSrt(track: SubtitleTrack): string {
  const sorted = [...track.cues].sort((a, b) => a.start - b.start);
  return (
    sorted
      .map((cue, idx) => {
        const text = track.style.uppercase ? cue.text.toUpperCase() : cue.text;
        return `${idx + 1}\n${formatSrtTime(cue.start, ",")} --> ${formatSrtTime(cue.end, ",")}\n${text.trim()}\n`;
      })
      .join("\n") + (sorted.length > 0 ? "\n" : "")
  );
}

/**
 * Generates a clean WebVTT subtitle file from a Storia Studio SubtitleTrack.
 */
export function generateVtt(track: SubtitleTrack): string {
  const sorted = [...track.cues].sort((a, b) => a.start - b.start);
  const body = sorted
    .map((cue) => {
      const text = track.style.uppercase ? cue.text.toUpperCase() : cue.text;
      return `${formatSrtTime(cue.start, ".")} --> ${formatSrtTime(cue.end, ".")}\n${text.trim()}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
}
