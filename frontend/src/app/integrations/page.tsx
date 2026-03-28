"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface IntegrationHealth {
  healthy: boolean;
  last_check: string;
  latency_ms: number;
  consecutive_failures: number;
}

interface ConnectionStatus {
  auth_type: "oauth" | "none";
  connected: boolean;
  provider: string | null;
  user_name: string | null;
  connected_at?: string;
}

interface Integration {
  name: string;
  description: string;
  transport: string;
  url: string;
  enabled: boolean;
  tools_count: number;
  tools: string[];
  used_by: string[];
  health: IntegrationHealth;
  connection: ConnectionStatus;
}

interface OAuthProvider {
  name: string;
  display_name: string;
  icon: string;
  color: string;
  scopes: string[];
  powers_integrations: string[];
  configured: boolean;
  connected: boolean;
  connected_as: string | null;
  connected_at: string | null;
}

/* ── Static metadata ───────────────────────────────────────────────────────── */

const INTEGRATION_META: Record<
  string,
  { icon: string; category: string; color: string }
> = {
  linkedin: { icon: "in", category: "Data Source", color: "#0a66c2" },
  gmail: { icon: "G", category: "Communication", color: "#ea4335" },
  google_calendar: { icon: "GC", category: "Productivity", color: "#4285f4" },
  github_official: { icon: "gh", category: "Data Source", color: "#8b5cf6" },
  github_custom: { icon: "gc", category: "Analytics", color: "#8b5cf6" },
  web_scraper: { icon: "ws", category: "Data Source", color: "#f59e0b" },
  search: { icon: "se", category: "Data Source", color: "#10b981" },
  email: { icon: "em", category: "Communication", color: "#ef4444" },
  slack: { icon: "sl", category: "Communication", color: "#e11d48" },
};

