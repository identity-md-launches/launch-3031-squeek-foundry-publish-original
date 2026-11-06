import { CONFIG } from "./config";
export const ENDPOINTS = {
  status: "https://api.squeekchain.com/v1/status",
  economy: "https://api.squeekchain.com/v1/economy/state",
  settlements: "https://api.squeekchain.com/v1/settlements?range=24h",
};
export type Batch = {
  transactionHash: string;
  ethereumBlockNumber: string;
  logIndex: string;
  blockTimestamp: string;
  confirmationStatus: "safe";
  workAdded: string;
  previousSettledThroughRound: string;
  settledThroughRound: string;
  activeRoundCount: string;
};
export type Source = {
  kind: "synthetic" | "historical";
  mode: string;
  label: string;
  segmentEnergy: number[];
  records: Batch[];
  installationId?: string;
  chainId?: string;
  chainTarget?: string;
  releaseId?: string;
  protocolRevision?: string;
  rewardModelRevision?: string;
  generatedAt?: string;
  confirmations?: string;
  safeThroughBlock?: string;
  indexedThroughBlock?: string;
  safeBlockHash?: string;
  safeBlockTimestamp?: string;
  trusted: boolean;
};
export function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Expected an object");
  return v as Record<string, unknown>;
}
export function str(v: unknown, max = 256): string {
  if (typeof v !== "string" || !v.length || v.length > max)
    throw Error("Invalid text field");
  return v;
}
export function dec(v: unknown): string {
  const s = str(v, 100);
  if (!/^(0|[1-9][0-9]*)$/.test(s))
    throw Error("Expected an unsigned decimal string");
  return s;
}
export function date(v: unknown): string {
  const s = str(v, 40);
  if (!Number.isFinite(Date.parse(s))) throw Error("Invalid timestamp");
  return s;
}
export function integer(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw Error(`Integer outside ${min}…${max}`);
  return v;
}
export function hash(v: unknown): string {
  const s = str(v, 66);
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw Error("Invalid transaction hash");
  return s;
}
export function batch(v: unknown): Batch {
  const b = obj(v);
  if (b.confirmationStatus !== "safe") throw Error("Unsafe settlement");
  const result: Batch = {
    transactionHash: hash(b.transactionHash),
    ethereumBlockNumber: dec(b.ethereumBlockNumber),
    logIndex: dec(b.logIndex),
    blockTimestamp: date(b.blockTimestamp),
    confirmationStatus: "safe",
    workAdded: dec(b.workAdded),
    previousSettledThroughRound: dec(b.previousSettledThroughRound),
    settledThroughRound: dec(b.settledThroughRound),
    activeRoundCount: dec(b.activeRoundCount),
  };
  if (
    BigInt(result.settledThroughRound) <
    BigInt(result.previousSettledThroughRound)
  )
    throw Error("Invalid round interval");
  return result;
}
export function order(a: Batch, b: Batch) {
  const d =
    BigInt(a.ethereumBlockNumber) - BigInt(b.ethereumBlockNumber) ||
    BigInt(a.logIndex) - BigInt(b.logIndex);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}
