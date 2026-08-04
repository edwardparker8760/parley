"use client";

/**
 * One negotiation's state, from either the live stream or a cold read.
 *
 * Both sources deliver the identical `NegotiationView` payload, so this hook
 * has no branch for "live" versus "replay" beyond which URL it opens. That is
 * what lets every panel below be written once.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { NegotiationView } from "@parley/orchestrator";

export type ScenarioName = "A" | "B" | "C";

export interface NegotiationStreamState {
  readonly view: NegotiationView | null;
  readonly negotiationId: string | null;
  readonly running: boolean;
  readonly error: string | null;
  start(scenario: ScenarioName, strategy: "engine" | "baseline"): Promise<void>;
}

export function useNegotiationEventStream(
  initialNegotiationId: string | null,
): NegotiationStreamState {
  const [view, setView] = useState<NegotiationView | null>(null);
  const [negotiationId, setNegotiationId] = useState<string | null>(
    initialNegotiationId,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  /** Cold read: a completed negotiation, no live process required. */
  useEffect(() => {
    if (initialNegotiationId === null) return;
    let cancelled = false;

    void fetch(`/api/negotiation/${initialNegotiationId}`)
      .then(async (response) => {
        const body = (await response.json()) as NegotiationView | { error: string };
        if (cancelled) return;
        if ("error" in body) setError(body.error);
        else setView(body);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [initialNegotiationId]);

  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  const start = useCallback(async (
    scenario: ScenarioName,
    strategy: "engine" | "baseline",
  ) => {
    sourceRef.current?.close();
    setView(null);
    setError(null);
    setRunning(true);

    const response = await fetch("/api/run-scenario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, strategy }),
    });
    const body = (await response.json()) as
      | { negotiationId: string }
      | { error: string };

    if ("error" in body) {
      setError(body.error);
      setRunning(false);
      return;
    }

    setNegotiationId(body.negotiationId);

    const source = new EventSource(
      `/api/negotiation-stream?id=${encodeURIComponent(body.negotiationId)}`,
    );
    sourceRef.current = source;

    source.addEventListener("negotiation", (event) => {
      setView(JSON.parse((event as MessageEvent<string>).data) as NegotiationView);
    });
    source.addEventListener("failed", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        error: string;
      };
      setError(payload.error);
      setRunning(false);
      source.close();
    });
    source.addEventListener("ended", () => {
      setRunning(false);
      source.close();
    });
    source.onerror = () => {
      setRunning(false);
      source.close();
    };
  }, []);

  return { view, negotiationId, running, error, start };
}
