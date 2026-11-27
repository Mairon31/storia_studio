import json
import os
import shutil
import subprocess
import sys
import wave


def decode_audio_to_16k_float32(audio_path: str):
    """
    Decode any audio file directly to a 1-D 16 kHz mono float32 numpy array.
    Passing a numpy array to `WhisperModel.transcribe()` completely bypasses
    `faster_whisper.audio.decode_audio()` and avoids PyAV >= 14/19 breaking
    changes (`av.open(..., metadata_errors="ignore")` TypeError).
    """
    import numpy as np

    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-nostdin",
            "-threads",
            "0",
            "-i",
            audio_path,
            "-f",
            "f32le",
            "-ac",
            "1",
            "-acodec",
            "pcm_f32le",
            "-ar",
            "16000",
            "-v",
            "error",
            "pipe:1",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode == 0 and len(proc.stdout) >= 4:
            return np.frombuffer(proc.stdout, dtype=np.float32).copy()

    # Pure-Python WAV fallback (handles 8/16/32-bit PCM mono/stereo + linear resample to 16 kHz)
    try:
        with wave.open(audio_path, "rb") as wf:
            channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            raw = wf.readframes(wf.getnframes())

        if sampwidth == 2:
            arr = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        elif sampwidth == 4:
            arr = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
        elif sampwidth == 1:
            arr = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        else:
            raise ValueError(f"Unsupported WAV sample width: {sampwidth}")

        if channels > 1:
            arr = arr.reshape(-1, channels).mean(axis=1)

        if framerate != 16000 and len(arr) > 1:
            target_len = max(1, int(round(len(arr) * (16000.0 / float(framerate)))))
            x_old = np.linspace(0.0, 1.0, len(arr), dtype=np.float64)
            x_new = np.linspace(0.0, 1.0, target_len, dtype=np.float64)
            arr = np.interp(x_new, x_old, arr).astype(np.float32)
        return arr.astype(np.float32, copy=False)
    except Exception:
        # Last resort: let faster_whisper decode directly
        return audio_path


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}))
        sys.exit(2)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] not in ("", "auto") else None
    model_name = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "small"

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        print(json.dumps({"error": f"faster_whisper not installed: {exc}"}))
        sys.exit(1)

    # Prefer local cached model on CPU int8 (fast, deterministic, zero GPU VRAM contention)
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8", local_files_only=True)
    except Exception:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")

    audio_input = decode_audio_to_16k_float32(audio_path)

    segments, info = model.transcribe(
        audio_input,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
    )

    cues = []
    cue_idx = 0
    for seg in segments:
        raw_words = list(seg.words or [])
        if not raw_words:
            text = (seg.text or "").strip()
            if not text:
                continue
            cue_idx += 1
            cue_id = f"cue_asr_{cue_idx:03d}"
            cues.append(
                {
                    "id": cue_id,
                    "start": round(max(0.0, float(seg.start)), 3),
                    "end": round(max(float(seg.start) + 0.1, float(seg.end)), 3),
                    "text": text,
                    "words": [],
                }
            )
            continue

        # Chunk long segments into clean ~6-word subtitle cues for crisp Reels/Shorts pacing
        chunk = []
        for w in raw_words:
            tok = (w.word or "").strip()
            if not tok:
                continue
            chunk.append(
                {
                    "text": tok,
                    "start": round(max(0.0, float(w.start)), 3),
                    "end": round(max(float(w.start) + 0.03, float(w.end)), 3),
                }
            )
            ends_sentence = tok.endswith((".", "!", "?", "…", ":", ";"))
            if len(chunk) >= 7 or (len(chunk) >= 3 and ends_sentence):
                cue_idx += 1
                cue_id = f"cue_asr_{cue_idx:03d}"
                cues.append(
                    {
                        "id": cue_id,
                        "start": chunk[0]["start"],
                        "end": max(chunk[0]["start"] + 0.1, chunk[-1]["end"]),
                        "text": " ".join(x["text"] for x in chunk),
                        "words": [
                            {
                                "id": f"{cue_id}_w_{i + 1:02d}",
                                "text": x["text"],
                                "start": x["start"],
                                "end": x["end"],
                                "emphasis": "normal",
                            }
                            for i, x in enumerate(chunk)
                        ],
                    }
                )
                chunk = []

        if chunk:
            cue_idx += 1
            cue_id = f"cue_asr_{cue_idx:03d}"
            cues.append(
                {
                    "id": cue_id,
                    "start": chunk[0]["start"],
                    "end": max(chunk[0]["start"] + 0.1, chunk[-1]["end"]),
                    "text": " ".join(x["text"] for x in chunk),
                    "words": [
                        {
                            "id": f"{cue_id}_w_{i + 1:02d}",
                            "text": x["text"],
                            "start": x["start"],
                            "end": x["end"],
                            "emphasis": "normal",
                        }
                        for i, x in enumerate(chunk)
                    ],
                }
            )

    print(
        json.dumps(
            {
                "language": getattr(info, "language", language or "es"),
                "durationSec": round(float(getattr(info, "duration", 0.0)), 3),
                "cues": cues,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(json.dumps({"error": f"Error en transcripción Whisper: {type(exc).__name__}: {exc}"}, ensure_ascii=False))
        sys.exit(1)
