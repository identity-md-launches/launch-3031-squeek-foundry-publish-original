import {
  CONFIG,
  ENGINE_VERSION,
  cell,
  type Blueprint,
  type Cell,
  type Rule,
} from "./config";
import { synthetic, type Source } from "./source";
const line: Cell[] = [
  cell(1, 3, "drill"),
  cell(2, 3, "belt"),
  cell(3, 3, "smelter"),
  cell(4, 3, "belt"),
  cell(5, 3, "assembler"),
  cell(6, 3, "belt"),
  cell(7, 3, "warehouse"),
];
export const makeBlueprint = (
  name: string,
  layout: Cell[],
  rules: Rule[] = [],
): Blueprint => ({
  format: "squeek-foundry-blueprint",
  version: 1,
  engineVersion: ENGINE_VERSION,
  constants: CONFIG,
  name,
  layout,
  rules,
});
export const STARTER = makeBlueprint("Starter line", [
  ...line,
  cell(2, 5, "battery"),
]);
// The second drill reaches the same smelter from above. At scarce supply it competes for bus power.
const dual = [
  ...line,
  cell(3, 1, "drill", 1),
  cell(3, 2, "belt", 1),
  cell(2, 5, "battery"),
  cell(3, 5, "battery"),
];
export const PRIORITY_RULES: Rule[] = [
  {
    metric: "tick",
    op: ">=",
    threshold: 0,
    target: "assembler",
    action: "priority",
    value: 9,
  },
  {
    metric: "tick",
    op: ">=",
    threshold: 0,
    target: "smelter",
    action: "priority",
    value: 8,
  },
  {
    metric: "ore",
    op: ">=",
    threshold: 3,
    target: "drill",
    action: "disable",
    value: 0,
  },
];
export const SOLUTIONS = [
  makeBlueprint("First Shipment solution", line),
  makeBlueprint("Buffer the Burst solution", [
    ...line,
    cell(2, 5, "battery"),
    cell(3, 5, "battery"),
    cell(4, 5, "battery"),
  ]),
  makeBlueprint("Priority Automation solution", dual, PRIORITY_RULES),
];
export type Contract = {
  id: string;
  en: string;
  zh: string;
  description: [string, string];
  source: Source;
  target: number;
  solution: Blueprint;
};
export const CONTRACTS: Contract[] = [
  {
    id: "first",
    en: "First Shipment",
    zh: "首批交货",
    description: [
      "Connect the chain. Deliver 6 pods in 128 ticks.",
      "连接生产线，在 128 刻内交付 6 个货舱。",
    ],
    source: synthetic("first", "First Shipment", [128, 128, 128, 128]),
    target: 6,
    solution: SOLUTIONS[0],
  },
  {
    id: "buffer",
    en: "Buffer the Burst",
    zh: "缓冲脉冲",
    description: [
      "Store the burst. Deliver 20 pods through the outage.",
      "储存突发电力，在断电期间继续生产，交付 20 个货舱。",
    ],
    source: synthetic("buffer", "Buffer the Burst", [160, 160, 0, 0, 160, 0]),
    target: 20,
    solution: SOLUTIONS[1],
  },
  {
    id: "priority",
    en: "Priority Automation",
    zh: "优先自动化",
    description: [
      "Use rules to beat the same layout without automation.",
      "使用规则，超越相同布局未启用自动化时的产量。",
    ],
    source: synthetic(
      "priority",
      "Priority Automation",
      [48, 48, 48, 48, 48, 48],
    ),
    target: 1,
    solution: SOLUTIONS[2],
  },
];
export const PRACTICE = synthetic(
  "practice",
  "Practice",
  [160, 80, 0, 128, 32, 160],
);
export const TUTORIAL = synthetic(
  "tutorial",
  "90-second tutorial",
  [128, 128, 128],
);
