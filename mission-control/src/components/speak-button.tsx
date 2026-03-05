"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";
import { useTts } from "@/hooks/use-tts";
import { cn } from "@/lib/utils";

interface SpeakButtonProps {
  text: string;
  className?: string;
  size?: "icon" | "sm" | "default";
}

export function SpeakButton({ text, className, size = "icon" }: SpeakButtonProps) {
  const { toggle, speaking, enabled } = useTts();

  if (!enabled) return null;

  return (
    <Tip content={speaking ? "Stop speaking" : "Read aloud"}>
      <Button
        variant="ghost"
        size={size}
        className={cn("h-7 w-7", className)}
        onClick={(e) => {
          e.stopPropagation();
          toggle(text);
        }}
        aria-label={speaking ? "Stop speaking" : "Read aloud"}
      >
        {speaking ? (
          <VolumeX className="h-3.5 w-3.5 text-primary animate-pulse" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </Tip>
  );
}
