export const ENGINE_VERSION = "foundry-1.0.0";
export const KINDS = [
  "drill",
  "belt",
  "splitter",
  "smelter",
  "assembler",
  "warehouse",
  "battery",
] as const;
export type Kind = (typeof KINDS)[number];
export type Item = "ore" | "plate" | "pod";
export type Direction = 0 | 1 | 2 | 3; // east, south, west, north
export const CONFIG = Object.freeze({
  width: 12,
  height: 8,
  budget: 420,
  maxRules: 8,
  maxHorizon: 384,
  segmentTicks: 32,
  maxSegmentEnergy: 160,
  initialReserve: 8,
  baseStorage: 8,
  baseRate: 8,
  batteryCapacity: 64,
  batteryRate: 8,
  costs: {
    drill: 45,
    belt: 5,
    splitter: 18,
    smelter: 65,
    assembler: 85,
    warehouse: 35,
    battery: 35,
  },
  cycles: { drill: 2, smelter: 3, assembler: 4 },
  energy: { drill: 2, smelter: 3, assembler: 5 },
  inputCapacity: {
    drill: 0,
    belt: 1,
    splitter: 1,
    smelter: 4,
    assembler: 4,
    warehouse: 8,
    battery: 0,
  },
  outputCapacity: {
    drill: 3,
    belt: 1,
    splitter: 1,
    smelter: 3,
    assembler: 2,
    warehouse: 0,
    battery: 0,
  },
  recipes: {
    drill: { input: null, amount: 0, output: "ore" },
    smelter: { input: "ore", amount: 1, output: "plate" },
    assembler: { input: "plate", amount: 2, output: "pod" },
  },
} as const);
export const DELTAS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
export type Cell = {
  id: number;
  kind: Kind;
  dir: Direction;
  enabled: boolean;
  priority: number;
};
export const METRICS = [
  "battery",
  "ore",
  "plates",
  "pods",
  "supply",
  "tick",
  "segment",
] as const;
export const OPS = ["<", "<=", "==", ">=", ">"] as const;
export type Rule = {
  metric: (typeof METRICS)[number];
  op: (typeof OPS)[number];
  threshold: number;
  target: Kind | "all" | `cell:${number}`;
  action: "enable" | "disable" | "priority";
  value: number;
};
export type Blueprint = {
  format: "squeek-foundry-blueprint";
  version: 1;
  engineVersion: string;
  constants: typeof CONFIG;
  name: string;
  layout: Cell[];
  rules: Rule[];
};
export const cell = (
  x: number,
  y: number,
  kind: Kind,
  dir: Direction = 0,
  priority = 0,
): Cell => ({ id: y * 12 + x, kind, dir, enabled: true, priority });
export const cost = (layout: Cell[]) =>
  layout.reduce((n, c) => n + CONFIG.costs[c.kind], 0);
