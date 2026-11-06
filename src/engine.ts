import { CONFIG, DELTAS, type Cell, type Item, type Rule } from "./config";
export type Diagnostic =
  | "ready"
  | "working"
  | "blocked"
  | "empty"
  | "disabled"
  | "starved"
  | "storage";
export type Machine = {
  id: number;
  input: Item[];
  output: Item[];
  job: number;
  split: 0 | 1;
  enabled: boolean;
  priority: number;
  diagnostic: Diagnostic;
  lastRule: number | null;
};
export type State = {
  tick: number;
  energy: number;
  generated: number;
  spent: number;
  curtailed: number;
  starved: number;
  score: number;
  oreMade: number;
  platesMade: number;
  podsMade: number;
  machines: Machine[];
  shipments: { tick: number; pods: number }[];
  lastFired: number | null;
};
export type RunSpec = {
  layout: Cell[];
  rules: Rule[];
  profile: number[];
  horizon: number;
};
export function capacity(layout: Cell[]) {
  return (
    CONFIG.baseStorage +
    layout.filter((c) => c.kind === "battery").length * CONFIG.batteryCapacity
  );
}
export function rate(layout: Cell[], machines?: Machine[]) {
  return (
    CONFIG.baseRate +
    layout.filter(
      (c) =>
        c.kind === "battery" &&
        (machines ? machines.find((m) => m.id === c.id)?.enabled : c.enabled),
    ).length *
      CONFIG.batteryRate
  );
}
export function initial(spec: RunSpec): State {
  return {
    tick: 0,
    energy: CONFIG.initialReserve,
    generated: 0,
    spent: 0,
    curtailed: 0,
    starved: 0,
    score: 0,
    oreMade: 0,
    platesMade: 0,
    podsMade: 0,
    machines: [...spec.layout]
      .sort((a, b) => a.id - b.id)
      .map((c) => ({
        id: c.id,
        input: [],
        output: [],
        job: 0,
        split: 0,
        enabled: c.enabled,
        priority: c.priority,
        diagnostic: c.kind === "battery" ? "storage" : "ready",
        lastRule: null,
      })),
    shipments: [],
    lastFired: null,
  };
}
export function inventory(s: State) {
  const all = s.machines.flatMap((m) => [...m.input, ...m.output]);
  return {
    ore: all.filter((x) => x === "ore").length,
    plates: all.filter((x) => x === "plate").length,
    pods: all.filter((x) => x === "pod").length,
  };
}
function accepts(c: Cell, item: Item, from: number) {
  if (c.kind === "drill" || c.kind === "battery") return false;
  const [dx, dy] = DELTAS[c.dir];
  if (
    c.kind !== "warehouse" &&
    (c.id % 12) + dx === from % 12 &&
    Math.floor(c.id / 12) + dy === Math.floor(from / 12)
  )
    return false;
  if (c.kind === "splitter") {
    const [rx, ry] = DELTAS[(c.dir + 1) % 4];
    if (
      (c.id % 12) + rx === from % 12 &&
      Math.floor(c.id / 12) + ry === Math.floor(from / 12)
    )
      return false;
  }
  return c.kind === "smelter"
    ? item === "ore"
    : c.kind === "assembler"
      ? item === "plate"
      : c.kind === "warehouse"
        ? item === "pod"
        : true;
}
function compare(a: number, op: Rule["op"], b: number) {
  return op === "<"
    ? a < b
    : op === "<="
      ? a <= b
      : op === "=="
        ? a === b
        : op === ">="
          ? a >= b
          : a > b;
}
export function step(prev: State, spec: RunSpec): State {
  if (prev.tick >= spec.horizon) return prev;
  const s: State = {
    ...prev,
    tick: prev.tick + 1,
    machines: prev.machines.map((m) => ({
      ...m,
      input: [...m.input],
      output: [...m.output],
      lastRule: null,
    })),
    shipments: [...prev.shipments],
    lastFired: null,
  };
  const cells = new Map(spec.layout.map((c) => [c.id, c]));
  const nodes = new Map(s.machines.map((m) => [m.id, m]));
  const supplied = spec.profile[prev.tick] ?? 0;
  const charged = Math.min(
    supplied,
    rate(spec.layout, prev.machines),
    capacity(spec.layout) - prev.energy,
  );
  s.energy += charged;
  s.generated += supplied;
  s.curtailed += supplied - charged;
  // Read only previous queues. Free space never depends on a simultaneous outgoing transfer.
  const reservations = new Map<number, number>();
  const intents: { from: number; to: number; item: Item }[] = [];
  for (const old of prev.machines) {
    const c = cells.get(old.id)!;
    const m = nodes.get(old.id)!;
    const q =
      c.kind === "belt" || c.kind === "splitter" ? old.input : old.output;
    if (
      !old.enabled ||
      !q.length ||
      c.kind === "warehouse" ||
      c.kind === "battery"
    )
      continue;
    const dir = c.kind === "splitter" ? (c.dir + old.split) % 4 : c.dir;
    const [dx, dy] = DELTAS[dir];
    const x = (c.id % 12) + dx,
      y = Math.floor(c.id / 12) + dy;
    const target =
      x >= 0 && x < 12 && y >= 0 && y < 8 ? cells.get(y * 12 + x) : undefined;
    if (!target || !accepts(target, q[0], c.id)) {
      m.diagnostic = "blocked";
      continue;
    }
    const targetOld = prev.machines.find((n) => n.id === target.id)!;
    const reserved = reservations.get(target.id) ?? 0;
    if (
      targetOld.input.length + reserved >=
      CONFIG.inputCapacity[target.kind]
    ) {
      m.diagnostic = "blocked";
      continue;
    }
    reservations.set(target.id, reserved + 1);
    intents.push({ from: c.id, to: target.id, item: q[0] });
  }
  for (const intent of intents) {
    const c = cells.get(intent.from)!;
    const m = nodes.get(intent.from)!;
    (c.kind === "belt" || c.kind === "splitter" ? m.input : m.output).shift();
    if (c.kind === "splitter") m.split = m.split === 0 ? 1 : 0;
    m.diagnostic = "ready";
  }
  for (const intent of intents) nodes.get(intent.to)!.input.push(intent.item);
  // Rules all see the same post-transfer snapshot. Later matching rules override earlier fields.
  const inv = inventory(s);
  const values = {
    ...inv,
    battery: Math.floor((s.energy * 100) / capacity(spec.layout)),
    supply: supplied,
    tick: prev.tick,
    segment: Math.floor(prev.tick / CONFIG.segmentTicks) + 1,
  };
  for (const m of s.machines) {
    const c = cells.get(m.id)!;
    m.enabled = c.enabled;
    m.priority = c.priority;
  }
  spec.rules.forEach((rule, index) => {
    if (!compare(values[rule.metric], rule.op, rule.threshold)) return;
    s.lastFired = index;
    for (const m of s.machines) {
      const c = cells.get(m.id)!;
      if (
        rule.target !== "all" &&
        rule.target !== c.kind &&
        rule.target !== `cell:${m.id}`
      )
        continue;
      if (rule.action === "priority") m.priority = rule.value;
      else m.enabled = rule.action === "enable";
      m.lastRule = index;
    }
  });
  let available = Math.min(s.energy, rate(spec.layout, s.machines));
  for (const m of [...s.machines].sort(
    (a, b) => b.priority - a.priority || a.id - b.id,
  )) {
    const c = cells.get(m.id)!;
    if (!m.enabled) {
      m.diagnostic = "disabled";
      continue;
    }
    if (c.kind === "warehouse") {
      const n = m.input.length;
      m.input = [];
      s.score += n;
      if (n) s.shipments.push({ tick: s.tick, pods: n });
      m.diagnostic = n ? "working" : "empty";
      continue;
    }
    if (c.kind === "battery") {
      m.diagnostic = "storage";
      continue;
    }
    if (c.kind === "belt" || c.kind === "splitter") {
      m.diagnostic = !m.input.length
        ? "empty"
        : m.diagnostic === "blocked"
          ? "blocked"
          : "ready";
      continue;
    }
    if (m.job > 0) {
      m.job--;
      m.diagnostic = "working";
      if (m.job === 0) {
        const output = CONFIG.recipes[c.kind].output;
        m.output.push(output);
        if (c.kind === "drill") s.oreMade++;
        if (c.kind === "smelter") s.platesMade++;
        if (c.kind === "assembler") s.podsMade++;
      }
      continue;
    }
    const recipe = CONFIG.recipes[c.kind];
    if (m.output.length >= CONFIG.outputCapacity[c.kind]) {
      m.diagnostic = "blocked";
      continue;
    }
    if (m.input.length < recipe.amount) {
      m.diagnostic = "empty";
      continue;
    }
    const energy = CONFIG.energy[c.kind];
    if (energy > available) {
      m.diagnostic = "starved";
      s.starved++;
      continue;
    }
    // Consume recipe and full job energy atomically; job reserves its output slot.
    available -= energy;
    s.energy -= energy;
    s.spent += energy;
    m.input.splice(0, recipe.amount);
    m.job = CONFIG.cycles[c.kind];
    m.diagnostic = "working";
  }
  return s;
}
export function simulate(spec: RunSpec): State[] {
  const history = [initial(spec)];
  for (let i = 0; i < spec.horizon; i++)
    history.push(step(history[history.length - 1], spec));
  return history;
}
export function audit(s: State, spec: RunSpec): string[] {
  const errors: string[] = [];
  if (s.generated + CONFIG.initialReserve !== s.spent + s.energy + s.curtailed)
    errors.push("Energy conservation");
  if (s.energy < 0 || s.energy > capacity(spec.layout))
    errors.push("Energy bounds");
  const inv = inventory(s);
  let oreInJobs = 0,
    platesInJobs = 0;
  for (const m of s.machines) {
    const c = spec.layout.find((c) => c.id === m.id)!;
    if (
      m.input.length > CONFIG.inputCapacity[c.kind] ||
      m.output.length > CONFIG.outputCapacity[c.kind]
    )
      errors.push("Buffer bound");
    if (m.job && c.kind === "smelter") oreInJobs++;
    if (m.job && c.kind === "assembler") platesInJobs += 2;
  }
  if (s.oreMade !== inv.ore + s.platesMade + oreInJobs)
    errors.push("Ore conservation");
  if (s.platesMade !== inv.plates + s.podsMade * 2 + platesInJobs)
    errors.push("Plate conservation");
  if (s.podsMade !== inv.pods + s.score) errors.push("Pod conservation");
  return errors;
}
