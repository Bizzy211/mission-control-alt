"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

export interface AppSettings {
  notifications: {
    soundEnabled: boolean;
    volume: number;
    onTaskComplete: boolean;
    onNewMessage: boolean;
    onDecisionNeeded: boolean;
  };
  tts: {
    enabled: boolean;
    voice: string;
    rate: number;
    pitch: number;
  };
}

const DEFAULTS: AppSettings = {
  notifications: {
    soundEnabled: true,
    volume: 0.7,
    onTaskComplete: true,
    onNewMessage: true,
    onDecisionNeeded: true,
  },
  tts: {
    enabled: false,
    voice: "",
    rate: 1.0,
    pitch: 1.0,
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<{ notifications: Partial<AppSettings["notifications"]>; tts: Partial<AppSettings["tts"]> }>) => {
      // Optimistic update
      const next: AppSettings = {
        notifications: { ...settings.notifications, ...partial.notifications },
        tts: { ...settings.tts, ...partial.tts },
      };
      setSettings(next);

      try {
        const res = await apiFetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        if (res.ok) {
          const saved = await res.json();
          setSettings(saved);
        }
      } catch {
        // Revert on error — refetch
        apiFetch("/api/settings")
          .then((r) => (r.ok ? r.json() : DEFAULTS))
          .then(setSettings)
          .catch(() => {});
      }
    },
    [settings]
  );

  return { settings, loading, updateSettings };
}
