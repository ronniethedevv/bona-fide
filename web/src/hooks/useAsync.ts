import { useEffect, useState } from "react";

export interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

/** Run an async loader on mount / when deps change, tracking loading + error. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    loader()
      .then((data) => active && setState({ loading: false, error: null, data }))
      .catch(
        (e: unknown) =>
          active &&
          setState({ loading: false, error: e instanceof Error ? e.message : String(e), data: null }),
      );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
