"use client";

import { useEffect, useState } from "react";

import type { ConnectorSummary } from "@ai-life-ops/shared";

import {
  disconnectConnector,
  fetchConnectorAuthUrl,
  fetchConnectors,
  syncConnector
} from "../lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; connectors: ConnectorSummary[] };

type ActionState = {
  connecting: boolean;
  syncing: boolean;
  disconnecting: boolean;
};

export default function ConnectorsView({
  initialConnectors,
  initialError,
  connectedProvider
}: {
  initialConnectors?: ConnectorSummary[] | null;
  initialError?: string | null;
  connectedProvider?: string | null;
}) {
  const [state, setState] = useState<LoadState>(() => {
    if (initialConnectors) {
      return { status: "ready", connectors: initialConnectors };
    }
    if (initialError) {
      return { status: "error", message: initialError };
    }
    return { status: "loading" };
  });
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});

  useEffect(() => {
    let active = true;

    if (initialConnectors || initialError) {
      return () => {
        active = false;
      };
    }

    fetchConnectors()
      .then((connectors) => {
        if (active) {
          setState({ status: "ready", connectors });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ status: "error", message: getErrorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [initialConnectors, initialError]);

  const refresh = async () => {
    const connectors = await fetchConnectors();
    setState({ status: "ready", connectors });
  };

  const handleConnect = async (provider: string) => {
    setActionState((prev) => ({
      ...prev,
      [provider]: { connecting: true, syncing: false, disconnecting: false }
    }));
    try {
      const url = await fetchConnectorAuthUrl(provider);
      window.location.assign(url);
    } catch (error) {
      setState({ status: "error", message: getErrorMessage(error) });
      setActionState((prev) => ({
        ...prev,
        [provider]: { connecting: false, syncing: false, disconnecting: false }
      }));
    }
  };

  const handleSync = async (provider: string) => {
    setActionState((prev) => ({
      ...prev,
      [provider]: { connecting: false, syncing: true, disconnecting: false }
    }));
    try {
      await syncConnector(provider);
      await refresh();
    } catch (error) {
      setState({ status: "error", message: getErrorMessage(error) });
    } finally {
      setActionState((prev) => ({
        ...prev,
        [provider]: { connecting: false, syncing: false, disconnecting: false }
      }));
    }
  };

  const handleDisconnect = async (provider: string) => {
    setActionState((prev) => ({
      ...prev,
      [provider]: { connecting: false, syncing: false, disconnecting: true }
    }));
    try {
      await disconnectConnector(provider);
      await refresh();
    } catch (error) {
      setState({ status: "error", message: getErrorMessage(error) });
    } finally {
      setActionState((prev) => ({
        ...prev,
        [provider]: { connecting: false, syncing: false, disconnecting: false }
      }));
    }
  };

  if (state.status === "loading") {
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading connectors...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="animate-rise rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
        {state.message}
      </div>
    );
  }

  const connectors =
    state.connectors.length > 0
      ? state.connectors
      : [
          {
            provider: "google_calendar",
            status: "disconnected",
            last_synced_at: null,
            last_error: null
          } as ConnectorSummary
        ];

  return (
    <div className="space-y-4">
      {connectedProvider ? (
        <div className="animate-rise rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
          {connectorLabel(connectedProvider)} connected successfully.
        </div>
      ) : null}
      {connectors.map((connector) => {
        const actions = actionState[connector.provider] || {
          connecting: false,
          syncing: false,
          disconnecting: false
        };
        return (
          <section
            key={connector.provider}
            className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {providerLabel(connector.provider)}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  {connectorLabel(connector.provider)}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Status:{" "}
                  <span className={statusChipClass(connector.status)}>
                    {connector.status}
                  </span>
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Last synced: {formatDate(connector.last_synced_at)}
                </p>
                {connector.last_error ? (
                  <p className="mt-2 text-xs text-rose-600">
                    {connector.last_error}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  Busy blocks only, privacy-first via Google FreeBusy.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {connector.status === "connected" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSync(connector.provider)}
                      disabled={actions.syncing}
                      className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                    >
                      {actions.syncing ? "Syncing..." : "Sync now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(connector.provider)}
                      disabled={actions.disconnecting}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actions.disconnecting ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(connector.provider)}
                    disabled={actions.connecting}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {actions.connecting
                      ? "Connecting..."
                      : `Connect ${connectorLabel(connector.provider)}`}
                  </button>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function connectorLabel(provider: string) {
  if (provider === "google_calendar") {
    return "Google Calendar";
  }
  return provider.replace(/_/g, " ");
}

function providerLabel(provider: string) {
  return provider.replace(/_/g, " ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function statusChipClass(status: string) {
  if (status === "connected") {
    return "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700";
  }
  if (status === "error") {
    return "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700";
  }
  return "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to update connectors.";
}
