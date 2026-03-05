"use client";

import { useState, useEffect } from "react";
import { Settings, Volume2, VolumeX, Bell, BellOff, Speech } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useSettings } from "@/hooks/use-settings";
import { playTaskComplete, playNewMessage, playDecisionNeeded } from "@/lib/notification-sounds";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load available TTS voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const previewSound = (type: "complete" | "message" | "decision") => {
    const volume = settings.notifications.volume;
    if (type === "complete") playTaskComplete(volume);
    else if (type === "message") playNewMessage(volume);
    else playDecisionNeeded(volume);
  };

  const previewTTS = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("This is a preview of text to speech settings.");
    if (settings.tts.voice) {
      const voice = voices.find((v) => v.name === settings.tts.voice);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = settings.tts.rate;
    utterance.pitch = settings.tts.pitch;
    window.speechSynthesis.speak(utterance);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Settings" }]} />
        <div className="h-96 rounded-xl border bg-card/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={[{ label: "Settings" }]} />

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure notification sounds and text-to-speech preferences.
        </p>
      </div>

      {/* Notification Sounds */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {settings.notifications.soundEnabled ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            Notification Sounds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sound-enabled" className="flex items-center gap-2">
              Enable notification sounds
            </Label>
            <Switch
              id="sound-enabled"
              checked={settings.notifications.soundEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ notifications: { soundEnabled: checked } })
              }
            />
          </div>

          <div className={cn("space-y-4", !settings.notifications.soundEnabled && "opacity-50 pointer-events-none")}>
            {/* Volume slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  {settings.notifications.volume > 0 ? (
                    <Volume2 className="h-3.5 w-3.5" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" />
                  )}
                  Volume
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(settings.notifications.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.notifications.volume}
                onChange={(e) =>
                  updateSettings({ notifications: { volume: parseFloat(e.target.value) } })
                }
                className="w-full accent-primary"
              />
            </div>

            {/* Sound toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="on-task-complete">Task completed</Label>
                  <p className="text-xs text-muted-foreground">Play when an agent finishes a task</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => previewSound("complete")}
                  >
                    Preview
                  </Button>
                  <Switch
                    id="on-task-complete"
                    checked={settings.notifications.onTaskComplete}
                    onCheckedChange={(checked) =>
                      updateSettings({ notifications: { onTaskComplete: checked } })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="on-new-message">New inbox message</Label>
                  <p className="text-xs text-muted-foreground">Play when a new message arrives</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => previewSound("message")}
                  >
                    Preview
                  </Button>
                  <Switch
                    id="on-new-message"
                    checked={settings.notifications.onNewMessage}
                    onCheckedChange={(checked) =>
                      updateSettings({ notifications: { onNewMessage: checked } })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="on-decision">Decision needed</Label>
                  <p className="text-xs text-muted-foreground">Play when an agent needs your input</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => previewSound("decision")}
                  >
                    Preview
                  </Button>
                  <Switch
                    id="on-decision"
                    checked={settings.notifications.onDecisionNeeded}
                    onCheckedChange={(checked) =>
                      updateSettings({ notifications: { onDecisionNeeded: checked } })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Text-to-Speech */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Speech className="h-4 w-4" />
            Text-to-Speech
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="tts-enabled" className="flex items-center gap-2">
              Enable text-to-speech
            </Label>
            <Switch
              id="tts-enabled"
              checked={settings.tts.enabled}
              onCheckedChange={(checked) =>
                updateSettings({ tts: { enabled: checked } })
              }
            />
          </div>

          <div className={cn("space-y-4", !settings.tts.enabled && "opacity-50 pointer-events-none")}>
            {/* Voice selection */}
            <div className="space-y-2">
              <Label>Voice</Label>
              {voices.length > 0 ? (
                <Select
                  value={settings.tts.voice || "default"}
                  onValueChange={(v) =>
                    updateSettings({ tts: { voice: v === "default" ? "" : v } })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Default voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="default">Default</SelectItem>
                    {voices.map((v) => (
                      <SelectItem key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No voices available. Your browser may not support speech synthesis.
                </p>
              )}
            </div>

            {/* Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{settings.tts.rate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={settings.tts.rate}
                onChange={(e) =>
                  updateSettings({ tts: { rate: parseFloat(e.target.value) } })
                }
                className="w-full accent-primary"
              />
            </div>

            {/* Pitch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pitch</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{settings.tts.pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={settings.tts.pitch}
                onChange={(e) =>
                  updateSettings({ tts: { pitch: parseFloat(e.target.value) } })
                }
                className="w-full accent-primary"
              />
            </div>

            {/* Preview */}
            <Button variant="outline" size="sm" onClick={previewTTS} className="gap-1.5">
              <Speech className="h-3.5 w-3.5" />
              Preview TTS
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
