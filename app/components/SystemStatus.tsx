"use client";

import { useEffect, useState } from "react";

type Health = "checking" | "online" | "offline";

export function SystemStatus() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { status?: string } | null;
        setHealth(response.ok && body?.status === "ok" ? "online" : "offline");
      })
      .catch(() => {
        if (!controller.signal.aborted) setHealth("offline");
      });
    return () => controller.abort();
  }, []);

  return (
    <span className={`system-status system-${health}`} role="status" aria-live="polite">
      <span aria-hidden="true" />
      {health === "checking" ? "Verificando sistema" : health === "online" ? "Sistema online" : "Sistema indisponível"}
    </span>
  );
}
