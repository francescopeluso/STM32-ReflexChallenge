export interface Round {
  n: number;
  winner: 1 | 2;
  t1: number | null;
  t2: number | null;
}

export interface Session {
  wins1: number;
  wins2: number;
  rounds: Round[];
}

export const CLOSE_CALL_US = 50000;

export function newSession(): Session {
  return { wins1: 0, wins2: 0, rounds: [] };
}

const POINTS_RE = /^Player\s+(\d+):\s+(\d+)\s+win/;
const ROUND_RE = /^\s*(\d+)\s+P(\d)\s+(\d+|none)\s+(\d+|none)\s*$/;

function parseTime(token: string): number | null {
  if (token === "none") {
    return null;
  }
  const v = Number(token);
  return Number.isFinite(v) ? v : null;
}

export function ingest(session: Session, line: string): void {
  const cleaned = line.replace(/^reflex>\s*/, "");
  let m = POINTS_RE.exec(cleaned);
  if (m) {
    const wins = Number(m[2]);
    if (m[1] === "1") {
      session.wins1 = wins;
    } else {
      session.wins2 = wins;
    }
    return;
  }

  m = ROUND_RE.exec(cleaned);
  if (m) {
    const n = Number(m[1]);
    const winner = m[2] === "1" ? 1 : 2;
    const t1 = parseTime(m[3]);
    const t2 = parseTime(m[4]);
    const idx = session.rounds.findIndex((r) => r.n === n);
    const round: Round = { n, winner, t1, t2 };
    if (idx >= 0) {
      session.rounds[idx] = round;
    } else {
      session.rounds.push(round);
      session.rounds.sort((a, b) => a.n - b.n);
    }
  }
}

export interface SessionStats {
  totalRounds: number;
  winRate1: number;
  winRate2: number;
  avg1: number | null;
  avg2: number | null;
  best1: number | null;
  best2: number | null;
  closeCalls: number;
}

export function computeStats(session: Session): SessionStats {
  const t1s: number[] = [];
  const t2s: number[] = [];
  let closeCalls = 0;

  for (const r of session.rounds) {
    if (r.t1 !== null) t1s.push(r.t1);
    if (r.t2 !== null) t2s.push(r.t2);
    if (r.t1 !== null && r.t2 !== null && Math.abs(r.t1 - r.t2) <= CLOSE_CALL_US) {
      closeCalls++;
    }
  }

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const best = (xs: number[]) => (xs.length ? Math.min(...xs) : null);

  const total = session.wins1 + session.wins2;

  return {
    totalRounds: total,
    winRate1: total ? session.wins1 / total : 0,
    winRate2: total ? session.wins2 / total : 0,
    avg1: avg(t1s),
    avg2: avg(t2s),
    best1: best(t1s),
    best2: best(t2s),
    closeCalls,
  };
}

export function fmtUs(us: number | null): string {
  if (us === null) return "none";
  if (us >= 1000000) return (us / 1000000).toFixed(2) + " s";
  return us.toLocaleString("en-US") + " µs";
}
