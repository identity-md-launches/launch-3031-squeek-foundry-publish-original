import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import {
  CONFIG,
  ENGINE_VERSION,
  KINDS,
  METRICS,
  OPS,
  cost,
  type Blueprint,
  type Cell,
  type Kind,
  type Rule,
  type Direction,
} from "./config";
import {
  initial,
  step,
  simulate,
  inventory,
  capacity,
  type State,
  type RunSpec,
  type Diagnostic,
} from "./engine";
import {
  STARTER,
  SOLUTIONS,
  CONTRACTS,
  PRACTICE,
  TUTORIAL,
  makeBlueprint,
} from "./presets";
import { profile, historical, txURL, type Source } from "./source";
import {
  bundle,
  canonical,
  download,
  fingerprint,
  sourcePayload,
  parseJSON,
  validateBlueprint,
  validateRules,
  importRun,
} from "./serialization";
import { MachineArt, ItemArt, BrandMark, Icon } from "./art";
import { useLive } from "./live";
import { exportPNG } from "./png";
type Lang = "en" | "zh";
type Phase = "edit" | "running" | "paused" | "finished";
const moduleNames: Record<Kind, [string, string]> = {
  drill: ["Drill", "采矿机"],
  belt: ["Conveyor", "传送带"],
  splitter: ["Splitter", "分流器"],
  smelter: ["Smelter", "熔炉"],
  assembler: ["Assembler", "组装机"],
  warehouse: ["Warehouse", "仓库"],
  battery: ["Battery", "电池"],
};
const diagnosticNames: Record<Diagnostic, [string, string]> = {
  ready: ["Ready", "就绪"],
  working: ["Working", "运行中"],
  blocked: ["Blocked output", "出口堵塞"],
  empty: ["Empty input", "缺少输入"],
  disabled: ["Disabled", "已停用"],
  starved: ["Power starvation", "电力不足"],
  storage: ["Bus storage", "电网储能"],
};
const metricNames: Record<Rule["metric"], [string, string]> = {
  battery: ["Battery %", "电量 %"],
  ore: ["Stored ore", "存储矿石"],
  plates: ["Stored plates", "存储金属板"],
  pods: ["Stored pods", "存储货舱"],
  supply: ["Supply / tick", "每刻供电"],
  tick: ["Tick (from 0)", "刻（从 0 开始）"],
  segment: ["Segment (from 1)", "分段（从 1 开始）"],
};
const getStored = (): Blueprint => {
  try {
    const raw = localStorage.getItem("squeek-foundry.blueprint");
    if (raw) return validateBlueprint(parseJSON(raw));
  } catch {
    /* Recovery starts with the complete starter. */
  }
  return structuredClone(STARTER);
};
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={
            document.documentElement.lang === "zh-CN" ? "关闭" : "Close"
          }
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = (en: string, zh: string) => (lang === "en" ? en : zh);
  const n = (kind: Kind) => moduleNames[kind][lang === "en" ? 0 : 1];
  const [blueprint, setBlueprint] = useState<Blueprint>(getStored);
  const [source, setSource] = useState<Source>(structuredClone(PRACTICE));
  const [phase, setPhase] = useState<Phase>("edit");
  const [history, setHistory] = useState<State[]>([]);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<Kind | "select" | "delete">("select");
  const [direction, setDirection] = useState<Direction>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [focusCell, setFocusCell] = useState(37);
  const [undo, setUndo] = useState<Blueprint[]>([]),
    [redo, setRedo] = useState<Blueprint[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panel, setPanel] = useState<"inspector" | "rules" | "source">(
    "inspector",
  );
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<
    "contracts" | "tutorial" | "json" | "results" | null
  >(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [json, setJSON] = useState("");
  const [jsonMode, setJSONMode] = useState<"import" | "export">("import");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [batchCount, setBatchCount] = useState(6);
  const [best, setBest] = useState<number | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width:1000px)").matches,
  );
  const inspectorRef = useRef<HTMLDivElement>(null);
  const live = useLive(retry);
  const boardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const p = useMemo(() => profile(source), [source]);
  const spec: RunSpec = useMemo(
    () => ({
      layout: blueprint.layout,
      rules: blueprint.rules,
      profile: p,
      horizon: p.length,
    }),
    [blueprint, p],
  );
  const state = history[cursor] ?? initial(spec);
  const inv = inventory(state);
  const editing = phase === "edit";
  const selectedCell = blueprint.layout.find((c) => c.id === selected);
  const selectedMachine = state.machines.find((m) => m.id === selected);
  const reference = useMemo(
    () => simulate({ ...spec, layout: STARTER.layout, rules: [] }).at(-1)!,
    [spec],
  );
  const withoutRules = useMemo(
    () => simulate({ ...spec, rules: [] }).at(-1)!,
    [spec],
  );
  const sourceIsTrusted =
    source.trusted && networkOnline && !live.settlements.error;
  const changed =
    source.kind === "historical" &&
    ((live.status.data &&
      source.installationId !== live.status.data.installationId) ||
      (live.economy.data &&
        (source.releaseId !== live.economy.data.releaseId ||
          source.protocolRevision !== live.economy.data.protocolRevision ||
          source.rewardModelRevision !==
            live.economy.data.rewardModelRevision ||
          source.installationId !== live.economy.data.installationId ||
          source.chainId !== live.economy.data.chainId)));
  const contract = CONTRACTS.find((c) => c.id === source.mode);
  useEffect(() => {
    const update = () => setNetworkOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const mq = matchMedia("(max-width:1000px)");
    const update = () => setNarrow(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!drawer || !narrow) return;
    const previous = document.activeElement as HTMLElement;
    const aside = inspectorRef.current;
    if (!aside) return;
    const blocked = [
      ...document.querySelectorAll<HTMLElement>(
        ".site-header,.skip-link,main > :not(.factory-layout),.factory-layout > :not(.inspector)",
      ),
    ];
    blocked.forEach((el) => (el.inert = true));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [
        ...aside.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a,input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary",
        ),
      ].filter((el) => el.getClientRects().length);
    focusables()[0]?.focus();
    const key = (e: globalThis.KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setDrawer(false);
      }
      if (e.key === "Tab") {
        const all = focusables(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      blocked.forEach((el) => (el.inert = false));
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [drawer, narrow]);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "squeek-foundry.blueprint",
        JSON.stringify(blueprint),
      );
    } catch {
      setMessage(
        t(
          "Local storage is unavailable. Export JSON to keep your factory.",
          "无法使用本地存储。请导出 JSON 保存工厂。",
        ),
      );
    }
  }, [blueprint]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => setOfflineReady(true))
        .catch(() => setOfflineReady(false));
  }, []);
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(
      () =>
        setHistory((h) => {
          const previous = h.at(-1) ?? initial(spec);
          const next = step(previous, spec);
          return next === previous ? h : [...h, next];
        }),
      250 / speed,
    );
    return () => clearInterval(timer);
  }, [phase, speed, spec]);
  useEffect(() => {
    if (phase === "running") {
      setCursor(history.length - 1);
      if (history.at(-1)?.tick === p.length) {
        setPhase("finished");
        setModal("results");
      }
    }
  }, [history, phase, p.length]);
  useEffect(() => {
    let active = true;
    setBest(null);
    void fingerprint(sourcePayload(source))
      .then((key) => {
        if (!active) return;
        try {
          const raw = localStorage.getItem(
            `squeek-foundry.best:${ENGINE_VERSION}:${source.kind}:${source.mode}:${key}`,
          );
          if (raw && /^\d+$/.test(raw)) setBest(Number(raw));
        } catch {}
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [source]);
  useEffect(() => {
    if (phase !== "finished" || !history.length) return;
    const final = history.at(-1)!;
    void fingerprint(sourcePayload(source))
      .then((key) => {
        try {
          const storageKey = `squeek-foundry.best:${ENGINE_VERSION}:${source.kind}:${source.mode}:${key}`,
            old = Number(localStorage.getItem(storageKey) || 0),
            value = Math.max(old, final.score);
          localStorage.setItem(storageKey, String(value));
          setBest(value);
        } catch {
          setMessage(
            t(
              "Result is not saved. Export the run bundle.",
              "成绩未保存，请导出运行包。",
            ),
          );
        }
      })
      .catch(() => {});
  }, [phase, history, source]);
  const announce = (en: string, zh: string) => setMessage(t(en, zh));
  function resetRun() {
    setPhase("edit");
    setHistory([]);
    setCursor(0);
  }
  function change(next: Blueprint) {
    if (!editing) return;
    try {
      const valid = validateBlueprint(next);
      setUndo((u) => [...u.slice(-39), structuredClone(blueprint)]);
      setRedo([]);
      setBlueprint(valid);
    } catch (e) {
      announce(
        `Cannot edit: ${e instanceof Error ? e.message : "Invalid layout"}`,
        "无法修改：布局、预算或规则无效。",
      );
    }
  }
  function chooseMode(next: Source, layout?: Blueprint) {
    resetRun();
    setSource(structuredClone(next));
    if (layout) setBlueprint(structuredClone(layout));
    setUndo([]);
    setRedo([]);
    setSelected(null);
    setModal(null);
    setMessage("");
  }
  function begin() {
    if (changed) {
      announce(
        "Installation or release changed. Select a new historical source.",
        "安装或版本已更改，请重新选择历史来源。",
      );
      return;
    }
    setHistory([initial(spec)]);
    setCursor(0);
    setPhase("running");
    setMessage("");
  }
  function doStep() {
    if (editing) {
      if (changed) return;
      const start = initial(spec);
      setHistory([start, step(start, spec)]);
      setCursor(1);
      setPhase(p.length === 1 ? "finished" : "paused");
      return;
    }
    if (phase !== "paused") return;
    const next = step(history.at(-1)!, spec);
    setHistory((h) => [...h, next]);
    setCursor(history.length);
    if (next.tick === p.length) {
      setPhase("finished");
      setModal("results");
    }
  }
  function clickCell(id: number) {
    setFocusCell(id);
    setSelected(id);
    const occupied = blueprint.layout.find((c) => c.id === id);
    if (!editing) {
      setPanel("inspector");
      return;
    }
    if (tool === "select") {
      setPanel("inspector");
      if (occupied && innerWidth < 1000) setDrawer(true);
      return;
    }
    if (tool === "delete") {
      if (occupied)
        change({
          ...blueprint,
          layout: blueprint.layout.filter((c) => c.id !== id),
          rules: blueprint.rules.filter((r) => r.target !== `cell:${id}`),
        });
      return;
    }
    if (occupied) {
      announce(
        "That cell is occupied. Select it to rotate or remove it.",
        "该格已被占用，请选择后旋转或删除。",
      );
      return;
    }
    if (cost(blueprint.layout) + CONFIG.costs[tool] > CONFIG.budget) {
      announce(
        "Not enough credits. Remove a module or choose a cheaper one.",
        "信用点不足，请移除模块或选择更便宜的模块。",
      );
      return;
    }
    change({
      ...blueprint,
      layout: [
        ...blueprint.layout,
        { id, kind: tool, dir: direction, enabled: true, priority: 0 },
      ],
    });
  }
  function rotate() {
    if (!editing) return;
    if (selectedCell && tool === "select")
      change({
        ...blueprint,
        layout: blueprint.layout.map((c) =>
          c.id === selected ? { ...c, dir: ((c.dir + 1) % 4) as Direction } : c,
        ),
      });
    else setDirection((d) => ((d + 1) % 4) as Direction);
  }
  function keyCell(e: KeyboardEvent<HTMLButtonElement>, id: number) {
    let next = id;
    if (e.key === "ArrowRight") next = Math.min(95, id + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, id - 1);
    else if (e.key === "ArrowDown") next = Math.min(95, id + 12);
    else if (e.key === "ArrowUp") next = Math.max(0, id - 12);
    else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      setSelected(id);
      if (editing) {
        const c = blueprint.layout.find((c) => c.id === id);
        if (c)
          change({
            ...blueprint,
            layout: blueprint.layout.map((c) =>
              c.id === id ? { ...c, dir: ((c.dir + 1) % 4) as Direction } : c,
            ),
          });
      }
      return;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (editing)
        change({
          ...blueprint,
          layout: blueprint.layout.filter((c) => c.id !== id),
          rules: blueprint.rules.filter((r) => r.target !== `cell:${id}`),
        });
      return;
    } else return;
    e.preventDefault();
    setFocusCell(next);
    boardRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
      ?.focus();
  }
  async function exportJSON(run = false) {
    try {
      const value = run
        ? await bundle(blueprint, { ...source, trusted: sourceIsTrusted })
        : blueprint;
      const text = JSON.stringify(value, null, 2);
      setJSON(text);
      setJSONMode("export");
      setModal("json");
    } catch {
      announce(
        "SHA-256 is unavailable in this browser context. Use HTTPS or localhost.",
        "当前浏览器无法使用 SHA-256，请使用 HTTPS 或 localhost。",
      );
    }
  }
  async function doImport(text = json) {
    try {
      const raw = parseJSON(text);
      if (
        raw &&
        typeof raw === "object" &&
        "format" in raw &&
        raw.format === "squeek-foundry-run"
      ) {
        const result = await importRun(raw);
        setBlueprint(result.blueprint);
        setSource(result.source);
        setHistory(result.history);
        setCursor(result.history.length - 1);
        setPhase("finished");
        setModal("results");
        announce(
          "Replay matches locally. Imported source is untrusted; this is not authenticated verification.",
          "回放在本地一致。导入来源不受信任，此结果不代表身份或官方验证。",
        );
      } else {
        const valid = validateBlueprint(raw);
        resetRun();
        setBlueprint(valid);
        setUndo([]);
        setRedo([]);
        setModal(null);
        announce(
          "Blueprint imported. The current electricity source is unchanged.",
          "蓝图已导入，当前电力来源保持不变。",
        );
      }
    } catch (e) {
      announce(
        `Import rejected: ${e instanceof Error ? e.message : "Invalid JSON"}`,
        "导入被拒绝：格式、大小、版本、来源、分数或指纹不符合要求。",
      );
    }
  }
  function selectHistory() {
    try {
      if (!live.status.data || !live.economy.data || !live.settlements.data)
        throw Error("Waiting for the three API responses");
      if (live.status.error || live.economy.error || live.settlements.error)
        throw Error("Refresh failed; retry before selecting a snapshot");
      const next = historical(
        live.status.data,
        live.economy.data,
        live.settlements.data,
        batchCount,
      );
      chooseMode(next);
      setPanel("source");
      announce(
        `Pinned ${next.records.length} safe batches. Live observations cannot change this shift.`,
        `已固定 ${next.records.length} 个安全批次，实时观测不会改变本班次。`,
      );
    } catch (e) {
      announce(
        e instanceof Error ? e.message : "Source unavailable",
        "历史来源不可用或安全批次不足，请重试或选择合成练习。",
      );
    }
  }
  function updateRule(index: number, patch: Partial<Rule>) {
    if (!editing) return;
    try {
      const rules = blueprint.rules.map((r, i) =>
        i === index ? { ...r, ...patch } : r,
      );
      validateRules(rules, blueprint.layout);
      change({ ...blueprint, rules });
    } catch {
      announce(
        "Invalid rule. Thresholds must be integers from 0 to 100000.",
        "规则无效，阈值必须为 0 至 100000 的整数。",
      );
    }
  }
  const final = history.at(-1);
  const sourceName =
    source.kind === "historical"
      ? t("Historical Shift", "历史班次")
      : source.mode === "practice"
        ? t("Practice", "练习")
        : source.mode === "tutorial"
          ? t("90-second tutorial", "90 秒教程")
          : contract
            ? t(contract.en, contract.zh)
            : source.label;
  const liveData = live.status.data;
  const stale =
    liveData &&
    (Date.now() - Date.parse(liveData.observedAt) >
      liveData.staleAfterSeconds * 1000 ||
      liveData.freshness !== "online");
  const liveLabel = live.status.error
    ? t("Offline", "离线")
    : !liveData
      ? t("Connecting", "连接中")
      : stale
        ? t("Stale", "已过期")
        : liveData.coreStatus === "IDLE"
          ? t("Wheel idle", "跑轮空闲")
          : t("Wheel active", "跑轮运行");
  const recipeText = (kind: Kind) =>
    kind === "drill"
      ? t(
          `Makes 1 ore · ${CONFIG.energy.drill} energy · start + ${CONFIG.cycles.drill} work ticks`,
          `产出 1 矿石 · ${CONFIG.energy.drill} 电力 · 启动 + ${CONFIG.cycles.drill} 加工刻`,
        )
      : kind === "smelter"
        ? t(
            `1 ore → 1 plate · ${CONFIG.energy.smelter} energy · start + ${CONFIG.cycles.smelter} work ticks`,
            `1 矿石 → 1 金属板 · ${CONFIG.energy.smelter} 电力 · 启动 + ${CONFIG.cycles.smelter} 加工刻`,
          )
        : kind === "assembler"
          ? t(
              `${CONFIG.recipes.assembler.amount} plates → 1 pod · ${CONFIG.energy.assembler} energy · start + ${CONFIG.cycles.assembler} work ticks`,
              `${CONFIG.recipes.assembler.amount} 金属板 → 1 货舱 · ${CONFIG.energy.assembler} 电力 · 启动 + ${CONFIG.cycles.assembler} 加工刻`,
            )
          : kind === "battery"
            ? t(
                `+${CONFIG.batteryCapacity} bus capacity · +${CONFIG.batteryRate} charge/discharge per tick`,
                `电网容量 +${CONFIG.batteryCapacity} · 每刻充放电上限 +${CONFIG.batteryRate}`,
              )
            : kind === "warehouse"
              ? t(
                  "Accepts pods. Each delivered pod scores one point.",
                  "接收货舱，每交付一个得 1 分。",
                )
              : kind === "splitter"
                ? t(
                    "Alternates forward/right only after a successful transfer. Capacity 1.",
                    "在成功传送后交替使用前方与右侧出口，容量为 1。",
                  )
                : t(
                    "Moves 1 item per tick. Capacity 1. No multi-hop transfers.",
                    "每刻移动 1 个物品，容量为 1，同一刻不连续跨格。",
                  );
  return (
    <>
      <a className="skip-link" href="#workshop">
        {t("Skip to workshop", "跳转到车间")}
      </a>
      <header className="site-header">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Squeek Foundry</h1>
            <span>
              {t("A little factory. A real wheel.", "小小工厂，真实跑轮。")}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <a
            href="https://squeekchain.com/genesis/code"
            target="_blank"
            rel="noreferrer"
            className="genesis-link"
          >
            Genesis Code ↗
          </a>
          <button
            className="quiet"
            onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
            aria-label={t(
              "简体中文 · Switch to Simplified Chinese",
              "English · 切换到英语",
            )}
          >
            {lang === "en" ? "简体中文" : "English"}
          </button>
          <button
            className="icon-button"
            aria-label={t("Open tutorial", "打开教程")}
            onClick={() => {
              setTutorialStep(0);
              setModal("tutorial");
            }}
          >
            <Icon name="help" />
          </button>
        </div>
      </header>
      <main id="workshop">
        <div className="workshop-heading">
          <div className="workshop-title">
            <h2>{t("The workshop", "工厂车间")}</h2>
            <span className="mode-tag">
              {source.kind === "historical"
                ? t("Pinned API history", "固定 API 历史")
                : t("Synthetic training", "合成训练")}
            </span>
          </div>
          <div className="mode-actions">
            <button className="quiet" onClick={() => setModal("contracts")}>
              {sourceName}
              <span aria-hidden="true">⌄</span>
            </button>
            <button
              className="quiet"
              onClick={() => {
                setPanel("source");
                setDrawer(true);
              }}
            >
              <span
                className={`live-dot ${live.status.error ? "offline" : ""}`}
              />
              {liveLabel}
            </button>
          </div>
        </div>
        <div className="command-bar">
          <div className="run-actions">
            {editing ? (
              <button className="primary" onClick={begin} disabled={!!changed}>
                <Icon name="play" />
                {t("Run factory", "运行工厂")}
              </button>
            ) : phase === "running" ? (
              <button className="primary" onClick={() => setPhase("paused")}>
                <Icon name="pause" />
                {t("Pause", "暂停")}
              </button>
            ) : phase === "paused" ? (
              <button className="primary" onClick={() => setPhase("running")}>
                <Icon name="play" />
                {t("Resume", "继续")}
              </button>
            ) : (
              <button className="primary" onClick={() => setModal("results")}>
                {t("View results", "查看结果")}
              </button>
            )}
            <button
              className="quiet"
              onClick={doStep}
              disabled={
                phase === "running" ||
                phase === "finished" ||
                (editing && !!changed)
              }
            >
              <Icon name="step" />
              {t("Step", "单步")}
            </button>
            {!editing && (
              <button
                className="quiet"
                disabled={!!changed}
                onClick={() => {
                  setHistory([initial(spec)]);
                  setCursor(0);
                  setPhase("paused");
                }}
              >
                {t("Restart", "重新开始")}
              </button>
            )}
            {!editing && (
              <button className="quiet" onClick={resetRun}>
                {t("Edit again", "重新编辑")}
              </button>
            )}
          </div>
          <div className="timeline-controls">
            <span className="phase-label">
              {editing
                ? t("Ready to build", "可编辑")
                : phase === "running"
                  ? t("Running", "运行中")
                  : phase === "paused"
                    ? t("Paused", "已暂停")
                    : t("Shift complete", "班次完成")}
            </span>
            <div
              className="speed-control"
              role="group"
              aria-label={t("Simulation speed", "模拟速度")}
            >
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={s === speed ? "chosen" : ""}
                  aria-pressed={s === speed}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="stats-bar">
          <div>
            <span>{t("Delivered", "已交付")}</span>
            <strong className="pod-stat">
              {state.score}
              <small>{t("pods", "货舱")}</small>
            </strong>
          </div>
          <div>
            <span>{t("Credits left", "剩余信用点")}</span>
            <strong>
              {CONFIG.budget - cost(blueprint.layout)}
              <small>/ {CONFIG.budget}</small>
            </strong>
          </div>
          <div className="power-stat">
            <span>
              <Icon name="bolt" />
              {t("Stored energy", "存储电力")}
            </span>
            <strong>
              {state.energy}
              <small>/ {capacity(blueprint.layout)}</small>
            </strong>
          </div>
          <div>
            <span>{t("Shift tick", "班次进度")}</span>
            <strong>
              {state.tick}
              <small>/ {p.length}</small>
            </strong>
          </div>
        </div>
        <div className="factory-layout">
          <aside className="palette" aria-label={t("Build tools", "建造工具")}>
            <div className="palette-heading">
              <h3>{t("Build", "建造")}</h3>
              <span>{t("Cost", "费用")}</span>
            </div>
            <div className="tools">
              <button
                className={`tool ${tool === "select" ? "selected" : ""}`}
                aria-pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                <Icon name="select" />
                <span>{t("Select", "选择")}</span>
                <small>↖</small>
              </button>
              {KINDS.map((kind) => (
                <button
                  key={kind}
                  className={`tool ${tool === kind ? "selected" : ""}`}
                  disabled={!editing}
                  aria-pressed={tool === kind}
                  onClick={() => {
                    setTool(kind);
                    setSelected(null);
                  }}
                >
                  <MachineArt kind={kind} />
                  <span>{n(kind)}</span>
                  <small>{CONFIG.costs[kind]}</small>
                </button>
              ))}
            </div>
            <div className="palette-foot">
              <p>{t("Ore → plates → pods", "矿石 → 金属板 → 货舱")}</p>
              <p>
                {t("Tap a tool, then an empty cell.", "先选工具，再点空格。")}
              </p>
            </div>
          </aside>
          <section
            className="factory"
            aria-label={t("Factory board", "工厂棋盘")}
          >
            <div className="board-toolbar">
              <div className="edit-actions">
                <button
                  className={`icon-button ${tool === "delete" ? "chosen" : ""}`}
                  aria-label={t("Delete tool", "删除工具")}
                  title={t("Delete tool", "删除工具")}
                  disabled={!editing}
                  onClick={() =>
                    setTool(tool === "delete" ? "select" : "delete")
                  }
                >
                  <Icon name="delete" />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Rotate clockwise", "顺时针旋转")}
                  title={t("Rotate (R)", "旋转 (R)")}
                  disabled={!editing}
                  onClick={rotate}
                >
                  <Icon name="rotate" />
                </button>
                <span className="toolbar-divider" />
                <button
                  className="icon-button"
                  aria-label={t("Undo", "撤销")}
                  disabled={!editing || !undo.length}
                  onClick={() => {
                    setRedo((r) => [...r, blueprint]);
                    setBlueprint(undo.at(-1)!);
                    setUndo((u) => u.slice(0, -1));
                  }}
                >
                  <Icon name="undo" />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Redo", "重做")}
                  disabled={!editing || !redo.length}
                  onClick={() => {
                    setUndo((u) => [...u, blueprint]);
                    setBlueprint(redo.at(-1)!);
                    setRedo((r) => r.slice(0, -1));
                  }}
                >
                  <Icon name="redo" />
                </button>
              </div>
              <div className="zoom-controls">
                <button
                  className="icon-button"
                  aria-label={t("Zoom out", "缩小")}
                  onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
                >
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                  </svg>
                </button>
                <button
                  className="quiet zoom-label"
                  aria-label={`${Math.round(zoom * 100)}% · ${t("Reset zoom", "重置缩放")}`}
                  onClick={() => setZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Zoom in", "放大")}
                  onClick={() => setZoom((z) => Math.min(1.5, z + 0.25))}
                >
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12h14M12 5v14"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div
              className={`board-viewport ${phase === "running" ? "is-running" : ""}`}
              ref={boardRef}
            >
              <div
                className="board-inner"
                style={{ "--cell": `${56 * zoom}px` } as React.CSSProperties}
              >
                <div className="column-labels">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span key={i}>{String.fromCharCode(65 + i)}</span>
                  ))}
                </div>
                <div className="row-labels">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <div
                  className={`board-grid tool-${tool}`}
                  role="grid"
                  aria-rowcount={8}
                  aria-colcount={12}
                  aria-label={t(
                    "12 by 8 factory. Arrow keys navigate; Enter places or selects; R rotates; Delete removes.",
                    "12 列 8 行工厂。方向键导航，回车放置或选择，R 旋转，Delete 删除。",
                  )}
                >
                  {Array.from({ length: 8 }, (_, row) => (
                    <div
                      role="row"
                      aria-rowindex={row + 1}
                      className="board-row"
                      key={row}
                    >
                      {Array.from({ length: 12 }, (_, col) => {
                        const id = row * 12 + col;
                        const c = blueprint.layout.find((c) => c.id === id),
                          m = state.machines.find((m) => m.id === id);
                        const items = m ? [...m.input, ...m.output] : [];
                        return (
                          <button
                            key={id}
                            role="gridcell"
                            aria-colindex={col + 1}
                            data-cell={id}
                            tabIndex={id === focusCell ? 0 : -1}
                            className={`grid-cell ${c ? "occupied" : ""} ${selected === id ? "cell-selected" : ""} ${m?.diagnostic === "starved" ? "cell-starved" : ""} ${c?.kind === "drill" ? "ore-ground" : ""}`}
                            aria-label={`${String.fromCharCode(65 + (id % 12))}${Math.floor(id / 12) + 1} · ${c ? n(c.kind) : t("Empty cell", "空格")}${c ? ` · ${t("Output", "出口")} ${["→", "↓", "←", "↑"][c.dir]} · ${m ? diagnosticNames[m.diagnostic][lang === "en" ? 0 : 1] : ""}` : ""}`}
                            aria-selected={selected === id}
                            onClick={() => clickCell(id)}
                            onKeyDown={(e) => keyCell(e, id)}
                          >
                            {c && (
                              <MachineArt
                                kind={c.kind}
                                dir={c.dir}
                                active={
                                  phase === "running" &&
                                  m?.diagnostic === "working"
                                }
                              />
                            )}
                            {items.length > 0 && (
                              <span className="cell-items">
                                <ItemArt item={items[0]} />
                                {items.length > 1 && (
                                  <span>{items.length}</span>
                                )}
                              </span>
                            )}
                            {m && m.job > 0 && (
                              <span
                                className="job-progress"
                                style={{
                                  width: `${(1 - m.job / (CONFIG.cycles[c!.kind as "drill" | "smelter" | "assembler"] || 1)) * 70 + 15}%`,
                                }}
                              />
                            )}
                            {m?.diagnostic === "starved" && (
                              <span
                                className="cell-flag"
                                title={t("Power starvation", "电力不足")}
                              >
                                !
                              </span>
                            )}
                            {m?.diagnostic === "disabled" && (
                              <span className="cell-flag disabled-flag">Ⅱ</span>
                            )}
                            {m?.diagnostic === "blocked" && !editing && (
                              <span className="blocked-flag">×</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="floor-mark">
                  <BrandMark />
                  <span>Squeek Foundry · 12 × 8</span>
                </div>
              </div>
            </div>
            <div className="board-footer">
              <span>
                {editing
                  ? tool === "select"
                    ? t(
                        "Select a machine. Scroll to pan; + / − to zoom.",
                        "选择机器，滑动平移，+ / − 缩放。",
                      )
                    : tool === "delete"
                      ? t(
                          "Tap a machine to remove it. Undo is available.",
                          "点击机器以移除，可撤销。",
                        )
                      : `${n(tool)} · ${t("Place", "放置")} ${CONFIG.costs[tool]} · ${t("Remaining", "剩余")} ${CONFIG.budget - cost(blueprint.layout) - CONFIG.costs[tool]} · ${["→", "↓", "←", "↑"][direction]}`
                  : t(
                      "Layout and rules locked for this shift.",
                      "本班次的布局与规则已锁定。",
                    )}
              </span>
              <button
                className="quiet mobile-inspect"
                onClick={() => {
                  setPanel("inspector");
                  setDrawer(true);
                }}
              >
                {t("Inspect", "检查")} ↗
              </button>
            </div>
            <div
              className={`status-message ${message ? "has-message" : ""}`}
              role="status"
            >
              {message}
              {message && (
                <button
                  className="icon-button"
                  aria-label={t("Dismiss message", "关闭消息")}
                  onClick={() => setMessage("")}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
          </section>
          <div
            ref={inspectorRef}
            className={`inspector ${drawer ? "drawer-open" : ""}`}
            role={drawer && narrow ? "dialog" : "complementary"}
            aria-modal={drawer && narrow ? true : undefined}
            aria-label={t(
              "Machine inspector and electricity",
              "机器检查与电力",
            )}
          >
            <div className="inspector-tabs">
              {(["inspector", "rules", "source"] as const).map((tab) => (
                <button
                  key={tab}
                  className={panel === tab ? "active-tab" : ""}
                  onClick={() => setPanel(tab)}
                >
                  {tab === "inspector"
                    ? t("Inspect", "检查")
                    : tab === "rules"
                      ? t("Rules", "规则")
                      : t("Power", "电力")}
                  {tab === "rules" && <small>{blueprint.rules.length}</small>}
                </button>
              ))}
              <button
                className="icon-button drawer-close"
                aria-label={t("Close inspector", "关闭检查面板")}
                onClick={() => setDrawer(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="inspector-content">
              {message && drawer && (
                <p className="modal-message" role="status">
                  {message}
                </p>
              )}
              {panel === "inspector" ? (
                <>
                  {selectedCell ? (
                    <>
                      <div className="machine-title">
                        <MachineArt
                          kind={selectedCell.kind}
                          dir={selectedCell.dir}
                        />
                        <div>
                          <h3>{n(selectedCell.kind)}</h3>
                          <p>
                            {String.fromCharCode(65 + (selectedCell.id % 12))}
                            {Math.floor(selectedCell.id / 12) + 1} ·{" "}
                            {CONFIG.costs[selectedCell.kind]}{" "}
                            {t("credits", "信用点")}
                          </p>
                        </div>
                      </div>
                      <p>{recipeText(selectedCell.kind)}</p>
                      <div
                        className={`diagnostic diag-${selectedMachine?.diagnostic}`}
                      >
                        <span>
                          {selectedMachine
                            ? diagnosticNames[selectedMachine.diagnostic][
                                lang === "en" ? 0 : 1
                              ]
                            : t("Ready", "就绪")}
                        </span>
                      </div>
                      <dl className="key-values">
                        <div>
                          <dt>{t("Input buffer", "输入缓冲")}</dt>
                          <dd>
                            {selectedMachine?.input.length ?? 0} /{" "}
                            {CONFIG.inputCapacity[selectedCell.kind]}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Output buffer", "输出缓冲")}</dt>
                          <dd>
                            {selectedMachine?.output.length ?? 0} /{" "}
                            {CONFIG.outputCapacity[selectedCell.kind]}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Job ticks left", "剩余加工刻数")}</dt>
                          <dd>{selectedMachine?.job ?? 0}</dd>
                        </div>
                        <div>
                          <dt>{t("Output direction", "出口方向")}</dt>
                          <dd>{["→", "↓", "←", "↑"][selectedCell.dir]}</dd>
                        </div>
                        {selectedCell.kind === "splitter" && (
                          <div>
                            <dt>{t("Next branch", "下一分支")}</dt>
                            <dd>
                              {selectedMachine?.split === 1
                                ? t("Right", "右侧")
                                : t("Forward", "前方")}
                            </dd>
                          </div>
                        )}
                      </dl>
                      <label className="field">
                        {t(
                          "Base priority (higher first)",
                          "基础优先级（高值优先）",
                        )}
                        <input
                          type="number"
                          min="0"
                          max="9"
                          value={selectedCell.priority}
                          disabled={!editing}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (
                              Number.isInteger(value) &&
                              value >= 0 &&
                              value <= 9
                            )
                              change({
                                ...blueprint,
                                layout: blueprint.layout.map((c) =>
                                  c.id === selected
                                    ? { ...c, priority: value }
                                    : c,
                                ),
                              });
                          }}
                        />
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={selectedCell.enabled}
                          disabled={!editing}
                          onChange={(e) =>
                            change({
                              ...blueprint,
                              layout: blueprint.layout.map((c) =>
                                c.id === selected
                                  ? { ...c, enabled: e.target.checked }
                                  : c,
                              ),
                            })
                          }
                        />
                        {t("Enabled at shift start", "班次开始时启用")}
                      </label>
                      <div className="button-row">
                        <button disabled={!editing} onClick={rotate}>
                          <Icon name="rotate" />
                          {t("Rotate", "旋转")}
                        </button>
                        <button
                          disabled={!editing}
                          onClick={() => {
                            change({
                              ...blueprint,
                              layout: blueprint.layout.filter(
                                (c) => c.id !== selected,
                              ),
                              rules: blueprint.rules.filter(
                                (r) => r.target !== `cell:${selected}`,
                              ),
                            });
                            setSelected(null);
                          }}
                        >
                          <Icon name="delete" />
                          {t("Remove", "移除")}
                        </button>
                      </div>
                      <p className="subtle">
                        {t("Rule applied:", "应用规则：")}{" "}
                        {selectedMachine?.lastRule !== null &&
                        selectedMachine?.lastRule !== undefined
                          ? selectedMachine.lastRule + 1
                          : t("None", "无")}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="empty-inspector">
                        <div className="inspector-illustration">
                          <MachineArt kind="assembler" />
                          <Icon name="select" />
                        </div>
                        <h3>{t("Meet your machines", "了解机器")}</h3>
                        <p>
                          {t(
                            "Select a cell to see its recipe, buffers and power diagnostics.",
                            "选择一个格子，查看配方、缓冲与供电诊断。",
                          )}
                        </p>
                      </div>
                      <div className="flow-recipe">
                        <h3>
                          {t("From rock to rocket cargo", "从矿石到火箭货物")}
                        </h3>
                        <div>
                          <ItemArt item="ore" />
                          <span>→</span>
                          <ItemArt item="plate" />
                          <span>→</span>
                          <ItemArt item="pod" />
                        </div>
                        <p>
                          {t(
                            "Two plates make one pod. Only pods reaching a warehouse count.",
                            "两块金属板制造一个货舱，仅送达仓库的货舱计分。",
                          )}
                        </p>
                      </div>
                      <button
                        className="wide"
                        onClick={() => {
                          setTutorialStep(0);
                          setModal("tutorial");
                        }}
                      >
                        <Icon name="help" />
                        {t("Learn in 90 seconds", "90 秒入门")}
                      </button>
                    </>
                  )}
                  <div className="inventory">
                    <h3>{t("On the factory floor", "工厂库存")}</h3>
                    <div>
                      {(["ore", "plates", "pods"] as const).map((x, i) => (
                        <span key={x}>
                          <ItemArt
                            item={i === 0 ? "ore" : i === 1 ? "plate" : "pod"}
                          />
                          {inv[x]}
                          <small>
                            {i === 0
                              ? t("Ore", "矿石")
                              : i === 1
                                ? t("Plates", "金属板")
                                : t("Pods", "货舱")}
                          </small>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : panel === "rules" ? (
                <>
                  <h3>
                    {t("A little logic goes a long way", "让规则帮忙生产")}
                  </h3>
                  <p>
                    {t(
                      "Up to 8 ordered rules. All conditions see one snapshot; later matches override the same setting.",
                      "最多 8 条有序规则。条件读取同一快照，后续匹配会覆盖相同设置。",
                    )}
                  </p>
                  <p className="subtle">
                    {t(
                      "Priority: 9 first, 0 last. Ties use cell ID.",
                      "优先级：9 最高，0 最低。同级按格子编号排序。",
                    )}
                  </p>
                  <div className="rules-list">
                    {blueprint.rules.map((rule, i) => (
                      <div className="rule" key={i}>
                        <div className="rule-head">
                          <strong>
                            {t("Rule", "规则")} {i + 1}
                          </strong>
                          <div>
                            <button
                              className="mini-button"
                              aria-label={t(
                                `Move rule ${i + 1} up`,
                                `上移规则 ${i + 1}`,
                              )}
                              disabled={!editing || i === 0}
                              onClick={() => {
                                const rules = [...blueprint.rules];
                                [rules[i - 1], rules[i]] = [
                                  rules[i],
                                  rules[i - 1],
                                ];
                                change({ ...blueprint, rules });
                              }}
                            >
                              ↑
                            </button>
                            <button
                              className="mini-button"
                              aria-label={t(
                                `Move rule ${i + 1} down`,
                                `下移规则 ${i + 1}`,
                              )}
                              disabled={
                                !editing || i === blueprint.rules.length - 1
                              }
                              onClick={() => {
                                const rules = [...blueprint.rules];
                                [rules[i + 1], rules[i]] = [
                                  rules[i],
                                  rules[i + 1],
                                ];
                                change({ ...blueprint, rules });
                              }}
                            >
                              ↓
                            </button>
                            <button
                              className="mini-button"
                              aria-label={t(
                                `Delete rule ${i + 1}`,
                                `删除规则 ${i + 1}`,
                              )}
                              disabled={!editing}
                              onClick={() =>
                                change({
                                  ...blueprint,
                                  rules: blueprint.rules.filter(
                                    (_, j) => j !== i,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <label className="field">
                          {t("When", "条件")}
                          <select
                            disabled={!editing}
                            value={rule.metric}
                            onChange={(e) =>
                              updateRule(i, {
                                metric: e.target.value as Rule["metric"],
                              })
                            }
                          >
                            {METRICS.map((metric) => (
                              <option key={metric} value={metric}>
                                {metricNames[metric][lang === "en" ? 0 : 1]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="condition-fields">
                          <select
                            aria-label={t(
                              `Rule ${i + 1} comparator`,
                              `规则 ${i + 1} 比较符`,
                            )}
                            disabled={!editing}
                            value={rule.op}
                            onChange={(e) =>
                              updateRule(i, {
                                op: e.target.value as Rule["op"],
                              })
                            }
                          >
                            {OPS.map((op) => (
                              <option key={op}>{op}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            aria-label={t(
                              `Rule ${i + 1} threshold`,
                              `规则 ${i + 1} 阈值`,
                            )}
                            min="0"
                            max="100000"
                            disabled={!editing}
                            value={rule.threshold}
                            onChange={(e) =>
                              updateRule(i, {
                                threshold: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <label className="field">
                          {t("Then", "执行")}
                          <select
                            disabled={!editing}
                            value={rule.action}
                            onChange={(e) =>
                              updateRule(i, {
                                action: e.target.value as Rule["action"],
                              })
                            }
                          >
                            <option value="enable">
                              {t("Enable", "启用")}
                            </option>
                            <option value="disable">
                              {t("Disable", "停用")}
                            </option>
                            <option value="priority">
                              {t("Set priority", "设置优先级")}
                            </option>
                          </select>
                        </label>
                        <label className="field">
                          {t("Target", "目标")}
                          <select
                            disabled={!editing}
                            value={rule.target}
                            onChange={(e) =>
                              updateRule(i, {
                                target: e.target.value as Rule["target"],
                              })
                            }
                          >
                            <option value="all">
                              {t("All modules", "所有模块")}
                            </option>
                            {KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {n(kind)}
                              </option>
                            ))}
                            {blueprint.layout.map((c) => (
                              <option key={c.id} value={`cell:${c.id}`}>
                                {n(c.kind)}{" "}
                                {String.fromCharCode(65 + (c.id % 12))}
                                {Math.floor(c.id / 12) + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                        {rule.action === "priority" && (
                          <label className="field">
                            {t("Priority", "优先级")}
                            <input
                              type="number"
                              min="0"
                              max="9"
                              disabled={!editing}
                              value={rule.value}
                              onChange={(e) =>
                                updateRule(i, { value: Number(e.target.value) })
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  {!blueprint.rules.length && (
                    <p className="empty-state">
                      {t(
                        "No rules yet. Machines use their base settings.",
                        "尚无规则，机器使用基础设置。",
                      )}
                    </p>
                  )}
                  <button
                    className="wide"
                    disabled={!editing || blueprint.rules.length >= 8}
                    onClick={() =>
                      change({
                        ...blueprint,
                        rules: [
                          ...blueprint.rules,
                          {
                            metric: "battery",
                            op: "<",
                            threshold: 25,
                            target: "drill",
                            action: "disable",
                            value: 0,
                          },
                        ],
                      })
                    }
                  >
                    + {t("Add rule", "添加规则")}
                  </button>
                  <p>
                    {t("Last fired rule:", "最后触发规则：")}{" "}
                    {state.lastFired === null
                      ? t("None", "无")
                      : state.lastFired + 1}
                  </p>
                  <p className="subtle">
                    {t(
                      "Matching rules fire every tick. Disable pauses jobs; it never discards items.",
                      "匹配规则每刻触发。停用会暂停加工，不会丢弃物品。",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h3>{t("Power from the wheel", "跑轮电力")}</h3>
                  <div className="live-observation">
                    <strong>
                      {liveLabel} ·{" "}
                      {liveData ? `${liveData.rpmMilli / 1000} RPM` : "…"}
                    </strong>
                    <p>
                      {t(
                        "Provisional observation. Never changes a scored shift.",
                        "临时观测，不会改变计分班次。",
                      )}
                    </p>
                    {liveData && (
                      <dl className="key-values">
                        <div>
                          <dt>{t("Observed", "观测时间")}</dt>
                          <dd>
                            {new Date(liveData.observedAt).toLocaleString(
                              lang === "en" ? "en-GB" : "zh-CN",
                              { timeZone: "UTC" },
                            )}{" "}
                            UTC
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Freshness", "新鲜度")}</dt>
                          <dd>{liveData.freshness}</dd>
                        </div>
                        <div>
                          <dt>{t("Core", "核心")}</dt>
                          <dd>{liveData.coreStatus}</dd>
                        </div>
                      </dl>
                    )}
                    <button onClick={() => setRetry((r) => r + 1)}>
                      {t("Refresh API", "刷新 API")}
                    </button>
                    {live.status.error && (
                      <p>
                        {t(
                          "Status unavailable. Offline training is ready.",
                          "状态不可用，可使用离线训练。",
                        )}
                      </p>
                    )}
                  </div>
                  <h3>{t("Historical Shift", "历史班次")}</h3>
                  <p>
                    {t(
                      "Pin the latest 2–12 distinct safe settlement batches. A batch may span several rounds.",
                      "固定最近 2 至 12 个不同的安全结算批次，每批可能跨越多个轮次。",
                    )}
                  </p>
                  <label className="field">
                    {t("Requested batch count", "请求批次数量")}
                    <input
                      type="number"
                      min="2"
                      max="12"
                      value={batchCount}
                      onChange={(e) => setBatchCount(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="wide"
                    onClick={selectHistory}
                    disabled={phase === "running"}
                  >
                    {t("Select latest safe batches", "选择最新安全批次")}
                  </button>
                  <button
                    className="quiet wide"
                    onClick={() => chooseMode(PRACTICE)}
                  >
                    {t("Use synthetic Practice", "使用合成练习")}
                  </button>
                  <div className="source-details">
                    <h3>{t("Pinned electricity", "固定电力来源")}</h3>
                    <p>
                      {sourceName} ·{" "}
                      {source.kind === "synthetic"
                        ? t("Synthetic", "合成")
                        : sourceIsTrusted
                          ? t("API snapshot", "API 快照")
                          : t("Imported / untrusted", "导入 / 不受信任")}
                    </p>
                    <p>
                      {t(
                        "Each bar = 32 game ticks. Fixed initial reserve: 8 energy.",
                        "每柱代表 32 个游戏刻，固定初始储备为 8 电力。",
                      )}
                    </p>
                    <div className="energy-profile">
                      {source.segmentEnergy.map((e, i) => (
                        <div key={i}>
                          <span
                            style={{
                              height: `${Math.max(2, (e / 160) * 62)}px`,
                            }}
                          />
                          <small>{e}</small>
                        </div>
                      ))}
                    </div>
                    <p>
                      {t(
                        "Game energy, not protocol power or token rewards.",
                        "这是游戏电力，不是协议算力或代币奖励。",
                      )}
                    </p>
                    {source.kind === "historical" && (
                      <>
                        <p>
                          {t(
                            "API snapshots are not independently verified onchain.",
                            "API 快照未经独立链上验证。",
                          )}
                        </p>
                        <dl className="source-metadata">
                          <dt>{t("Chain", "链")}</dt>
                          <dd>
                            {source.chainTarget} · {source.chainId}
                          </dd>
                          <dt>{t("Installation", "安装")}</dt>
                          <dd>{source.installationId}</dd>
                          <dt>{t("Release", "版本")}</dt>
                          <dd>
                            {source.releaseId}
                            <br />
                            {source.protocolRevision}
                            <br />
                            {source.rewardModelRevision}
                          </dd>
                          <dt>{t("Generated (UTC)", "生成时间 (UTC)")}</dt>
                          <dd>{source.generatedAt}</dd>
                          <dt>{t("Safety boundary", "安全边界")}</dt>
                          <dd>
                            {source.safeThroughBlock} · {source.confirmations}{" "}
                            {t("confirmations", "确认")}
                          </dd>
                          <dt>{t("Indexed through", "索引至")}</dt>
                          <dd>{source.indexedThroughBlock}</dd>
                          <dt>{t("Safe block timestamp", "安全区块时间")}</dt>
                          <dd>{source.safeBlockTimestamp}</dd>
                          <dt>{t("Safe block hash", "安全区块哈希")}</dt>
                          <dd>{source.safeBlockHash}</dd>
                        </dl>
                        <details>
                          <summary>
                            {t(
                              "Batch mapping and transactions",
                              "批次映射与交易",
                            )}
                          </summary>
                          <p>
                            <code>
                              M = max(1, max(workAdded))
                              <br />
                              Eᵢ = floor(160 × workAddedᵢ / M)
                              <br />
                              Δ(t) = floor((t+1)Eᵢ/32) − floor(tEᵢ/32)
                            </code>
                          </p>
                          <p>
                            {t(
                              "We do not infer missing rounds or exact wheel timing.",
                              "不推测缺失轮次或精确跑轮时间。",
                            )}
                          </p>
                          {source.records.map((r, i) => (
                            <div
                              className="batch-record"
                              key={`${r.transactionHash}:${r.logIndex}`}
                            >
                              <strong>
                                {t("Batch", "批次")} {i + 1} ·{" "}
                                {source.segmentEnergy[i]} {t("energy", "电力")}
                              </strong>
                              <p>
                                {t("Work", "工作量")}: {r.workAdded}
                                <br />
                                {t("Settled interval", "已结算区间")}: (
                                {r.previousSettledThroughRound},{" "}
                                {r.settledThroughRound}] · {r.activeRoundCount}{" "}
                                {t("active rounds", "活跃轮次")}
                                <br />
                                {r.blockTimestamp}
                                <br />
                                {t("Block / log", "区块 / 日志")}:{" "}
                                {r.ethereumBlockNumber} / {r.logIndex}
                                <br />
                                {t("Confirmation", "确认")}: safe
                              </p>
                              {txURL(source, r.transactionHash) ? (
                                <a
                                  href={txURL(source, r.transactionHash)!}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.transactionHash} ↗
                                </a>
                              ) : (
                                <code>{r.transactionHash}</code>
                              )}
                            </div>
                          ))}
                        </details>
                      </>
                    )}
                  </div>
                  <p className="subtle">
                    <a
                      href="https://api.squeekchain.com/v1/status"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Status API", "状态 API")} ↗
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://api.squeekchain.com/v1/economy/state"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Economy API", "经济 API")} ↗
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://api.squeekchain.com/v1/settlements?range=24h"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Settlements API", "结算 API")} ↗
                    </a>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="lower-bar">
          <div className="power-strip">
            <Icon name="bolt" />
            <span>{t("Supply profile", "供电曲线")}</span>
            <div
              className="mini-profile"
              role="img"
              aria-label={`${t("Segment energy", "分段电力")}: ${source.segmentEnergy.join(", ")}`}
            >
              {source.segmentEnergy.map((e, i) => (
                <span
                  key={i}
                  className={
                    !editing &&
                    Math.floor(Math.max(0, state.tick - 1) / 32) === i
                      ? "current-segment"
                      : ""
                  }
                  style={{ height: `${Math.max(3, (e / 160) * 25)}px` }}
                  title={`${i + 1}: ${e}`}
                />
              ))}
            </div>
            <span>
              {source.segmentEnergy.reduce((a, b) => a + b, 0)}{" "}
              {t("energy", "电力")} · {p.length} {t("ticks", "刻")}
            </span>
          </div>
          <div className="file-actions">
            <button
              className="quiet"
              onClick={() => {
                setJSON("");
                setJSONMode("import");
                setModal("json");
              }}
            >
              {t("Import", "导入")}
            </button>
            <button className="quiet" onClick={() => void exportJSON(false)}>
              <Icon name="export" />
              {t("Blueprint", "蓝图")}
            </button>
            <button
              className="quiet"
              disabled={phase !== "finished"}
              onClick={() => void exportJSON(true)}
            >
              {t("Run bundle", "运行包")}
            </button>
            <button
              className="quiet"
              onClick={() =>
                void exportPNG(
                  blueprint,
                  { ...source, trusted: sourceIsTrusted },
                  state,
                  lang,
                ).catch(() =>
                  announce(
                    "PNG export failed in this browser.",
                    "此浏览器无法导出 PNG。",
                  ),
                )
              }
            >
              PNG ↗
            </button>
          </div>
        </div>
        {history.length > 0 && (
          <div className="replay-bar">
            <label htmlFor="replay">
              {t("Replay", "回放")} · {cursor} / {history.length - 1}
            </label>
            <input
              id="replay"
              type="range"
              min="0"
              max={history.length - 1}
              value={cursor}
              disabled={phase === "running"}
              onChange={(e) => setCursor(Number(e.target.value))}
            />
            <span>
              {t("Delivered", "已交付")} {state.score}
            </span>
          </div>
        )}
        {changed && (
          <p role="alert">
            {t(
              "The API installation or release changed. Finish this pinned run, then select a new source before running again.",
              "API 安装或版本已更改。可以完成已固定班次，下一次运行前请重新选择来源。",
            )}
          </p>
        )}
        <footer>
          <span>
            {t(
              "An independent factory game for Squeekchain. No affiliation or approval claimed.",
              "为 Squeekchain 制作的独立工厂游戏，不代表官方或声称获得批准。",
            )}
          </span>
          <span>
            {offlineReady
              ? t("Offline workshop ready", "离线车间已就绪")
              : t(
                  "Training works without API access",
                  "训练无需 API 访问",
                )}{" "}
            · {ENGINE_VERSION}
          </span>
        </footer>
      </main>
      {modal === "contracts" && (
        <Modal
          title={t("Choose your shift", "选择班次")}
          onClose={() => setModal(null)}
        >
          <p>
            {t(
              "Build freely, then freeze the layout and chase a better shipment. All training fixtures are synthetic.",
              "自由建造，固定布局后挑战更高交付量。所有训练场景均为合成数据。",
            )}
          </p>
          <div className="contract-list">
            {CONTRACTS.map((c, i) => (
              <div className="contract-choice" key={c.id}>
                <span className="contract-number">0{i + 1}</span>
                <div>
                  <h3>{t(c.en, c.zh)}</h3>
                  <p>{t(...c.description)}</p>
                  <span className="subtle">
                    {t("Synthetic", "合成")} · {profile(c.source).length}{" "}
                    {t("ticks", "刻")} · {CONFIG.budget} {t("budget", "预算")}
                  </span>
                </div>
                <div className="contract-buttons">
                  <button onClick={() => chooseMode(c.source, STARTER)}>
                    {t("Start contract", "开始合约")}
                  </button>
                  <button
                    className="quiet"
                    onClick={() => {
                      chooseMode(c.source, c.solution);
                      announce(
                        "Tested solution loaded. Run to measure it.",
                        "已载入测试解法，运行以测量产量。",
                      );
                    }}
                  >
                    {t("Load solution", "载入解法")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="contract-extra">
            <div>
              <h3>{t("Practice", "练习")}</h3>
              <p>
                {t(
                  "A synthetic burst profile. Experiment offline.",
                  "合成脉冲供电，可离线实验。",
                )}
              </p>
              <button onClick={() => chooseMode(PRACTICE, STARTER)}>
                {t("Open Practice", "打开练习")}
              </button>
            </div>
            <div>
              <h3>{t("Historical Shift", "历史班次")}</h3>
              <p>
                {t(
                  "Make electricity from safe API settlement batches.",
                  "将安全 API 结算批次映射为游戏电力。",
                )}
              </p>
              <button
                onClick={() => {
                  setModal(null);
                  setPanel("source");
                  setDrawer(true);
                }}
              >
                {t("Select a source", "选择来源")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "tutorial" && (
        <Modal
          title={t("Your first 90 seconds", "入门 90 秒")}
          onClose={() => setModal(null)}
        >
          <div className="tutorial-progress">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                aria-label={`${i + 1} · ${t("30 sec", "30 秒")} · ${t("Tutorial step", "教程步骤")} ${i + 1}`}
                className={tutorialStep === i ? "chosen" : ""}
                onClick={() => setTutorialStep(i)}
              >
                {i + 1} · {t("30 sec", "30 秒")}
              </button>
            ))}
          </div>
          {tutorialStep === 0 ? (
            <>
              <div className="tutorial-art">
                <MachineArt kind="drill" />
                <span>→</span>
                <MachineArt kind="smelter" />
                <span>→</span>
                <MachineArt kind="assembler" />
                <span>→</span>
                <MachineArt kind="warehouse" />
              </div>
              <h3>{t("Follow the little arrows", "沿着箭头生产")}</h3>
              <p>
                {t(
                  "The starter factory is already connected: a drill makes ore, the smelter makes plates, and the assembler turns two plates into a pod. The warehouse counts every delivered pod.",
                  "初始工厂已经连接：采矿机生产矿石，熔炉制成金属板，组装机把两块金属板变成一个货舱。仓库会为每个交付的货舱计分。",
                )}
              </p>
              <p>
                {t(
                  "Try selecting the smelter. In build mode, choose a tool and tap an empty cell. Rotate with the button or R.",
                  "试着选择熔炉。在编辑模式中，选择工具后点击空格放置。使用按钮或 R 旋转。",
                )}
              </p>
            </>
          ) : tutorialStep === 1 ? (
            <>
              <div className="tutorial-art">
                <MachineArt kind="battery" />
                <Icon name="bolt" />
                <MachineArt kind="smelter" />
              </div>
              <h3>{t("Save a spark for later", "留些电力备用")}</h3>
              <p>
                {t(
                  "Wheel energy arrives in segments. Batteries add 64 storage each. Every shift starts with a fixed 8-unit reserve. Without storage, excess supply is curtailed. Empty input, blocked output and power starvation are different problems.",
                  "跑轮电力分段到达，每块电池增加 64 储能容量，每班次固定以 8 单位储备开始。储能不足时，多余供电会被弃用。缺少输入、出口堵塞与电力不足是不同的问题。",
                )}
              </p>
              <p>
                {t(
                  "Run freezes the layout and rules. Pause and Step let you inspect one tick. Edit again always returns to tick zero.",
                  "运行会锁定布局与规则。暂停和单步可以逐刻检查。重新编辑总是回到第 0 刻。",
                )}
              </p>
            </>
          ) : (
            <>
              <h3>{t("Give your machines a plan", "给机器制定计划")}</h3>
              <p>
                {t(
                  "Rules can pause drills when ore piles up or prioritize assemblers when power is scarce. Later matching rules win. Results compare your factory to a reference and to the identical layout without rules.",
                  "矿石堆积时，规则可以暂停采矿机；电力稀缺时，可以优先供给组装机。后续匹配规则优先。结果会与参考工厂和相同布局无规则时进行比较。",
                )}
              </p>
              <p>
                {t(
                  "The three training contracts and tutorial use clearly labelled synthetic electricity. Historical Shift uses pinned safe settlement batches from the API; it never invents missing rounds.",
                  "三个训练合约与教程都使用明确标注的合成电力。历史班次使用 API 中固定的安全结算批次，不会虚构缺失轮次。",
                )}
              </p>
            </>
          )}
          <div className="dialog-actions">
            {tutorialStep < 2 && (
              <button onClick={() => setTutorialStep((i) => i + 1)}>
                {t("Next", "下一步")} →
              </button>
            )}
            <button
              className={tutorialStep === 2 ? "primary" : ""}
              onClick={() => chooseMode(TUTORIAL, STARTER)}
            >
              <Icon name="play" />
              {t("Try the tutorial factory", "试运行教程工厂")}
            </button>
          </div>
        </Modal>
      )}
      {modal === "json" && (
        <Modal
          title={
            jsonMode === "export"
              ? t("Take your factory with you", "带走你的工厂")
              : t("Import a blueprint or replay", "导入蓝图或回放")
          }
          onClose={() => setModal(null)}
        >
          <p>
            {jsonMode === "export"
              ? t(
                  "Download JSON or copy the text below. Files stay in your browser; nothing is uploaded.",
                  "下载 JSON 或复制下方文本。文件仅保留在浏览器中，不会上传。",
                )
              : t(
                  "Paste JSON or open a local file (128 KB maximum). Imported sources are untrusted. Run bundles are recomputed before opening.",
                  "粘贴 JSON 或打开本地文件（最大 128 KB）。导入来源不受信任，运行包会在打开前重新计算。",
                )}
          </p>
          <label className="field">
            JSON
            <textarea
              className="json-text"
              rows={12}
              readOnly={jsonMode === "export"}
              value={json}
              onChange={(e) => setJSON(e.target.value)}
              spellCheck={false}
            />
          </label>
          <input
            type="file"
            accept=".json,application/json"
            ref={fileRef}
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 131072) {
                announce("File exceeds 128 KB.", "文件超过 128 KB。");
                return;
              }
              const text = await f.text();
              setJSON(text);
            }}
          />
          {message && (
            <p className="modal-message" role="status">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            {jsonMode === "export" ? (
              <>
                <button
                  className="primary"
                  onClick={() =>
                    download(
                      json.includes("squeek-foundry-run")
                        ? "squeek-foundry-run.json"
                        : "squeek-foundry-blueprint.json",
                      json,
                    )
                  }
                >
                  {t("Download JSON", "下载 JSON")}
                </button>
                <button
                  onClick={() => {
                    const fallback = () => {
                      const area =
                        document.querySelector<HTMLTextAreaElement>(
                          ".json-text",
                        );
                      area?.focus();
                      area?.select();
                      announce(
                        "JSON selected. Copy it manually.",
                        "已选中 JSON，请手动复制。",
                      );
                    };
                    if (navigator.clipboard)
                      void navigator.clipboard
                        .writeText(json)
                        .then(() => announce("Copied JSON.", "JSON 已复制。"))
                        .catch(fallback);
                    else fallback();
                  }}
                >
                  {t("Copy JSON", "复制 JSON")}
                </button>
              </>
            ) : (
              <>
                <button className="primary" onClick={() => void doImport()}>
                  {t("Validate and import", "验证并导入")}
                </button>
                <button onClick={() => fileRef.current?.click()}>
                  {t("Open file", "打开文件")}
                </button>
              </>
            )}
          </div>
          <p>
            {t(
              "Matching fingerprints mean local reproducibility, not authenticated provenance, anti-cheat or official verification.",
              "指纹匹配仅表示本地可重现，不代表来源认证、防作弊或官方验证。",
            )}
          </p>
        </Modal>
      )}
      {modal === "results" && final && (
        <Modal
          title={t("Shift complete", "班次完成")}
          onClose={() => setModal(null)}
        >
          <div className="result-hero">
            <ItemArt item="pod" />
            <strong>{final.score}</strong>
            <div>
              <h3>{t("Pods delivered", "已交付货舱")}</h3>
              <p>
                {sourceName} ·{" "}
                {source.kind === "synthetic"
                  ? t("Synthetic", "合成")
                  : sourceIsTrusted
                    ? t("API snapshot", "API 快照")
                    : t("Imported / untrusted", "导入 / 不受信任")}
              </p>
            </div>
          </div>
          {contract && (
            <p className="contract-outcome">
              {contract.id === "priority"
                ? final.score > withoutRules.score
                  ? t(
                      "Contract complete: automation improved this layout.",
                      "合约完成：自动化提升了此布局的产量。",
                    )
                  : t(
                      "Keep tuning: beat this same layout without rules.",
                      "继续调整：超越相同布局无规则时的产量。",
                    )
                : final.score >= contract.target
                  ? t(
                      "Contract complete. Shipment received.",
                      "合约完成，货物已收讫。",
                    )
                  : t(
                      `Goal: ${contract.target} pods. Edit and try again.`,
                      `目标：${contract.target} 个货舱，重新编辑后再试。`,
                    )}
            </p>
          )}
          <table className="comparison">
            <caption>
              {t(
                "Same electricity, horizon and 420-credit budget",
                "相同电力、时长与 420 信用点预算",
              )}
            </caption>
            <thead>
              <tr>
                <th>{t("Factory", "工厂")}</th>
                <th>{t("Delivered pods", "交付货舱")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("Your factory", "你的工厂")}</td>
                <td>{final.score}</td>
              </tr>
              <tr>
                <td>{t("Reference blueprint", "参考蓝图")}</td>
                <td>{reference.score}</td>
              </tr>
              <tr>
                <td>{t("Your layout, no rules", "你的布局，无规则")}</td>
                <td>{withoutRules.score}</td>
              </tr>
            </tbody>
          </table>
          <dl className="result-counters">
            <div>
              <dt>{t("Energy generated", "生成电力")}</dt>
              <dd>{final.generated}</dd>
            </div>
            <div>
              <dt>{t("Spent", "消耗")}</dt>
              <dd>{final.spent}</dd>
            </div>
            <div>
              <dt>{t("Still stored", "剩余储能")}</dt>
              <dd>{final.energy}</dd>
            </div>
            <div>
              <dt>{t("Curtailed", "弃电")}</dt>
              <dd>{final.curtailed}</dd>
            </div>
            <div>
              <dt>{t("Starved machine-ticks", "缺电机器刻数")}</dt>
              <dd>{final.starved}</dd>
            </div>
            <div>
              <dt>{t("Local best, this source", "此来源的本地最佳")}</dt>
              <dd>{best ?? final.score}</dd>
            </div>
          </dl>
          <p className="ledger">
            {final.generated} + {CONFIG.initialReserve} = {final.spent} +{" "}
            {final.energy} + {final.curtailed}
            <br />
            {t(
              "Generated + initial = spent + stored + curtailed",
              "生成 + 初始 = 消耗 + 存储 + 弃电",
            )}
          </p>
          <details>
            <summary>
              {t("Shipment log", "交付记录")} ({final.shipments.length})
            </summary>
            <div className="shipment-log">
              {final.shipments.length ? (
                final.shipments.map((s, i) => (
                  <span key={i}>
                    {t("Tick", "刻")} {s.tick}: +{s.pods}
                  </span>
                ))
              ) : (
                <p>
                  {t("No pods delivered this shift.", "本班次没有交付货舱。")}
                </p>
              )}
            </div>
          </details>
          <p>
            {t(
              "Bests are stored only in this browser, separated by mode, source fingerprint and engine version.",
              "最佳成绩仅保存在此浏览器中，按模式、来源指纹与引擎版本区分。",
            )}
          </p>
          <div className="dialog-actions">
            <button
              className="primary"
              onClick={() => {
                setModal(null);
                setCursor(0);
              }}
            >
              {t("Scrub replay", "查看逐刻回放")}
            </button>
            <button onClick={() => void exportJSON(true)}>
              {t("Export run", "导出运行")}
            </button>
            <button
              onClick={() =>
                void exportPNG(
                  blueprint,
                  { ...source, trusted: sourceIsTrusted },
                  final,
                  lang,
                )
              }
            >
              {t("Export PNG", "导出 PNG")}
            </button>
            <button
              onClick={() => {
                setModal(null);
                resetRun();
              }}
            >
              {t("Edit again", "重新编辑")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
