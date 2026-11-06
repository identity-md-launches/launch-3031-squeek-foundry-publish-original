import {
  CONFIG,
  ENGINE_VERSION,
  KINDS,
  METRICS,
  OPS,
  cost,
  type Blueprint,
  type Cell,
  type Rule,
} from "./config";
import { simulate, type State, type RunSpec } from "./engine";
import {
  obj,
  str,
  integer,
  validateSource,
  profile,
  type Source,
} from "./source";
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export function parseJSON(text: string): unknown {
  if (new TextEncoder().encode(text).length > 128 * 1024)
    throw Error("JSON exceeds 128 KB");
  try {
    return JSON.parse(text);
  } catch {
    throw Error("Invalid JSON");
  }
}
export function validateRules(v: unknown, layout: Cell[]): Rule[] {
  if (!Array.isArray(v) || v.length > 8) throw Error("Maximum eight rules");
  return v.map((raw) => {
    const r = obj(raw);
    if (
      !METRICS.includes(r.metric as Rule["metric"]) ||
      !OPS.includes(r.op as Rule["op"]) ||
      !["enable", "disable", "priority"].includes(String(r.action))
    )
      throw Error("Invalid rule enum");
    const target = str(r.target, 16);
    if (
      target !== "all" &&
      !KINDS.includes(target as (typeof KINDS)[number]) &&
      (!/^cell:\d+$/.test(target) ||
        !layout.some((c) => `cell:${c.id}` === target))
    )
      throw Error("Invalid rule target");
    return {
      metric: r.metric,
      op: r.op,
      threshold: integer(r.threshold, 0, 100000),
      target,
      action: r.action,
      value: integer(r.value, 0, 9),
    } as Rule;
  });
}
export function validateBlueprint(v: unknown): Blueprint {
  const b = obj(v);
  if (
    b.format !== "squeek-foundry-blueprint" ||
    b.version !== 1 ||
    b.engineVersion !== ENGINE_VERSION
  )
    throw Error("Unsupported blueprint or engine version");
  if (canonical(b.constants) !== canonical(CONFIG))
    throw Error("Constants do not match this engine version");
  if (!Array.isArray(b.layout) || b.layout.length > 96)
    throw Error("Invalid layout");
  const ids = new Set<number>();
  const layout: Cell[] = b.layout
    .map((v) => {
      const c = obj(v);
      const id = integer(c.id, 0, 95);
      if (ids.has(id)) throw Error("Duplicate cell");
      ids.add(id);
      if (
        !KINDS.includes(c.kind as Cell["kind"]) ||
        typeof c.enabled !== "boolean"
      )
        throw Error("Invalid module");
      return {
        id,
        kind: c.kind,
        dir: integer(c.dir, 0, 3),
        enabled: c.enabled,
        priority: integer(c.priority, 0, 9),
      } as Cell;
    })
    .sort((a, b) => a.id - b.id);
  if (cost(layout) > CONFIG.budget) throw Error("Layout exceeds budget");
  return {
    format: "squeek-foundry-blueprint",
    version: 1,
    engineVersion: ENGINE_VERSION,
    constants: CONFIG,
    name: str(b.name, 80),
    layout,
    rules: validateRules(b.rules, layout),
  };
}
export async function fingerprint(v: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(v)),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// Transport trust is excluded: an imported API snapshot is always labelled untrusted.
export function sourcePayload(source: Source) {
  const { trusted, ...rest } = source;
  void trusted;
  return rest;
}
export type RunBundle = {
  format: "squeek-foundry-run";
  version: 1;
  engineVersion: string;
  blueprint: Blueprint;
  source: Source;
  horizon: number;
  profile: number[];
  score: number;
  sourceFingerprint: string;
  stateFingerprint: string;
};
export async function bundle(
  blueprint: Blueprint,
  source: Source,
): Promise<RunBundle> {
  const p = profile(source);
  const spec: RunSpec = {
    layout: blueprint.layout,
    rules: blueprint.rules,
    profile: p,
    horizon: p.length,
  };
  const states = simulate(spec);
  const final = states[states.length - 1];
  return {
    format: "squeek-foundry-run",
    version: 1,
    engineVersion: ENGINE_VERSION,
    blueprint,
    source,
    horizon: p.length,
    profile: p,
    score: final.score,
    sourceFingerprint: await fingerprint(sourcePayload(source)),
    stateFingerprint: await fingerprint(final),
  };
}
export async function importRun(v: unknown): Promise<{
  blueprint: Blueprint;
  source: Source;
  history: State[];
  bundle: RunBundle;
}> {
  const b = obj(v);
  if (
    b.format !== "squeek-foundry-run" ||
    b.version !== 1 ||
    b.engineVersion !== ENGINE_VERSION
  )
    throw Error("Unsupported run");
  const blueprint = validateBlueprint(b.blueprint),
    source = validateSource(b.source),
    p = profile(source);
  if (b.horizon !== p.length || canonical(b.profile) !== canonical(p))
    throw Error("Profile or horizon does not match source");
  const history = simulate({
    layout: blueprint.layout,
    rules: blueprint.rules,
    profile: p,
    horizon: p.length,
  });
  const final = history[history.length - 1];
  if (b.score !== final.score) throw Error("Score mismatch: run was changed");
  if (b.sourceFingerprint !== (await fingerprint(sourcePayload(source))))
    throw Error("Source fingerprint mismatch");
  if (b.stateFingerprint !== (await fingerprint(final)))
    throw Error("State fingerprint mismatch");
  return { blueprint, source, history, bundle: b as RunBundle };
}
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
