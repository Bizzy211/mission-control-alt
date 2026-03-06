"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

export interface UsageData {
  tasksToday: number;
  totalTasksCompleted: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  lastUpdated: string | null;
}

interface UseUsageResult {
  usage: UsageData;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL = 30_000; // 30 seconds

const DEFAULT_USAGE: UsageData = {
  tasksToday: 0,
  totalTasksCompleted: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  lastUpdated: null,
};

export function useUsage(): UseUsageResult {
  const [usage, setUsage] = useState<UsageData>(DEFAULT_USAGE);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch("/api/daemon/usage");
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // Silently fail — usage display is non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refetch]);

  return { usage, isLoading, refetch };
}
