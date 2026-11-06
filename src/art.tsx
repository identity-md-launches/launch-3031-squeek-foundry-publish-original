import type { Kind, Direction, Item } from "./config";
export function MachineArt({
  kind,
  dir = 0,
  active = false,
}: {
  kind: Kind;
  dir?: Direction;
  active?: boolean;
}) {
  const body =
    kind === "battery"
      ? "#244c55"
      : kind === "warehouse"
        ? "#80643d"
        : "#735344";
  const edge = kind === "battery" ? "#69d6df" : "#d6a16b";
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`machine-art ${active ? "active" : ""}`}
    >
      <g transform={`rotate(${dir * 90} 32 32)`}>
        {kind === "belt" ? (
          <>
            <rect
              x="4"
              y="17"
              width="56"
              height="34"
              rx="5"
              fill="#07131e"
              stroke="#46606b"
              strokeWidth="2"
            />
            <rect x="7" y="21" width="50" height="26" rx="3" fill="#2e3b43" />
            {[14, 28, 42].map((x) => (
              <path
                key={x}
                d={`M${x} 26 l7 8 -7 8`}
                fill="none"
                stroke="#829490"
                strokeWidth="3"
              />
            ))}
            <path d="M8 18h48M8 50h48" stroke="#bd8c5d" strokeWidth="3" />
          </>
        ) : (
          <>
            <rect x="9" y="13" width="48" height="45" rx="5" fill="#060e16" />
            <rect
              x="7"
              y="8"
              width="48"
              height="45"
              rx="5"
              fill={body}
              stroke={edge}
              strokeWidth="2"
            />
            <path
              d="M11 13h40M11 48h40"
              stroke={kind === "battery" ? "#417a81" : "#ad8060"}
              strokeWidth="2"
            />
            {[
              [12, 13],
              [50, 13],
              [12, 48],
              [50, 48],
            ].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.7" fill="#d9b88b" />
            ))}
            {kind === "drill" && (
              <>
                <circle
                  cx="31"
                  cy="29"
                  r="13"
                  fill="#26383c"
                  stroke="#e4ad70"
                  strokeWidth="3"
                />
                <path d="M23 26h16l-8 17z" fill="#abb6ac" />
                <path
                  d="M24 29l13 4m-11 1l8 3"
                  stroke="#354c50"
                  strokeWidth="2"
                />
                <path d="M25 16v7m12-7v7" stroke="#ecc18a" strokeWidth="4" />
              </>
            )}
            {kind === "smelter" && (
              <>
                <rect
                  x="19"
                  y="19"
                  width="25"
                  height="25"
                  rx="4"
                  fill="#151e23"
                  stroke="#d2a16a"
                  strokeWidth="2"
                />
                <path
                  d="M31 21c2 7 9 8 9 15 0 8-17 9-17 0 0-4 4-6 5-11 4 5 0 9 4 9 3-1 1-8-1-13"
                  fill="#f0a44b"
                />
                <path d="M29 35c-3 4-1 7 3 7 5-2 1-5 0-7z" fill="#ffe0a1" />
                <path d="M18 8V3h9v5" stroke="#b58b65" strokeWidth="3" />
              </>
            )}
            {kind === "assembler" && (
              <>
                <circle
                  cx="31"
                  cy="30"
                  r="14"
                  fill="#272e32"
                  stroke="#deb274"
                  strokeWidth="2"
                />
                <path
                  d="M19 20l8 6m16-6l-8 6M18 40l9-5m17 5l-9-5"
                  stroke="#d3ad7b"
                  strokeWidth="5"
                />
                <path
                  d="M27 25l8 0 4 6-4 7h-8l-4-7z"
                  fill="#75d9db"
                  stroke="#c9f6e5"
                  strokeWidth="1.5"
                />
              </>
            )}
            {kind === "warehouse" && (
              <>
                <path
                  d="M16 24l15-11 16 11v21H16z"
                  fill="#d8ae73"
                  stroke="#332f2b"
                  strokeWidth="2"
                />
                <rect x="23" y="29" width="17" height="16" fill="#4a4540" />
                <path
                  d="M25 32h13m-13 5h13m-13 5h13"
                  stroke="#b9976e"
                  strokeWidth="2"
                />
                <path d="M14 25h35" stroke="#f1cea0" strokeWidth="3" />
              </>
            )}
            {kind === "battery" && (
              <>
                <rect
                  x="20"
                  y="17"
                  width="24"
                  height="28"
                  rx="3"
                  fill="#122a36"
                  stroke="#7acfd1"
                  strokeWidth="2"
                />
                <path d="M26 14h12" stroke="#c3e9df" strokeWidth="3" />
                <path d="M34 20l-9 13h7l-2 10 10-15h-8z" fill="#7ee4de" />
              </>
            )}
            {kind === "splitter" && (
              <>
                <path
                  d="M16 31h15m0 0h16m-16 0v15"
                  stroke="#1b2b31"
                  strokeWidth="14"
                  fill="none"
                />
                <path
                  d="M15 31h16m0 0h15m-15 0v15"
                  stroke="#d9c18c"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M39 26l7 5-7 5m-13 3l5 7 5-7"
                  stroke="#f1c98c"
                  strokeWidth="2"
                  fill="none"
                />
              </>
            )}
          </>
        )}
        {kind !== "battery" && kind !== "warehouse" && (
          <path d="M57 27l6 5-6 5z" fill="#efbd7e" />
        )}
        {kind === "splitter" && <path d="M27 57l5 6 5-6z" fill="#efbd7e" />}
        {kind !== "battery" && kind !== "drill" && (
          <>
            <path d="M2 28v8 M28 2h8" stroke="#a7bcc0" strokeWidth="3" />
            {kind !== "splitter" && (
              <path d="M28 61h8" stroke="#a7bcc0" strokeWidth="3" />
            )}
            {kind === "warehouse" && (
              <path d="M61 28v8" stroke="#a7bcc0" strokeWidth="3" />
            )}
          </>
        )}
        <circle cx="13" cy="10" r="2" fill={active ? "#8be9da" : "#dcc499"} />
      </g>
    </svg>
  );
}
export function ItemArt({ item }: { item: Item }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`item-art item-${item}`}
    >
      {item === "ore" ? (
        <path
          d="M4 4l8-2 6 7-4 8-10-2-2-6z"
          fill="#b58d79"
          stroke="#e7bc98"
          strokeWidth="1.5"
        />
      ) : item === "plate" ? (
        <>
          <path d="M2 6l11-4 5 4-11 5z" fill="#efd49a" />
          <path d="M2 6v6l5 5 11-5V6L7 11z" fill="#b9a882" stroke="#f3dfb4" />
        </>
      ) : (
        <path
          d="M5 3h10l4 7-4 7H5l-4-7z"
          fill="#83e1de"
          stroke="#d8fff0"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
export function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40">
      <path d="M12 3h16l9 9v16l-9 9H12l-9-9V12z" fill="#e7b474" />
      <circle cx="20" cy="20" r="12" fill="#17232d" />
      <path d="M14 25l4-7 6-4 4 6-3 6H14z" fill="#e7b474" />
      <circle cx="22" cy="13" r="4" fill="#e7b474" />
      <circle cx="25" cy="18" r="1.2" fill="#17232d" />
      <path d="M8 30l7-4" stroke="#e7b474" strokeWidth="3" />
    </svg>
  );
}
export function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      className="icon"
    >
      {name === "play" ? (
        <path d="M8 4l12 8-12 8z" fill="currentColor" stroke="none" />
      ) : name === "pause" ? (
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      ) : name === "undo" ? (
        <path d="M8 4L3 9l5 5M4 9h10a6 6 0 010 12" />
      ) : name === "redo" ? (
        <path d="M16 4l5 5-5 5m4-5H10a6 6 0 000 12" />
      ) : name === "rotate" ? (
        <path d="M19 9a8 8 0 10.5 7M19 3v7h-7" />
      ) : name === "delete" ? (
        <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 9v9m4-9v9" />
      ) : name === "select" ? (
        <path d="M6 3l14 10-7 1-3 7z" />
      ) : name === "step" ? (
        <>
          <path d="M5 5l11 7-11 7z" />
          <path d="M20 5v14" />
        </>
      ) : name === "bolt" ? (
        <path d="M14 2L5 14h7l-2 8 10-13h-7z" />
      ) : name === "export" ? (
        <path d="M12 15V2m-5 5l5-5 5 5M4 13v8h16v-8" />
      ) : name === "help" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 8a3 3 0 115 3c-2 1-2 2-2 3m0 3v1" />
        </>
      ) : name === "close" ? (
        <path d="M5 5l14 14M5 19L19 5" />
      ) : (
        <path d="M4 12h16m-5-5l5 5-5 5" />
      )}
    </svg>
  );
}
