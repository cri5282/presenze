import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { api } from "../api";
import { useSync } from "../sync";
import { EmptyState, ErrorBanner } from "../components/ui";
import { addDays, fmtShort, startOfDay, startOfMonth, addMonths } from "../date";
import type { Stats } from "../types";

type Period = "month" | "30d" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Questo mese" },
  { value: "30d", label: "Ultimi 30 giorni" },
  { value: "all", label: "Tutto" },
];

export default function StatsPage() {
  const { version } = useSync();
  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const range = useMemo(() => {
    const now = startOfDay(new Date());
    if (period === "month") {
      const start = startOfMonth(now);
      return { from: start, to: addMonths(start, 1) };
    }
    if (period === "30d") {
      return { from: addDays(now, -29), to: addDays(now, 1) };
    }
    return { from: new Date(2020, 0, 1), to: addDays(now, 1) };
  }, [period]);

  useEffect(() => {
    let alive = true;
    setStats(null);
    setError(null);
    api
      .stats(range.from, range.to)
      .then((data) => {
        if (alive) setStats(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Impossibile caricare le statistiche");
      });
    return () => {
      alive = false;
    };
  }, [range, version, reload]);

  const rate = stats?.marked ? stats.rate : null;
  const ringColor = rate === null ? "var(--border-strong)" : rate >= 80 ? "var(--green)" : rate >= 60 ? "var(--amber)" : "var(--red)";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Andamento</p>
          <h1>Statistiche</h1>
          <p className="page-subtitle">Solo le lezioni a cui hai assegnato uno stato.</p>
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label="Periodo">
        {PERIODS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={period === item.value}
            className={`segment${period === item.value ? " active" : ""}`}
            onClick={() => setPeriod(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      {stats === null && !error ? (
        <div className="stats-skeleton" aria-hidden="true">
          <div className="skeleton-card tall" />
          <div className="skeleton-card tall" />
        </div>
      ) : stats === null ? null : stats.total === 0 ? (
        <EmptyState icon={<BarChart3 size={26} />} title="Nessun dato per questo periodo">
          Segna le presenze da “Oggi” o dal calendario e qui vedrai le percentuali.
        </EmptyState>
      ) : (
        <>
          <section className="stats-hero">
            <div
              className="ring"
              style={{
                background: `conic-gradient(${ringColor} ${(rate ?? 0) * 3.6}deg, var(--ring-track) 0deg)`,
              }}
            >
              <div className="ring-inner">
                <strong>{rate === null ? "—" : `${Math.round(rate)}%`}</strong>
                <span>presenze</span>
              </div>
            </div>

            <div className="stats-hero-body">
              <div className="stats-headline">
                <TrendingUp size={18} />
                <span>
                  {stats.marked} {stats.marked === 1 ? "lezione registrata" : "lezioni registrate"}
                </span>
              </div>
              <div className="stats-legend">
                <div className="legend-item">
                  <span className="legend-dot dot-present" />
                  <span>Presente</span>
                  <strong>{stats.present}</strong>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-absent" />
                  <span>Assente</span>
                  <strong>{stats.absent}</strong>
                </div>
                {stats.unmarked > 0 ? (
                  <div className="legend-item">
                    <span className="legend-dot dot-unmarked" />
                    <span>Da segnare</span>
                    <strong>{stats.unmarked}</strong>
                  </div>
                ) : null}
              </div>
              <p className="stats-note">
                Periodo: {fmtShort(new Date(stats.range_from))} –{" "}
                {fmtShort(addDays(new Date(stats.range_to), -1))}
                {stats.unmarked > 0
                  ? " · le lezioni senza stato non contano nella percentuale."
                  : "."}
              </p>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Per materia</h2>
              <span className="section-count">{stats.groups.length}</span>
            </div>
            <div className="group-list">
              {stats.groups.map((group) => (
                <div key={group.title} className="group-row">
                  <div className="group-head">
                    <span className="group-title">{group.title}</span>
                    <span className="group-rate">
                      {group.present}/{group.present + group.absent}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={
                        group.rate >= 80
                          ? "bar bar-good"
                          : group.rate >= 60
                            ? "bar bar-warn"
                            : "bar bar-bad"
                      }
                      style={{ width: `${Math.max(group.rate, group.present > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <div className="group-meta">
                    <span>
                      <i className="dot dot-present" /> {group.present}
                      <i className="dot dot-absent" /> {group.absent}
                      {group.unmarked > 0 ? (
                        <>
                          <i className="dot dot-unmarked" /> {group.unmarked}
                        </>
                      ) : null}
                    </span>
                    <strong>{group.rate}%</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