export function energies(records: Batch[]): number[] {
  const maximum = records.reduce(
    (m, r) => (BigInt(r.workAdded) > m ? BigInt(r.workAdded) : m),
    1n,
  );
  return records.map((r) =>
    Number((BigInt(CONFIG.maxSegmentEnergy) * BigInt(r.workAdded)) / maximum),
  );
}
export function profile(source: Source): number[] {
  const es =
    source.kind === "historical"
      ? energies(source.records)
      : source.segmentEnergy;
  return es.flatMap((e) =>
    Array.from(
      { length: CONFIG.segmentTicks },
      (_, t) =>
        Math.floor(((t + 1) * e) / CONFIG.segmentTicks) -
        Math.floor((t * e) / CONFIG.segmentTicks),
    ),
  );
}
export type LiveStatus = {
  installationId: string;
  observedAt: string;
  generatedAt: string;
  freshness: string;
  staleAfterSeconds: number;
  coreStatus: string;
  rpmMilli: number;
  revision: string;
};
export function parseStatus(v: unknown): LiveStatus {
  const d = obj(v);
  if (d.schemaVersion !== 1) throw Error("Unsupported status schema");
  const m = obj(d.measurement);
  return {
    installationId: str(d.installationId, 128),
    observedAt: date(m.observedAt),
    generatedAt: date(d.generatedAt),
    freshness: str(m.freshness),
    staleAfterSeconds: integer(m.staleAfterSeconds, 1, 86400),
    coreStatus: str(m.coreStatus),
    rpmMilli: integer(m.rpmMilli, 0, 1_000_000_000),
    revision: str(d.revision),
  };
}
export function parseEconomy(v: unknown) {
  const d = obj(v);
  if (d.schemaVersion !== 3 || d.status !== "available")
    throw Error("Economy unavailable or unsupported schema");
  const c = obj(d.chain),
    r = obj(d.release);
  return {
    installationId: str(d.installationId, 128),
    releaseId: str(r.id, 128),
    protocolRevision: str(r.protocolRevision, 128),
    rewardModelRevision: str(r.rewardModelRevision, 128),
    chainId: dec(c.chainId),
    chainTarget: str(c.target, 64),
    confirmations: dec(c.confirmations),
    safeThroughBlock: dec(c.safeThroughBlock),
    indexedThroughBlock: dec(c.indexedThroughBlock),
    safeBlockHash: hash(c.safeBlockHash),
    safeBlockTimestamp: date(c.safeBlockTimestamp),
    generatedAt: date(d.generatedAt),
  };
}
export function historical(
  status: LiveStatus,
  economy: ReturnType<typeof parseEconomy>,
  raw: unknown,
  count: number,
): Source {
  integer(count, 2, 12);
  const d = obj(raw);
  if (d.schemaVersion !== 3 || d.status !== "available")
    throw Error("Settlements unavailable or unsupported schema");
  const c = obj(d.chain);
  if (
    d.installationId !== economy.installationId ||
    status.installationId !== economy.installationId ||
    dec(c.chainId) !== economy.chainId
  )
    throw Error("Installation or chain changed; select a new source");
  if (!Array.isArray(d.recentSettlements))
    throw Error("Missing recent settlements");
  const seen = new Set<string>();
  const records = d.recentSettlements
    .filter((v) => obj(v).confirmationStatus === "safe")
    .map(batch)
    .sort(order)
    .filter((r) => {
      const key = `${r.ethereumBlockNumber}:${r.logIndex}`;
      const txkey = `${r.transactionHash.toLowerCase()}:${r.logIndex}`;
      if (seen.has(key) || seen.has(txkey)) return false;
      seen.add(key);
      seen.add(txkey);
      return (
        BigInt(r.ethereumBlockNumber) <= BigInt(dec(c.safeThroughBlock)) &&
        BigInt(r.ethereumBlockNumber) <= BigInt(economy.safeThroughBlock)
      );
    })
    .slice(-count);
  if (records.length < 2)
    throw Error(
      "Fewer than two distinct safe batches. Choose synthetic Practice.",
    );
  return {
    kind: "historical",
    mode: "historical",
    label: "Historical Shift",
    ...economy,
    generatedAt: date(d.generatedAt),
    records,
    segmentEnergy: energies(records),
    trusted: true,
  };
}
export function validateSource(v: unknown): Source {
  const s = obj(v);
  if (s.kind !== "synthetic" && s.kind !== "historical")
    throw Error("Unknown source kind");
  const base = {
    kind: s.kind,
    mode: str(s.mode, 80),
    label: str(s.label, 80),
    trusted: false,
  } as const;
  if (s.kind === "synthetic") {
    if (
      !Array.isArray(s.segmentEnergy) ||
      s.segmentEnergy.length < 2 ||
      s.segmentEnergy.length > 12
    )
      throw Error("Invalid segments");
    return {
      ...base,
      kind: "synthetic",
      records: [],
      segmentEnergy: s.segmentEnergy.map((e) => integer(e, 0, 160)),
    };
  }
  if (
    !Array.isArray(s.records) ||
    s.records.length < 2 ||
    s.records.length > 12
  )
    throw Error("Need 2–12 records");
  const records = s.records.map(batch).sort(order);
  const seen = new Set<string>();
  for (const r of records) {
    const key = `${r.ethereumBlockNumber}:${r.logIndex}`;
    const txkey = `${r.transactionHash.toLowerCase()}:${r.logIndex}`;
    if (seen.has(key) || seen.has(txkey)) throw Error("Duplicate settlement");
    seen.add(key);
    seen.add(txkey);
  }
  const safeThroughBlock = dec(s.safeThroughBlock);
  if (
    records.some(
      (r) => BigInt(r.ethereumBlockNumber) > BigInt(safeThroughBlock),
    )
  )
    throw Error("Settlement exceeds safety boundary");
  return {
    ...base,
    kind: "historical",
    installationId: str(s.installationId, 128),
    chainId: dec(s.chainId),
    chainTarget: str(s.chainTarget, 64),
    releaseId: str(s.releaseId, 128),
    protocolRevision: str(s.protocolRevision, 128),
    rewardModelRevision: str(s.rewardModelRevision, 128),
    generatedAt: date(s.generatedAt),
    confirmations: dec(s.confirmations),
    safeThroughBlock,
    indexedThroughBlock: dec(s.indexedThroughBlock),
    safeBlockHash: hash(s.safeBlockHash),
    safeBlockTimestamp: date(s.safeBlockTimestamp),
    records,
    segmentEnergy: energies(records),
  };
}
export function synthetic(
  mode: string,
  label: string,
  segmentEnergy: number[],
): Source {
  return {
    kind: "synthetic",
    mode,
    label,
    segmentEnergy,
    records: [],
    trusted: false,
  };
}
export function txURL(source: Source, tx: string) {
  return source.chainId === "11155111"
    ? `https://sepolia.etherscan.io/tx/${tx}`
    : source.chainId === "1"
      ? `https://etherscan.io/tx/${tx}`
      : null;
}
export const horizon = (s: Source) =>
  Math.min(CONFIG.maxHorizon, profile(s).length);