/* ── Page Component ────────────────────────────────────────────────────────── */

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Data fetching ─────────────────────────────────────────────────────── */

  const loadAll = useCallback(async () => {
    try {
      const [intRes, provRes] = await Promise.all([
        fetch(`${API}/integrations`),
        fetch(`${API}/auth/providers`),
      ]);
      if (!intRes.ok || !provRes.ok) {
        throw new Error(`Backend returned ${intRes.status}/${provRes.status}`);
      }
      const intData = await intRes.json();
      const provData = await provRes.json();
      setIntegrations(intData.integrations || []);
      setProviders(provData.providers || []);
      setError(null);
    } catch {
      setError("Could not reach the backend. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  /* ── Listen for OAuth popup postMessage ────────────────────────────────── */

  useEffect(() => {
    const expectedOrigin = new URL(API).origin;
    const handler = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      if (event.data?.type === "nester_oauth") {
        setConnectingProvider(null);
        loadAll();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [loadAll]);

  /* ── OAuth connect (popup flow) ────────────────────────────────────────── */

  const connectOAuth = useCallback((providerName: string) => {
    // Clean up any previous poll
    if (popupPollRef.current) clearInterval(popupPollRef.current);

    setConnectingProvider(providerName);
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      `${API}/auth/${providerName}/start`,
      `nester_oauth_${providerName}`,
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    // Poll for popup close (user cancelled without completing OAuth)
    popupPollRef.current = setInterval(() => {
      if (!popup || popup.closed) {
        if (popupPollRef.current) clearInterval(popupPollRef.current);
        popupPollRef.current = null;
        setConnectingProvider(null);
      }
    }, 500);
  }, []);

  /* ── OAuth disconnect ──────────────────────────────────────────────────── */

  const disconnectOAuth = useCallback(
    async (providerName: string) => {
      setDisconnectingProvider(providerName);
      try {
        const res = await fetch(`${API}/auth/${providerName}/disconnect`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
        await loadAll();
      } catch (err) {
        setError(
          `Failed to disconnect ${providerName}. ${err instanceof Error ? err.message : ""}`
        );
      } finally {
        setDisconnectingProvider(null);
      }
    },
    [loadAll]
  );

  /* ── Expand detail ─────────────────────────────────────────────────────── */

  const loadDetail = useCallback(async (name: string) => {
    setExpanded((prev) => {
      if (prev === name) {
        setDetail(null);
        return null;
      }
      return name;
    });

    // Fetch detail (won't matter if we just collapsed — state will be null)
    try {
      const res = await fetch(`${API}/integrations/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetail(json);
    } catch {
      setDetail(null);
    }
  }, []);

  /* ── Derived data ──────────────────────────────────────────────────────── */

  const connectedCount = integrations.filter((i) => i.connection.connected).length;
  const healthyCount = integrations.filter((i) => i.health.healthy).length;

  // Group integrations by category (immutable)
  const grouped = integrations.reduce<Record<string, Integration[]>>(
    (acc, integ) => {
      const cat = INTEGRATION_META[integ.name]?.category || "Other";
      const existing = acc[cat] ?? [];
      return { ...acc, [cat]: [...existing, integ] };
    },
    {}
  );

  const categoryOrder = ["Communication", "Data Source", "Analytics", "Productivity", "Other"];
  const sortedCategories = categoryOrder.filter((c) => grouped[c]?.length);

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Integrations</h1>
        <p className="text-muted text-sm">
          Connect your tools — Gmail, GitHub, Slack, and more — just like Claude
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Plugins" value={loading ? "..." : integrations.length} />
        <StatCard
          label="Connected"
          value={loading ? "..." : connectedCount}
          accent="success"
        />
        <StatCard
          label="Healthy"
          value={loading ? "..." : healthyCount}
          accent={healthyCount === integrations.length ? "success" : undefined}
        />
        <StatCard
          label="Need Setup"
          value={
            loading
              ? "..."
              : integrations.filter((i) => !i.connection.connected).length
          }
          accent={
            integrations.some((i) => !i.connection.connected)
              ? "warning"
              : undefined
          }
        />
      </div>

      {/* OAuth Connectors — the big "Connect" buttons */}
      <div className="mb-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Connect Your Accounts</h2>
          <p className="text-xs text-muted">
            Sign in with OAuth to connect your tools — no API keys needed
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {providers.map((prov) => (
            <OAuthConnectorCard
              key={prov.name}
              provider={prov}
              isConnecting={connectingProvider === prov.name}
              isDisconnecting={disconnectingProvider === prov.name}
              onConnect={() => connectOAuth(prov.name)}
              onDisconnect={() => disconnectOAuth(prov.name)}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-20 text-muted text-sm">
          Loading integrations...
        </div>
      )}

      {/* Integration cards by category */}
      {sortedCategories.map((category) => (
        <Section
          key={category}
          title={category}
          subtitle={categorySubtitles[category] || ""}
        >
          {grouped[category].map((integ) => (
            <IntegrationCard
              key={integ.name}
              integration={integ}
              isExpanded={expanded === integ.name}
              detail={expanded === integ.name ? detail : null}
              onToggle={() => loadDetail(integ.name)}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}

const categorySubtitles: Record<string, string> = {
  Communication: "Email, messaging, and notifications",
  "Data Source": "Where your agents get information",
  Analytics: "Computed metrics and insights",
  Productivity: "Calendars, docs, and workflow tools",
  Other: "Additional integrations",
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "error" | "warning";
}) {
  const valueColor =
    accent === "success"
      ? "text-success"
      : accent === "error"
        ? "text-error"
        : accent === "warning"
          ? "text-amber-400"
          : "text-foreground";

  return (
    <div className="rounded-lg border border-card-border bg-card px-4 py-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

/* ── OAuth Connector Card (the big Connect / Connected button) ───────────── */

function OAuthConnectorCard({
  provider,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
}: {
  provider: OAuthProvider;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = provider.connected;

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        isConnected
          ? "border-success/30 bg-success/5"
          : "border-card-border bg-card hover:border-accent/30"
      }`}
    >
      {/* Provider icon + name */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
          style={{ backgroundColor: provider.color }}
        >
          {provider.icon}
        </div>
        <div>
          <h3 className="font-semibold text-sm">{provider.display_name}</h3>
          <p className="text-[11px] text-muted">
            {provider.powers_integrations
              .map((n) =>
                n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
              )
              .join(", ")}
          </p>
        </div>
      </div>

      {/* Connected state */}
      {isConnected && (
        <div className="mb-4 rounded-lg bg-success/10 border border-success/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-success font-medium">Connected</span>
          </div>
          {provider.connected_as && (
            <p className="text-[11px] text-foreground/70 mt-1 pl-4">
              {provider.connected_as}
            </p>
          )}
          {provider.connected_at && (
            <p className="text-[10px] text-muted mt-0.5 pl-4">
              Since {new Date(provider.connected_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Scopes */}
      <div className="flex flex-wrap gap-1 mb-4">
        {provider.scopes.slice(0, 3).map((scope) => {
          const short = scope.split("/").pop()?.split(".").pop() || scope;
          return (
            <span
              key={scope}
              className="text-[10px] px-1.5 py-0.5 rounded bg-card-border/50 text-muted"
            >
              {short}
            </span>
          );
        })}
        {provider.scopes.length > 3 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-card-border/50 text-muted">
            +{provider.scopes.length - 3} more
          </span>
        )}
      </div>

      {/* Connect / Disconnect button */}
      {isConnected ? (
        <button
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="w-full text-xs py-2 rounded-lg border border-card-border text-muted hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      ) : !provider.configured ? (
        <div className="w-full text-center text-[11px] py-2 rounded-lg border border-card-border text-muted">
          OAuth not configured — ask your admin to enable {provider.display_name}
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="w-full text-xs py-2.5 rounded-lg font-medium text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: provider.color }}
        >
          {isConnecting ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Connecting...
            </span>
          ) : (
            `Connect with ${provider.display_name}`
          )}
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* ── Section ─────────────────────────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

/* ── Integration Card ────────────────────────────────────────────────────── */

function IntegrationCard({
  integration,
  isExpanded,
  detail,
  onToggle,
}: {
  integration: Integration;
  isExpanded: boolean;
  detail: Record<string, unknown> | null;
  onToggle: () => void;
}) {
  const meta = INTEGRATION_META[integration.name];
  const iconBg = meta?.color || "#3b82f6";
  const iconText = meta?.icon || integration.name.slice(0, 2);
  const conn = integration.connection;

  const healthColor = integration.health.healthy ? "bg-success" : "bg-error";
  const connColor = conn.connected ? "text-success" : "text-muted";

  const transportLabel =
    integration.transport === "stdio"
      ? "Local Process"
      : integration.transport === "streamable-http"
        ? "Browser MCP"
        : "HTTP Server";

  const detailTools = (
    detail as { tools?: Array<{ name: string; description: string }> }
  )?.tools;

  return (
    <div
      className={`rounded-xl border bg-card transition-all ${
        isExpanded
          ? "border-accent/50 col-span-full"
          : "border-card-border hover:border-accent/30"
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 flex items-start gap-4"
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          {iconText.toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">
              {integration.name
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </h3>
            <div className={`w-2 h-2 rounded-full ${healthColor}`} />
            {conn.connected ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">
                {conn.auth_type === "oauth" && conn.user_name
                  ? conn.user_name
                  : "connected"}
              </span>
            ) : conn.auth_type === "oauth" ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                not connected
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted line-clamp-2">
            {integration.description}
          </p>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-muted">
            <span>{integration.tools_count} tools</span>
            <span>{transportLabel}</span>
            {integration.health.latency_ms > 0 && (
              <span>{integration.health.latency_ms}ms</span>
            )}
            {integration.used_by.length > 0 && (
              <span>
                Used by:{" "}
                {integration.used_by
                  .map((f) =>
                    f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                  )
                  .join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-muted transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-card-border px-5 pb-5 pt-4 animate-slide-up">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Connection info */}
            <div>
              <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-3">
                Connection
              </h4>
              <div className="space-y-2 text-sm">
                <InfoRow label="Transport" value={transportLabel} />
                {integration.url && (
                  <InfoRow label="Endpoint" value={integration.url} mono />
                )}
                <InfoRow
                  label="Status"
                  value={
                    integration.health.healthy ? "Connected" : "Disconnected"
                  }
                  color={
                    integration.health.healthy ? "text-success" : "text-error"
                  }
                />
                {conn.auth_type === "oauth" && (
                  <InfoRow
                    label="Auth"
                    value={
                      conn.connected
                        ? `OAuth (${conn.user_name || conn.provider})`
                        : `OAuth via ${conn.provider}`
                    }
                    color={connColor}
                  />
                )}
                {conn.auth_type === "none" && (
                  <InfoRow label="Auth" value="None needed" color="text-success" />
                )}
              </div>
            </div>

            {/* Tools list */}
            <div>
              <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-3">
                Available Tools ({integration.tools_count})
              </h4>
              <div className="space-y-1.5 max-h-60 overflow-auto">
                {detailTools
                  ? detailTools.map((tool) => (
                      <div
                        key={tool.name}
                        className="rounded-lg bg-background border border-card-border px-3 py-2"
                      >
                        <div className="text-xs font-medium font-mono">
                          {tool.name}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 line-clamp-2">
                          {tool.description}
                        </div>
                      </div>
                    ))
                  : integration.tools.map((name) => (
                      <div
                        key={name}
                        className="rounded-lg bg-background border border-card-border px-3 py-2"
                      >
                        <div className="text-xs font-medium font-mono">
                          {name}
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <span
        className={`text-xs truncate ${color || "text-foreground/80"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
