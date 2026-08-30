"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReflexSerial } from "@/lib/serial";
import {
  CLOSE_CALL_US,
  computeStats,
  fmtUs,
  ingest,
  newSession,
  Session,
} from "@/lib/parse";

const POLL_INTERVAL_MS = 1000;

export default function Home() {
  const serialRef = useRef<ReflexSerial | null>(null);
  const sessionRef = useRef<Session>(newSession());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session>(newSession());

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const onLine = useCallback((line: string) => {
    if (line.includes("Game paused")) {
      setPaused(true);
    } else if (line.includes("Game resumed")) {
      setPaused(false);
    }
    ingest(sessionRef.current, line);
    setSession({ ...sessionRef.current });
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const serial = new ReflexSerial();
    serial.setLineHandler(onLine);
    try {
      await serial.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
      return;
    }
    serialRef.current = serial;
    sessionRef.current = newSession();
    setSession(newSession());
    setPaused(false);
    setConnected(true);

    pollRef.current = setInterval(() => {
      void serial.write("points\r\n");
      void serial.write("log\r\n");
    }, POLL_INTERVAL_MS);
  }, [onLine]);

  const disconnect = useCallback(async () => {
    stopPolling();
    await serialRef.current?.disconnect();
    serialRef.current = null;
    setConnected(false);
    setPaused(false);
  }, [stopPolling]);

  const togglePause = useCallback(() => {
    void serialRef.current?.write("pause\r\n");
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      void serialRef.current?.disconnect();
    };
  }, [stopPolling]);

  const stats = computeStats(session);
  const pct1 = Math.round(stats.winRate1 * 100);
  const pct2 = Math.round(stats.winRate2 * 100);
  const rounds = [...session.rounds].reverse();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Reflex Duel <span className="text-cyan-400">Dashboard</span>
          </h1>
          <p className="text-sm text-zinc-400">
            STM32G474RE · 38400 baud · Web Serial
          </p>
        </div>

        <div className="flex items-center gap-3">
          {connected ? (
            <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400 ring-1 ring-emerald-500/30">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : (
            <span className="rounded-full bg-zinc-500/10 px-3 py-1 text-sm text-zinc-400 ring-1 ring-zinc-500/30">
              Disconnected
            </span>
          )}
          {connected && (
            <button
              onClick={togglePause}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              {paused ? "Resume game" : "Pause game"}
            </button>
          )}
          <button
            onClick={connected ? disconnect : connect}
            className={
              connected
                ? "rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 ring-1 ring-zinc-700 transition hover:bg-zinc-700"
                : "rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400"
            }
          >
            {connected ? "Disconnect" : "Connect board"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-6 rounded-lg bg-red-500/10 p-4 text-sm text-red-400 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="P1 wins" value={String(session.wins1)} accent="text-cyan-300" />
        <StatCard label="P2 wins" value={String(session.wins2)} accent="text-emerald-300" />
        <StatCard label="Rounds" value={String(stats.totalRounds)} />
        <StatCard label="Close calls" value={String(stats.closeCalls)} />
        <StatCard
          label="P1 win rate"
          value={`${pct1}%`}
          sub={stats.totalRounds ? "of total" : "no data"}
        />
        <StatCard
          label="P2 win rate"
          value={`${pct2}%`}
          sub={stats.totalRounds ? "of total" : "no data"}
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-zinc-900 p-6 ring-1 ring-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Reaction time
          </h2>
          <div className="mt-4 flex items-center gap-6">
            <PlayerBar
              name="P1"
              color="bg-cyan-400"
              best={fmtUs(stats.best1)}
              avg={stats.avg1 !== null ? fmtUs(Math.round(stats.avg1)) : "none"}
            />
            <PlayerBar
              name="P2"
              color="bg-emerald-400"
              best={fmtUs(stats.best2)}
              avg={stats.avg2 !== null ? fmtUs(Math.round(stats.avg2)) : "none"}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 p-6 ring-1 ring-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Win distribution
          </h2>
          {stats.totalRounds > 0 ? (
            <div className="mt-6 flex h-6 w-full overflow-hidden rounded-full ring-1 ring-zinc-800">
              <div
                className="bg-cyan-400 transition-all duration-500"
                style={{ width: `${pct1}%` }}
              />
              <div
                className="bg-emerald-400 transition-all duration-500"
                style={{ width: `${pct2}%` }}
              />
            </div>
          ) : (
            <p className="mt-6 text-sm text-zinc-500">Play a round to collect data.</p>
          )}
          <div className="mt-4 flex justify-between text-sm text-zinc-400">
            <span className="text-cyan-300">P1 {pct1}%</span>
            <span className="text-emerald-300">P2 {pct2}%</span>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Recent rounds
          </h2>
        </div>
        {rounds.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500">
            No rounds recorded. Connect the board and play.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-500">
                <tr>
                  <th className="px-6 py-2 font-medium">#</th>
                  <th className="px-6 py-2 font-medium">Winner</th>
                  <th className="px-6 py-2 font-medium">P1 time</th>
                  <th className="px-6 py-2 font-medium">P2 time</th>
                  <th className="px-6 py-2 font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => {
                  const gap =
                    r.t1 !== null && r.t2 !== null ? Math.abs(r.t1 - r.t2) : null;
                  const close = gap !== null && gap <= CLOSE_CALL_US;
                  return (
                    <tr key={r.n} className="border-t border-zinc-800/60">
                      <td className="px-6 py-2 text-zinc-500">{r.n}</td>
                      <td
                        className={`px-6 py-2 font-semibold ${
                          r.winner === 1 ? "text-cyan-300" : "text-emerald-300"
                        }`}
                      >
                        P{r.winner}
                      </td>
                      <td className="px-6 py-2 font-mono">{fmtUs(r.t1)}</td>
                      <td className="px-6 py-2 font-mono">{fmtUs(r.t2)}</td>
                      <td className="px-6 py-2 font-mono">
                        {close ? (
                          <span className="rounded bg-amber-400/10 px-2 py-0.5 text-amber-300 ring-1 ring-amber-400/30">
                            {fmtUs(gap)}
                          </span>
                        ) : (
                          <span className="text-zinc-500">{fmtUs(gap)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {props.label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${props.accent ?? "text-zinc-100"}`}>
        {props.value}
      </p>
      {props.sub && <p className="mt-1 text-xs text-zinc-500">{props.sub}</p>}
    </div>
  );
}

function PlayerBar(props: {
  name: string;
  color: string;
  best: string;
  avg: string;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-sm ${props.color}`} />
        <span className="font-semibold">{props.name}</span>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Best</dt>
          <dd className="font-mono">{props.best}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Average</dt>
          <dd className="font-mono">{props.avg}</dd>
        </div>
      </dl>
    </div>
  );
}
