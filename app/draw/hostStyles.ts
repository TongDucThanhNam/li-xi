import type { CSSProperties } from "react";
import type { Rarity } from "@/lib/lixiPolicy";

export const pageBackground: CSSProperties = {
  backgroundImage: [
    "radial-gradient(circle at 8% 0%, rgba(230, 66, 66, 0.42), transparent 38%)",
    "radial-gradient(circle at 93% 0%, rgba(255, 209, 111, 0.22), transparent 34%)",
    "radial-gradient(circle at 84% 84%, rgba(137, 19, 19, 0.4), transparent 48%)",
    "radial-gradient(circle at 40% 20%, rgba(255, 236, 190, 0.12), transparent 42%)",
    "radial-gradient(circle at 60% 70%, rgba(255, 223, 155, 0.08), transparent 45%)",
    "linear-gradient(145deg, #1b0101 0%, #420303 54%, #210404 100%)",
  ].join(", "),
};

export const noiseStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
};

export const lightOneStyle: CSSProperties = {
  backgroundImage: "radial-gradient(circle, #800000 0%, transparent 70%)",
};

export const lightTwoStyle: CSSProperties = {
  backgroundImage: "radial-gradient(circle, #ff4500 0%, transparent 70%)",
};

export const lightThreeStyle: CSSProperties = {
  backgroundImage: "radial-gradient(circle, #ffd700 0%, transparent 70%)",
};

