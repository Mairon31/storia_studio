import json
import os
import sys
import wave


def write_wav_float32(out_path: str, samples, sample_rate: int):
    import numpy as np

    arr = np.asarray(samples, dtype=np.float32)
    arr = np.clip(arr, -1.0, 1.0)
    pcm = (arr * 32767.0).astype(np.int16)
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm.tobytes())


def synth_kokoro(text: str, voice: str, speed: float, lang: str, model_dir: str, out_path: str):
    if sys.platform == "win32":
        espeak_dir = r"C:\Program Files\eSpeak NG"
        if os.path.isdir(espeak_dir) and espeak_dir.lower() not in os.environ.get("PATH", "").lower():
            os.environ["PATH"] = espeak_dir + os.pathsep + os.environ.get("PATH", "")

    try:
        from kokoro_onnx import Kokoro
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "El paquete Python 'kokoro-onnx' no está instalado. Instálalo con: pip install kokoro-onnx soundfile"
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(model_dir, "voices-v1.0.bin")
    if not (os.path.exists(model_path) and os.path.exists(voices_path)):
        print(
            json.dumps(
                {
                    "error": "Modelo Kokoro-82M ONNX no descargado aún. Pulsa 'Descargar modelo' en el panel TTS."
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    kokoro = Kokoro(model_path, voices_path)
    lang_map = {"es": "es", "en": "en-us", "en-us": "en-us", "en-gb": "en-gb", "fr": "fr-fr", "it": "it", "pt": "pt-br"}
    effective_lang = lang_map.get((lang or "es").lower(), "es")
    samples, sr = kokoro.create(text, voice=voice or "ef_dora", speed=float(speed or 1.0), lang=effective_lang)
    write_wav_float32(out_path, samples, sr)
    print(json.dumps({"ok": True, "sampleRate": int(sr), "outPath": out_path}))


def normalize_piper_config_file(model_onnx: str) -> str | None:
    """
    Some upstream HuggingFace Piper `.onnx.json` configs (e.g. `es_MX-ald-medium`)
    contain Python 3.11+ enum repr strings like `"PhonemeType.ESPEAK"` instead of `"espeak"`.
    Normalize them before calling `PiperVoice.load()` so `piper-tts >= 1.3` never throws ValueError.
    """
    cfg_path = f"{model_onnx}.json"
    if not os.path.exists(cfg_path):
        return None
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    if not isinstance(data, dict):
        return None

    raw_pt = data.get("phoneme_type")
    if isinstance(raw_pt, str) and raw_pt.lower().startswith("phonemetype."):
        normalized = raw_pt.split(".", 1)[1].strip().lower()
        if normalized in ("espeak", "text"):
            data["phoneme_type"] = normalized
            try:
                with open(cfg_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return cfg_path
            except Exception:
                import tempfile

                tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8", delete=False)
                json.dump(data, tmp, ensure_ascii=False, indent=2)
                tmp.close()
                return tmp.name
    return cfg_path


def synth_piper(text: str, model_onnx: str, speed: float, out_path: str):
    if not os.path.exists(model_onnx):
        print(
            json.dumps(
                {"error": f"Archivo de voz Piper no encontrado: {model_onnx}"},
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    try:
        from piper.voice import PiperVoice
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "El paquete Python 'piper-tts' no está instalado. Instálalo con: pip install piper-tts"
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    orig_cfg = f"{model_onnx}.json"
    resolved_cfg = normalize_piper_config_file(model_onnx)
    temp_cfg = resolved_cfg if resolved_cfg and resolved_cfg != orig_cfg else None
    try:
        voice = PiperVoice.load(model_onnx, config_path=resolved_cfg) if resolved_cfg else PiperVoice.load(model_onnx)
        length_scale = 1.0 / max(0.4, min(2.2, float(speed or 1.0)))
        with wave.open(out_path, "wb") as wf:
            if hasattr(voice, "synthesize_wav"):
                from piper.config import SynthesisConfig

                cfg = SynthesisConfig(length_scale=length_scale)
                voice.synthesize_wav(text, wf, syn_config=cfg)
            else:
                voice.synthesize(text, wf, length_scale=length_scale)
    finally:
        if temp_cfg and os.path.exists(temp_cfg):
            try:
                os.remove(temp_cfg)
            except Exception:
                pass
    print(json.dumps({"ok": True, "outPath": out_path}))


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing payload JSON path"}))
        sys.exit(2)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        req = json.load(f)

    engine = req.get("engine")
    if engine == "check":
        mods = {}
        for m in ("kokoro_onnx", "piper"):
            try:
                __import__(m)
                mods[m] = True
            except Exception:
                mods[m] = False
        print(json.dumps({"ok": True, "modules": mods}))
        return

    text = (req.get("text") or "").strip()
    out_path = req.get("outPath")
    if not text or not out_path:
        print(json.dumps({"error": "Missing text or outPath"}))
        sys.exit(2)

    if engine == "kokoro":
        synth_kokoro(
            text=text,
            voice=req.get("voice") or "ef_dora",
            speed=float(req.get("speed") or 1.0),
            lang=req.get("language") or "es",
            model_dir=req.get("modelDir") or "",
            out_path=out_path,
        )
    elif engine == "piper":
        synth_piper(
            text=text,
            model_onnx=req.get("modelPath") or "",
            speed=float(req.get("speed") or 1.0),
            out_path=out_path,
        )
    else:
        print(json.dumps({"error": f"Unknown local TTS engine: {engine}"}))
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(json.dumps({"error": f"Error en motor TTS local: {type(exc).__name__}: {exc}"}, ensure_ascii=False))
        sys.exit(1)
