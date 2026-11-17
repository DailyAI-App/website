"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPostureStats, savePostureSample, type PostureStats } from "@/lib/posture";

export function usePostureData() {
  const [stats, setStats] = useState<PostureStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCapturedAt, setLastCapturedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await fetchPostureStats());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기록을 불러오지 못했어요.");
    }
  }, []);

  const recordSample = useCallback(async (score: number, source: string) => {
    setError(null);
    try {
      await savePostureSample(score, source);
      setLastCapturedAt(Date.now());
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기록하지 못했어요.");
    }
  }, [refresh]);

  useEffect(() => {
    // Initial data is synchronized from the API after the page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { stats, error, lastCapturedAt, recordSample };
}
