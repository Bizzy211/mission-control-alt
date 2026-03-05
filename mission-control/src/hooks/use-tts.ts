"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSettings } from "@/hooks/use-settings";

export function useTts() {
  const { settings } = useSettings();
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (!settings.tts.enabled) return;

      // Cancel any active speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.tts.rate;
      utterance.pitch = settings.tts.pitch;

      // Match voice by name
      if (settings.tts.voice) {
        const match = voices.find((v) => v.name === settings.tts.voice);
        if (match) utterance.voice = match;
      }

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [settings.tts, voices]
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (speaking) {
        stop();
      } else {
        speak(text);
      }
    },
    [speaking, speak, stop]
  );

  return {
    speak,
    stop,
    toggle,
    speaking,
    voices,
    enabled: settings.tts.enabled,
  };
}
