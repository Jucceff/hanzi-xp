import { useSyncExternalStore } from 'react';

// Audio: interfaz común para TTS (Web Speech, zh-CN) y, más adelante, audios nativos.

export interface AudioProvider {
  readonly name: string;
  available(): boolean;
  speak(text: string, opts?: { rate?: number }): Promise<void>;
}

class WebSpeechProvider implements AudioProvider {
  readonly name = 'Web Speech';
  private voice: SpeechSynthesisVoice | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.voice =
        voices.find((v) => v.lang === 'zh-CN') ??
        voices.find((v) => v.lang.replace('_', '-').startsWith('zh-CN')) ??
        voices.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) ??
        null;
      this.listeners.forEach((l) => l());
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  available() {
    return this.voice !== null;
  }

  /** Las voces se cargan de forma asíncrona en algunos navegadores. */
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  speak(text: string, opts: { rate?: number } = {}) {
    return new Promise<void>((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (this.voice) u.voice = this.voice;
      u.rate = opts.rate ?? 0.85;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}

/**
 * Audios nativos: /audio/{pinyinNum}.mp3 (p. ej. "ni3 hao3" → ni3_hao3.mp3).
 * Aún no hay archivos; queda listo para añadirlos sin tocar el resto de la app.
 */
export class NativeAudioProvider implements AudioProvider {
  readonly name = 'Audio nativo';
  constructor(private readonly index: Set<string> = new Set()) {}
  available() {
    return this.index.size > 0;
  }
  has(pinyinNum: string) {
    return this.index.has(pinyinNum);
  }
  speak(pinyinNum: string) {
    const a = new Audio(`${import.meta.env.BASE_URL}audio/${pinyinNum.replace(/\s+/g, '_')}.mp3`);
    return a.play().then(() => new Promise<void>((r) => (a.onended = () => r())));
  }
}

export const tts = new WebSpeechProvider();
export const nativeAudio = new NativeAudioProvider();

/** Reproduce un hanzi/frase: audio nativo si existe, si no TTS. */
export function say(text: string, pinyinNum?: string, rate?: number) {
  if (pinyinNum && nativeAudio.has(pinyinNum)) return nativeAudio.speak(pinyinNum);
  return tts.speak(text, { rate });
}

/** true cuando hay una voz zh-CN disponible (se actualiza al cargarse las voces). */
export function useVoiceAvailable() {
  return useSyncExternalStore(
    (cb) => tts.subscribe(cb),
    () => tts.available(),
    () => true,
  );
}
