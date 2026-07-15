import type { ReactNode } from "react";

export type IconName = "pencil" | "eraser" | "fill" | "picker" | "marquee" | "lasso" | "move" | "eye" | "lock" | "link" | "plus" | "trash" | "play" | "pause" | "onion" | "swap" | "grid";

const marks: Record<IconName, ReactNode> = {
  pencil: <><path d="M2 10h2l7-7-2-2-7 7z"/><path d="M7.5 2.5l2 2"/></>,
  eraser: <><path d="M2 8l5-6 4 4-4 5H4z"/><path d="M6 11h5"/></>,
  fill: <><path d="M3 3l4 4-3 3-3-3z"/><path d="M8 8c1 1 2 2 2 3"/></>,
  picker: <><path d="M3 10l7-7"/><path d="M7 2l3 3"/><path d="M2 10h3"/></>,
  marquee: <rect x="2" y="2" width="8" height="8" strokeDasharray="2 1"/>,
  lasso: <><path d="M2 6c0-5 8-5 8 0 0 3-5 4-7 2-1-1 1-2 2 0 1 2-1 3-2 2"/></>,
  move: <><path d="M6 1v10M1 6h10"/><path d="M6 1L4 3M6 1l2 2M1 6l2-2M1 6l2 2M11 6L9 4m2 2L9 8M6 11L4 9m2 2 2-2"/></>,
  eye: <><path d="M1 6s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3z"/><rect x="5" y="5" width="2" height="2"/></>,
  lock: <><rect x="3" y="5" width="6" height="6"/><path d="M4 5V3c0-2 4-2 4 0v2"/></>,
  link: <><path d="M5 4L4 3C2 1 0 4 2 6l1 1c1 1 2 0 3-1"/><path d="M7 8l1 1c2 2 4-1 2-3L9 5C8 4 7 5 6 6"/></>,
  plus: <path d="M6 2v8M2 6h8"/>,
  trash: <><path d="M3 4h6l-1 7H4z"/><path d="M2 3h8M5 1h2"/></>,
  play: <path d="M3 2l7 4-7 4z"/>,
  pause: <><path d="M3 2v8M8 2v8"/></>,
  onion: <><path d="M6 1C5 3 2 4 2 7c0 5 8 5 8 0 0-3-3-4-4-6z"/><path d="M4 7c0 2 4 2 4 0"/></>,
  swap: <><path d="M2 4h7L7 2m2 2L7 6"/><path d="M10 8H3l2-2M3 8l2 2"/></>,
  grid: <><path d="M1 1h10v10H1zM1 6h10M6 1v10"/></>,
};

export function PixelIcon({ name }: { name: IconName }) {
  return <svg className="pixel-icon" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter">{marks[name]}</svg>;
}
