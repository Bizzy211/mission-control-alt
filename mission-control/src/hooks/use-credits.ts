"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

export interface CreditData {
  limit: number;
  usage: number;
  limitRemaining: number | null;
  percentUsed: number;
  status: "ok" | "warning" | "critical" | "exhausted";
  lastCheckedAt: string | null;
  exhaustedAt?: string;
}

interface UseCreditResult {
  credits: CreditData;
  isExhausted: boolean;
  isWarning: boolean;
  isCritical: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL = 30_000; // 30 seconds

const DEFAULT_CREDITS: CreditData = {
  limit: 0,
  usage: 0,
  limitRemaining: null,
  percentUsed: 0,
  status: "ok",
  lastCheckedAt: null,
};

export function useCredits(): UseCreditResult {
  const [credits, setCredits] = useState<CreditData>(DEFAULT_CREDITS);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch("/api/daemon/credits");
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch {
      // Silently fail — credit display is non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refetch]);

  return {
    credits,
    isExhausted: credits.status === "exhausted",
    isWarning: credits.status === "warning",
    isCritical: credits.status === "critical",
    isLoading,
    refetch,
  };
}