export const classNames = {
  page: "relative isolate min-h-screen overflow-hidden bg-[#1b0101] px-5 py-6 text-[var(--text-primary)]",
  guestPage: "min-h-screen bg-[#0a0101] p-0",
  layout: "relative z-10 mx-auto w-full max-w-[1240px]",
  header:
    "relative flex flex-wrap items-start justify-between gap-4 pb-4 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[linear-gradient(to_right,transparent,rgba(255,214,140,0.6),transparent)] after:opacity-80",
  title:
    "font-[var(--font-cinzel)] text-[clamp(34px,4.3vw,52px)] leading-[1.05] tracking-[0.8px] text-transparent bg-[linear-gradient(to_bottom,#fff5d6,#d4af37)] bg-clip-text drop-shadow-[0_4px_22px_rgba(0,0,0,0.55)]",
  subtitle:
    "mt-2 text-[16px] tracking-[0.5px] text-[rgba(255,220,147,0.85)] font-[var(--font-vn)]",
  headerActions: "flex flex-wrap gap-2",
  headerButton:
    "rounded-full border border-[rgba(212,175,55,0.45)] bg-[rgba(40,0,0,0.6)] px-4 py-2 font-[var(--font-playfair)] text-[13px] tracking-[0.6px] text-[#f8dea0] shadow-[0_10px_18px_rgba(10,2,2,0.35)] transition hover:-translate-y-[1px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:shadow-[0_10px_26px_rgba(34,5,5,0.5)]",
  budgetBar:
    "relative mt-4 flex flex-wrap gap-3 rounded-[16px] border border-[rgba(251,198,92,0.45)] bg-[radial-gradient(circle_at_10%_20%,_rgba(255,222,145,0.18),_transparent_45%),_linear-gradient(150deg,rgba(71,13,13,0.86),rgba(45,9,9,0.92))] px-3 py-3 text-[#ffe1a3] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),_0_10px_24px_rgba(12,2,2,0.4)]",
  budgetPill:
    "rounded-full bg-[rgba(18,4,4,0.45)] px-3 py-1 text-[13px] tracking-[0.4px] text-[#ffe1a3] shadow-[0_2px_8px_rgba(0,0,0,0.6)]",
  error:
    "mt-3 rounded-[10px] border border-[rgba(255,132,132,0.5)] bg-[rgba(109,16,16,0.6)] px-3 py-2 text-[#ffd2d2]",
  notice:
    "mt-3 rounded-[10px] border border-[rgba(150,233,172,0.48)] bg-[rgba(6,96,36,0.4)] px-3 py-2 text-[#d7ffe4]",
  resultBox:
    "mt-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-[rgba(255,227,163,0.72)] bg-[radial-gradient(circle_at_10%_20%,_rgba(255,222,145,0.2),_transparent_40%),_linear-gradient(145deg,rgba(104,36,10,0.6),rgba(64,15,15,0.66))] px-3 py-3 text-[#ffefcd] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25),_0_12px_24px_rgba(18,4,4,0.45)]",
  content: "mt-4 grid grid-cols-[1.4fr_1fr] gap-5 max-[1040px]:grid-cols-1",
  mainPanel: "grid gap-4",
  sidePanel: "grid gap-4",
  block:
    "relative rounded-[18px] border border-[rgba(248,189,85,0.4)] bg-[linear-gradient(160deg,rgba(62,11,11,0.92),rgba(27,6,6,0.94)),_radial-gradient(circle_at_100%_0%,_rgba(255,212,134,0.16),_transparent_42%)] p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),_0_18px_34px_rgba(15,0,0,0.45)] before:pointer-events-none before:absolute before:inset-[14px] before:rounded-[14px] before:border before:border-[rgba(255,225,142,0.08)]",
  blockTitle:
    "font-[var(--font-playfair)] text-[clamp(26px,3vw,35px)] leading-[1.15] tracking-[0.5px] text-[#ffe4ab] drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]",
  sideTitle:
    "font-[var(--font-playfair)] text-[clamp(24px,2.5vw,34px)] leading-[1.15] tracking-[0.5px] text-[#ffe4ab] drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]",
  label:
    "mb-2 inline-block font-[var(--font-vn)] text-[rgba(255,223,153,0.88)] tracking-[0.5px]",
  input:
    "h-[54px] w-full rounded-[14px] border border-[rgba(246,185,76,0.55)] bg-[radial-gradient(circle_at_10%_20%,_rgba(255,219,141,0.15),_transparent_55%),_rgba(14,2,2,0.86)] px-3 text-[#ffe3af] shadow-inner outline-none transition focus:border-[rgba(255,222,146,0.92)] focus:shadow-[0_0_0_3px_rgba(255,222,146,0.18),_0_8px_18px_rgba(12,2,2,0.4)]",
  primaryButton:
    "relative w-full rounded-full border border-[rgba(212,175,55,0.5)] bg-[radial-gradient(circle_at_20%_20%,_rgba(255,229,170,0.16),_transparent_55%),_rgba(40,0,0,0.6)] py-3 font-[var(--font-playfair)] font-semibold tracking-[0.8px] text-[#f6d895] shadow-[0_12px_24px_rgba(10,2,2,0.45)] transition hover:-translate-y-[2px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
  secondaryButton:
    "relative w-full rounded-full border border-[rgba(212,175,55,0.35)] bg-[rgba(40,0,0,0.4)] py-3 font-[var(--font-playfair)] tracking-[0.6px] text-[rgba(255,232,192,0.8)] transition hover:-translate-y-[2px] hover:border-[rgba(255,225,142,0.9)] hover:bg-[rgba(80,0,0,0.8)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
  inventoryList: "grid gap-2",
  historyList: "grid gap-2",
  inventoryItem:
    "flex items-center justify-between gap-2 rounded-[14px] border border-[rgba(245,188,80,0.38)] bg-[linear-gradient(145deg,rgba(20,4,4,0.92),rgba(40,8,8,0.88))] px-3 py-2 text-[#ffe3ad] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),_0_8px_16px_rgba(12,2,2,0.35)]",
  historyItem:
    "flex items-center justify-between gap-2 rounded-[14px] border border-[rgba(245,188,80,0.38)] bg-[linear-gradient(145deg,rgba(20,4,4,0.92),rgba(40,8,8,0.88))] px-3 py-2 text-[#ffe3ad] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),_0_8px_16px_rgba(12,2,2,0.35)]",
  itemMeta: "flex flex-col items-end gap-1 text-[13px] text-[rgba(255,227,163,0.9)]",
  empty: "text-[rgba(255,218,151,0.7)]",
  rarityBadge:
    "rounded-full border px-2 py-[3px] text-[11px] uppercase tracking-[0.5px] font-[var(--font-playfair)]",
};

export function rarityClass(rarity: Rarity) {
  const variants: Record<Rarity, string> = {
    common: "text-[#e2e2e2] bg-[rgba(126,126,126,0.2)] border-[rgba(214,214,214,0.4)]",
    rare: "text-[#ffd5a0] bg-[rgba(129,36,36,0.35)] border-[rgba(255,196,130,0.55)]",
    legend: "text-[#ffe8aa] bg-[rgba(170,123,8,0.33)] border-[rgba(255,211,105,0.62)]",
  };
  return variants[rarity];
}
