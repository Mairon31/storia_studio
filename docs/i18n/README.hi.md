<div align="center">

<img src="../../apps/desktop/src-tauri/icons/icon.png" alt="Storia Studio" width="112" height="112" />

# Storia Studio

**लोकल-फर्स्ट (Local-first) 2D और रेट्रो वीडियो एडिटिंग व एनीमेशन स्टूडियो — 60 FPS WebGL2 इंजन, 23 फुल-पाइपलाइन एनीमेशन स्टाइल और MCP के ज़रिए लाइव AI नियंत्रण के साथ।**

<p>
  <a href="../../README.md">Español</a> ·
  <a href="./README.en.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ru.md">Русский</a> ·
  <strong>हिन्दी</strong> ·
  <a href="./README.pt.md">Português</a>
</p>

<p>
  <img src="../assets/badge-version.svg" alt="v0.2.1" />
  <img src="../assets/badge-platforms.svg" alt="Windows · macOS · Linux" />
  <img src="../assets/badge-engine.svg" alt="WebGL2 · Rust Tauri v2" />
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="../assets/badge-discord.svg" alt="Discord समुदाय" />
  </a>
</p>

<p>
  <a href="#डाउनलोड-और-त्वरित-शुरुआत">डाउनलोड</a> ·
  <a href="../README.md">दस्तावेज़ (Docs)</a> ·
  <a href="../releases-and-updates.md">Stable और Nightly चैनल</a> ·
  <a href="../../SECURITY.md">सुरक्षा</a> ·
  <a href="https://discord.gg/ahJM3hyFWr">Discord</a>
</p>

</div>

---

## Storia Studio क्या है?

**Storia Studio** कहानी कहने, शिक्षा, Shorts/Reels और 2D/रेट्रो एनीमेशन निर्माताओं के लिए बनाया गया एक नॉन-लीनियर वीडियो एडिटर (NLE) है। यह Windows, macOS और Linux पर **100% लोकल** चलता है, आपके प्रोजेक्ट और API कुंजियों को आपके कंप्यूटर पर सुरक्षित रखता है और **Model Context Protocol (MCP)** के माध्यम से AI एजेंट्स के साथ रीयल-टाइम सहयोग करने देता है।

## मुख्य विशेषताएँ

| क्षमता | विवरण |
|---|---|
| **60 FPS WebGL2 इंजन** | `9:16`, `16:9`, `1:1` और **4K** तक सटीक प्रीव्यू, मैग्नेटिक मल्टी-ट्रैक टाइमलाइन, Web Audio वेवफॉर्म, लाइव SVG कोड एडिटर और एटॉमिक Undo/Redo। |
| **23 फुल-पाइपलाइन एनीमेशन स्टाइल** | एक क्लिक में कैरेक्टर, बैकग्राउंड, स्प्राइट, शेप, सबटाइटल और GPU शेडर बदलें: **3D Clay & Toon**, **Kurzgesagt Vector**, **Anime Cel**, **Retro PSX 1998**, **Paper Cutout**, **Pixel 16-bit**, **Rubber Hose 1930s**, **Noir**, **Mythology** और Stickman A1–B8। |
| **आर्टिकुलेटेड 2D कैरेक्टर रिग्स** | लेग और आर्म IK, 24 रोल-आधारित आउटफिट, 26+ हेयरस्टाइल, पोज़, एक्सप्रेशन और मॉड्यूलर स्प्राइट सपोर्ट। |
| **सबटाइटल, Whisper और TTS वॉइस** | शब्द-दर-शब्द कराओके हाइलाइटिंग के साथ 36 CapCut/Reels प्रीसेट, ऑफ़लाइन **Whisper** ट्रांसक्रिप्शन, और ऑफ़लाइन/क्लाउड TTS (**SAPI**, **Piper ONNX**, **Kokoro-82M**, **ElevenLabs**, **OpenAI**)। |
| **1:1 FFmpeg एक्सपोर्ट** | GPU (`NVENC`) या CPU (`libx264`) पैरेलल रेंडरिंग, सब-फ़्रेम मोशन ब्लर और 2-पास **`-16 LUFS`** ऑडियो मास्टरिंग। |
| **निःशुल्क इन-बिल्ट लाइब्रेरीज़** | बिना API Key के लाखों CC0/CC-BY SVG, आइकन, म्यूज़िक और SFX (**Openverse**, **Iconify**, **Wikimedia Commons**, **Internet Archive**, **OpenMoji**) और ऑटोमैटिक `credits.txt`। |
| **लाइव AI (MCP) और Zero-Trust** | **OAuth 2.1 + PKCE** के साथ `stdio` और `/mcp`, सुरक्षित मोबाइल टनल (`ngrok` / `Cloudflare`), `AES-256-GCM` वॉल्ट और नेटिव **Rust (Tauri v2)** डेस्कटॉप ऐप। |

