"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPublicData } from "./public-types";

type ResourceState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: Error };

export function usePublicResource<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetchPublicData<T>(path, undefined, controller.signal)
      .then((data) => setState({ status: "success", data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error : new Error("Falha inesperada."),
        });
      });

    return () => controller.abort();
  }, [attempt, path]);

  const retry = useCallback(() => {
    setState({ status: "loading", data: null, error: null });
    setAttempt((current) => current + 1);
  }, []);
  return { ...state, retry };
}
