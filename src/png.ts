import { type Blueprint } from "./config";
import { type Source } from "./source";
import { type State } from "./engine";
export async function exportPNG(
  blueprint: Blueprint,
  source: Source,
  state: State,
  lang: "en" | "zh",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1000;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Canvas unavailable");
  c.fillStyle = "#0c1723";
  c.fillRect(0, 0, 1200, 1000);
  c.fillStyle = "#f0c28a";
  c.font = "600 36px sans-serif";
  c.fillText("Squeek Foundry", 48, 64);
  c.fillStyle = "#b3c1cc";
  c.font = "20px sans-serif";
  const labels: Record<string, [string, string]> = {
    practice: ["Practice", "练习"],
    tutorial: ["90-second tutorial", "90 秒教程"],
    first: ["First Shipment", "首批交货"],
    buffer: ["Buffer the Burst", "缓冲脉冲"],
    priority: ["Priority Automation", "优先自动化"],
    historical: ["Historical Shift", "历史班次"],
  };
  const label = labels[source.mode]?.[lang === "en" ? 0 : 1] ?? source.label;
  c.fillText(
    `${source.kind === "synthetic" ? (lang === "en" ? "Synthetic training" : "合成训练") : lang === "en" ? "Historical API snapshot" : "历史 API 快照"} · ${label} · ${source.mode}`,
    48,
    105,
  );
  const x0 = 48,
    y0 = 150,
    size = 78;
  for (let id = 0; id < 96; id++) {
    const x = x0 + (id % 12) * size,
      y = y0 + Math.floor(id / 12) * size;
    c.fillStyle = (id + Math.floor(id / 12)) % 2 ? "#162735" : "#142430";
    c.fillRect(x, y, size - 2, size - 2);
  }
  const symbols = {
    drill: "D",
    belt: "›",
    splitter: "Y",
    smelter: "S",
    assembler: "A",
    warehouse: "W",
    battery: "ϟ",
  };
  for (const cell of blueprint.layout) {
    const x = x0 + (cell.id % 12) * size,
      y = y0 + Math.floor(cell.id / 12) * size;
    c.save();
    c.translate(x + size / 2, y + size / 2);
    c.rotate((cell.dir * Math.PI) / 2);
    c.fillStyle = cell.kind === "battery" ? "#285764" : "#8c654a";
    c.fillRect(-28, -28, 56, 56);
    c.strokeStyle = cell.kind === "battery" ? "#88e3de" : "#e9b77a";
    c.lineWidth = 2;
    c.strokeRect(-28, -28, 56, 56);
    c.fillStyle = "#f6e0b9";
    c.font = "600 30px sans-serif";
    c.textAlign = "center";
    c.fillText(symbols[cell.kind], 0, 10);
    if (cell.kind !== "battery" && cell.kind !== "warehouse") {
      c.beginPath();
      c.moveTo(29, -7);
      c.lineTo(37, 0);
      c.lineTo(29, 7);
      c.fill();
    }
    c.restore();
    const svg = document.querySelector<SVGElement>(
      `[data-cell="${cell.id}"] .machine-art`,
    );
    if (svg) {
      const picture = new Image();
      picture.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(new XMLSerializer().serializeToString(svg));
      try {
        await picture.decode();
        c.drawImage(picture, x, y, size - 2, size - 2);
      } catch {
        /* Label diagram remains a readable fallback. */
      }
    }
    const m = state.machines.find((m) => m.id === cell.id);
    if (m && (m.input.length || m.output.length)) {
      c.fillStyle = "#86e1dc";
      c.font = "600 16px sans-serif";
      c.fillText(String(m.input.length + m.output.length), x + 8, y + 70);
    }
  }
  c.fillStyle = "#f0c28a";
  c.font = "600 38px sans-serif";
  c.fillText(
    `${state.score} ${lang === "en" ? "pods delivered" : "货舱已交付"}`,
    48,
    840,
  );
  c.fillStyle = "#b3c1cc";
  c.font = "20px sans-serif";
  c.fillText(
    `${lang === "en" ? "Tick" : "刻"} ${state.tick} · ${lang === "en" ? "Energy" : "电力"} ${state.generated} + 8 = ${state.spent} + ${state.energy} + ${state.curtailed}`,
    48,
    880,
  );
  c.font = "16px sans-serif";
  const identity =
    source.kind === "historical"
      ? `${source.chainTarget} (${source.chainId}) · ${source.installationId} · ${source.trusted ? (lang === "en" ? "API snapshot" : "API 快照") : lang === "en" ? "Imported / offline / untrusted" : "导入 / 离线 / 不受信任"}`
      : lang === "en"
        ? "Synthetic profile. No chain data or rewards."
        : "合成供电，无链数据或奖励。";
  c.fillText(identity, 48, 920);
  c.fillText(
    lang === "en"
      ? "Local simulation · API snapshots are not independently verified onchain."
      : "本地模拟 · API 快照未经独立链上验证。",
    48,
    950,
  );
  await new Promise<void>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(Error("PNG failed"));
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "squeek-foundry.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, "image/png"),
  );
}