## डाउनलोड और त्वरित शुरुआत

### डेस्कटॉप ऐप (Windows · macOS · Linux)

इस रिपॉजिटरी के **Releases** टैब से अपने ऑपरेटिंग सिस्टम का इंस्टॉलर डाउनलोड करें:

- **Stable (`v*`):** रोज़मर्रा के काम के लिए स्थिर संस्करण (`.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb`, `.rpm`)।
- **Nightly (`nightly`):** `master` पर हर नए कमिट के साथ ऑटोमैटिक बिल्ड। आप **Settings › Updates** में **Stable** और **Nightly** के बीच स्विच कर सकते हैं और SHA-256 सत्यापन के साथ 1-क्लिक अपडेट व ऑटो-रीस्टार्ट पा सकते हैं।

पहली बार खोलने पर 6-चरणीय **Onboarding विज़ार्ड** फ़ोल्डर, फ्री लाइब्रेरीज़, वॉइस मॉडल और नेटवर्क सेटिंग्स तैयार करता है।

### सोर्स कोड से चलाएँ

```bash
pnpm install
pnpm build
pnpm dev
```

## दस्तावेज़ (Documentation)

पूरी तकनीकी गाइड [`docs/`](../README.md) फ़ोल्डर में उपलब्ध है:

- **[शुरुआत और इंस्टॉलेशन](../getting-started.md)** — आवश्यकताएँ, Onboarding, डेवलपमेंट कमांड्स और एनवायरनमेंट वेरिएबल्स।
- **[आर्किटेक्चर और क्रिएटिव इंजन](../architecture.md)** — मोनोरेपो संरचना, 23 एनीमेशन स्टाइल, रिग्स और FFmpeg पाइपलाइन।
- **[AI के लिए MCP और रिमोट एक्सेस](../mcp-and-remote.md)** — `stdio` / HTTP `/mcp`, OAuth 2.1, टनल और Zero-Trust सुरक्षा।
- **[रिलीज़, चैनल और ऑटो-अपडेट](../releases-and-updates.md)** — Stable/Nightly चैनल और Rust डेस्कटॉप बिल्ड।
- **[सुरक्षा नीति](../../SECURITY.md)** — एन्क्रिप्शन वॉल्ट और वल्नरेबिलिटी रिपोर्टिंग।

## समुदाय

नए फ़ीचर्स, Stable/Nightly अपडेट्स, सहायता और Storia Studio के आगामी इंटीग्रेशन्स की जानकारी के लिए हमारे आधिकारिक **Discord** समुदाय से जुड़ें:

<p>
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="../assets/badge-discord.svg" alt="Storia Studio Discord से जुड़ें" />
  </a>
</p>

## लाइसेंस

Copyright © 2026 Mairon Mayorga. सर्वाधिकार सुरक्षित।  
पूर्ण लाइसेंस शर्तों के लिए [LICENSE.md](../../LICENSE.md) देखें।
