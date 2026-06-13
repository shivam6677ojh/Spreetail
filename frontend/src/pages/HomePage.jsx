import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function HomePage() {
  const [apiStatus, setApiStatus] = useState("Checking...");

  useEffect(() => {
    const controller = new AbortController();

    apiClient
      .get("/health", { signal: controller.signal })
      .then(({ data }) => setApiStatus(data.data.status))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setApiStatus("Unavailable");
          console.error("Backend health check failed", error);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-600">
        Foundation ready
      </p>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
        Manage shared expenses without losing track of who owes what.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Authentication, groups, expenses, balances, and settlements will build on this
        production-ready foundation.
      </p>
      <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        API status: <strong>{apiStatus}</strong>
      </div>
    </section>
  );
}
