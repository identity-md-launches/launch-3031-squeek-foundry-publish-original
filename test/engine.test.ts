import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { CONFIG, cell, type Cell } from "../src/config.ts";
import { simulate, audit, initial, step, type RunSpec } from "../src/engine.ts";
import { CONTRACTS, SOLUTIONS, makeBlueprint } from "../src/presets.ts";
import {
  profile,
  energies,
  batch,
  validateSource,
  historical,
  parseStatus,
  parseEconomy,
} from "../src/source.ts";
import {
  bundle,
  importRun,
  validateBlueprint,
  parseJSON,
  canonical,
} from "../src/serialization.ts";
const spec = (layout: Cell[], p = Array(192).fill(2), rules = []) =>
  ({ layout, rules, profile: p, horizon: p.length }) as RunSpec;
test("all shipped solutions conserve energy/items every tick", () => {
  for (const c of CONTRACTS) {
    const p = profile(c.source);
    const s = {
      layout: c.solution.layout,
      rules: c.solution.rules,
      profile: p,
      horizon: p.length,
    };
    const h = simulate(s);
    for (const state of h) assert.deepEqual(audit(state, s), []);
    console.log(c.en, h.at(-1)!.score, "target", c.target);
    if (c.id !== "priority") assert.ok(h.at(-1)!.score >= c.target);
  }
});
test("automation improves the identical priority layout", () => {
  const c = CONTRACTS[2],
    p = profile(c.source),
    s = {
      layout: c.solution.layout,
      rules: c.solution.rules,
      profile: p,
      horizon: p.length,
    };
  const yes = simulate(s).at(-1)!,
    no = simulate({ ...s, rules: [] }).at(-1)!;
  console.log("Automation measured:", yes.score, no.score);
  assert.ok(yes.score > no.score);
});
test("full cyclic belts remain safe; no rotating into unavailable space", () => {
  const s = spec([
    cell(1, 1, "belt", 0),
    cell(2, 1, "belt", 1),
    cell(2, 2, "belt", 2),
    cell(1, 2, "belt", 3),
  ]);
  const a = initial(s);
  a.machines.forEach((m) => (m.input = ["ore"]));
  const b = step(a, s);
  assert.deepEqual(
    b.machines.map((m) => m.input),
    a.machines.map((m) => m.input),
  );
});
test("conflicting intents use stable cell ids and no multi-hop", () => {
  const s = spec([
    cell(2, 1, "belt", 1),
    cell(1, 2, "belt"),
    cell(2, 2, "belt"),
    cell(3, 2, "belt"),
  ]);
  const a = initial(s);
  a.machines[0].input = ["plate"];
  a.machines[1].input = ["ore"];
  const b = step(a, s);
  assert.deepEqual(b.machines.find((m) => m.id === 26)!.input, ["plate"]);
  assert.deepEqual(b.machines.find((m) => m.id === 25)!.input, ["ore"]);
  assert.deepEqual(b.machines.find((m) => m.id === 27)!.input, []);
});
test("splitter advances only on successful transfer", () => {
  const s = spec([cell(1, 1, "splitter"), cell(1, 2, "belt")]);
  const a = initial(s);
  a.machines[0].input = ["ore"];
  const b = step(a, s);
  assert.equal(b.machines[0].split, 0);
  assert.equal(b.machines[0].input.length, 1);
});
test("last matching ordered rule wins and priority controls allocation", () => {
  const s = spec([cell(1, 1, "drill"), cell(2, 1, "drill")], Array(4).fill(0));
  s.rules = [
    {
      metric: "tick",
      op: ">=",
      threshold: 0,
      target: "cell:14",
      action: "priority",
      value: 9,
    },
    {
      metric: "tick",
      op: ">=",
      threshold: 0,
      target: "cell:13",
      action: "disable",
      value: 0,
    },
  ];
  const a = initial(s);
  a.energy = 2;
  const b = step(a, s);
  assert.equal(b.machines[0].diagnostic, "disabled");
  assert.ok(b.machines[1].job > 0);
  assert.equal(b.lastFired, 1);
});
const record = (work: string, index = "1") => ({
  transactionHash: "0x" + "a".repeat(64),
  ethereumBlockNumber: "100",
  logIndex: index,
  blockTimestamp: "2026-11-06T00:00:00.000Z",
  confirmationStatus: "safe" as const,
  workAdded: work,
  previousSettledThroughRound: "1",
  settledThroughRound: "4",
  activeRoundCount: "2",
});
test("zero/huge work normalize as BigInt without overflow", () => {
  assert.deepEqual(energies([record("0"), record("0", "2")]), [0, 0]);
  const huge = "9".repeat(90);
  assert.deepEqual(energies([record(huge), record("0", "2")]), [160, 0]);
  for (const e of [0, 1, 37, 160]) {
    const p = profile({
      kind: "synthetic",
      mode: "test",
      label: "test",
      segmentEnergy: [e, e],
      records: [],
      trusted: false,
    });
    assert.equal(
      p.slice(0, 32).reduce((a, b) => a + b, 0),
      e,
    );
  }
});
test("unsafe and duplicate import records are rejected", () => {
  assert.throws(() => batch({ ...record("1"), confirmationStatus: "pending" }));
  assert.throws(() =>
    validateSource({
      kind: "historical",
      mode: "historical",
      label: "test",
      records: [record("1"), record("1")],
    }),
  );
});
test("deterministic replay and bundle verification reject tampered score/state/profile", async () => {
  const c = CONTRACTS[0];
  const b = await bundle(c.solution, c.source);
  const a = await importRun(b),
    again = await importRun(JSON.parse(JSON.stringify(b)));
  assert.equal(canonical(a.history), canonical(again.history));
  for (const change of [
    { score: b.score + 1 },
    { stateFingerprint: "bad" },
    { sourceFingerprint: "bad" },
    { horizon: 1 },
    { profile: [] },
  ])
    await assert.rejects(() => importRun({ ...b, ...change }));
});
test("malformed imports: size, bounds, duplicate, enums, budgets, rules, constants", () => {
  assert.throws(() => parseJSON("x".repeat(131073)));
  assert.throws(() => parseJSON("{"));
  const b = SOLUTIONS[0];
  for (const change of [
    { layout: [{ ...b.layout[0], id: 96 }] },
    { layout: [b.layout[0], b.layout[0]] },
    { layout: [{ ...b.layout[0], kind: "reactor" }] },
    { layout: Array.from({ length: 8 }, (_, i) => cell(i, 1, "assembler")) },
    { constants: {} },
    { rules: Array(9).fill({}) },
    {
      rules: [
        {
          metric: "tick",
          op: ">=",
          threshold: -1,
          target: "all",
          action: "enable",
          value: 0,
        },
      ],
    },
  ])
    assert.throws(() => validateBlueprint({ ...b, ...change }));
});

test("batteries materially buffer the same synthetic burst", () => {
  const c = CONTRACTS[1],
    p = profile(c.source),
    s = { layout: c.solution.layout, rules: [], profile: p, horizon: p.length };
  const withStorage = simulate(s).at(-1)!,
    without = simulate({
      ...s,
      layout: s.layout.filter((c) => c.kind !== "battery"),
    }).at(-1)!;
  assert.ok(withStorage.score > without.score);
  assert.ok(withStorage.curtailed < without.curtailed);
  console.log(
    "Storage measured:",
    withStorage.score,
    without.score,
    withStorage.curtailed,
    without.curtailed,
  );
});
test("current captured API schemas, safe filtering, latest ordering and installation gates", () => {
  const fixture = JSON.parse(
    readFileSync("test/fixtures/api-snapshot.json", "utf8"),
  );
  const status = parseStatus(fixture.status),
    economy = parseEconomy(fixture.economy);
  const source = historical(status, economy, fixture.settlements, 6);
  assert.equal(source.records.length, 6);
  assert.equal(source.chainId, "11155111");
  for (let i = 1; i < source.records.length; i++)
    assert.ok(
      BigInt(source.records[i].ethereumBlockNumber) >=
        BigInt(source.records[i - 1].ethereumBlockNumber),
    );
  const p = profile(source);
  assert.equal(p.length, 192);
  assert.equal(Math.max(...source.segmentEnergy), 160);
  assert.throws(() =>
    historical(
      { ...status, installationId: "different" },
      economy,
      fixture.settlements,
      6,
    ),
  );
  assert.throws(() =>
    historical(
      status,
      economy,
      {
        ...fixture.settlements,
        chain: { ...fixture.settlements.chain, chainId: "1" },
      },
      6,
    ),
  );
  const duplicate = {
    ...fixture.settlements,
    recentSettlements: [
      ...fixture.settlements.recentSettlements,
      fixture.settlements.recentSettlements[0],
      {
        ...fixture.settlements.recentSettlements[0],
        confirmationStatus: "pending",
      },
    ],
  };
  const deduped = historical(status, economy, duplicate, 12);
  assert.equal(
    deduped.records.length,
    fixture.settlements.recentSettlements.length,
  );
  const insufficient = {
    ...fixture.settlements,
    recentSettlements: fixture.settlements.recentSettlements.slice(0, 1),
  };
  assert.throws(() => historical(status, economy, insufficient, 6));
  assert.equal(
    parseStatus({ ...fixture.status, additiveField: "fine" }).installationId,
    status.installationId,
  );
});
test("atomic start waits for energy and output space without consuming input", () => {
  const s = spec([cell(1, 1, "smelter")], Array(10).fill(0));
  let a = initial(s);
  a.energy = 0;
  a.machines[0].input = ["ore"];
  const b = step(a, s);
  assert.deepEqual(b.machines[0].input, ["ore"]);
  assert.equal(b.machines[0].job, 0);
  assert.equal(b.spent, 0);
  a = initial(s);
  a.machines[0].input = ["ore"];
  a.machines[0].output = ["plate", "plate", "plate"];
  const c = step(a, s);
  assert.deepEqual(c.machines[0].input, ["ore"]);
  assert.equal(c.spent, 0);
});
test("disabled conveyor retains its item", () => {
  const s = spec([
    { ...cell(1, 1, "belt"), enabled: false },
    cell(2, 1, "belt"),
  ]);
  const a = initial(s);
  a.machines[0].input = ["ore"];
  const b = step(a, s);
  assert.deepEqual(b.machines[0].input, ["ore"]);
  assert.deepEqual(b.machines[1].input, []);
});
test("pure step does not mutate frozen previous state or spec", () => {
  const s = spec(SOLUTIONS[0].layout);
  const a = initial(s);
  const freeze = (v: any) => {
    if (v && typeof v === "object") {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
    return v;
  };
  freeze(s);
  freeze(a);
  assert.equal(step(a, s).tick, 1);
  assert.equal(a.tick, 0);
});
test("deterministic randomized layouts have no conservation or negative-buffer faults", () => {
  let seed = 1837;
  const random = (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  for (let k = 0; k < 40; k++) {
    const used = new Set<number>();
    let budget = 420;
    const layout: Cell[] = [];
    for (let i = 0; i < 25; i++) {
      const id = random(96),
        kind = (
          [
            "drill",
            "belt",
            "splitter",
            "smelter",
            "assembler",
            "warehouse",
            "battery",
          ] as const
        )[random(7)];
      if (used.has(id) || CONFIG.costs[kind] > budget) continue;
      used.add(id);
      budget -= CONFIG.costs[kind];
      layout.push({
        ...cell(id % 12, Math.floor(id / 12), kind, random(4) as 0 | 1 | 2 | 3),
        priority: random(10),
      });
    }
    const s = spec(
      layout,
      Array.from({ length: 128 }, () => random(6)),
    );
    for (const state of simulate(s)) assert.deepEqual(audit(state, s), []);
  }
});

test("splitter rejects input on its output branch and alternates successful branches", () => {
  const s = spec([cell(2, 2, "splitter"), cell(2, 3, "belt", 3)]);
  let a = initial(s);
  a.machines.find((m) => m.id === 38)!.input = ["ore"];
  let b = step(a, s);
  assert.equal(b.machines.find((m) => m.id === 26)!.input.length, 0);
  assert.equal(b.machines.find((m) => m.id === 38)!.input.length, 1);
  const s2 = spec([
    cell(1, 1, "splitter"),
    cell(2, 1, "belt"),
    cell(1, 2, "belt"),
  ]);
  a = initial(s2);
  a.machines[0].input = ["ore"];
  b = step(a, s2);
  assert.equal(b.machines[0].split, 1);
  assert.deepEqual(b.machines[1].input, ["ore"]);
});
