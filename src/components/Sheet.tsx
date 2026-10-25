"use client";

import { useRef, useState, type ReactNode } from "react";

/** The height the rep last gave the panel (px), kept across panels and properties; null: it fits its content. */
let chosenHeight: number | null = null;
/** Folded: the handle and the title row, so most of the map is free to tap. */
const FOLDED_PX = 64;
/** Within this of folded or of the top, a drag snaps there (px). */
const SNAP_PX = 40;
/** Tallest the panel goes, as a share of the screen. */
const MAX_SHARE = 0.85;
/** Arrow keys move the handle by this share of the screen. */
const KEY_SHARE = 0.1;

/**
 * The results panel over the map, as a sheet the rep sizes: drag the handle
 * (or use the arrow keys on it) to give the map or the panel more room, tap
 * it to fold the panel down to its title and back. Until it's sized, the
 * panel fits its content up to 70 % of the screen.
 */
export default function Sheet({ handleLabel, children }: { handleLabel: string; children: ReactNode }) {
  const [height, setHeight] = useState<number | null>(() => chosenHeight);
  const [dragging, setDragging] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  /** The height before folding, to unfold back to. */
  const unfolded = useRef<number | null>(null);
  const moved = useRef(false);

  const maxPx = () => Math.round(window.innerHeight * MAX_SHARE);
  const current = () => sheet.current?.getBoundingClientRect().height ?? FOLDED_PX;
  const choose = (h: number | null) => {
    chosenHeight = h;
    setHeight(h);
  };
  const snap = (h: number) => (h < FOLDED_PX + SNAP_PX ? FOLDED_PX : h > maxPx() - SNAP_PX ? maxPx() : Math.round(h));
  const toggle = () => {
    if (current() > FOLDED_PX + 4) {
      unfolded.current = height;
      choose(FOLDED_PX);
    } else choose(unfolded.current !== null && unfolded.current > FOLDED_PX ? unfolded.current : null);
  };

  return (
    <div
      ref={sheet}
      data-measure-panel
      style={height === null ? undefined : { height }}
      className={`pointer-events-auto flex w-full max-w-md animate-fade-up flex-col overflow-hidden rounded-2xl bg-surface/95 shadow-2xl ring-1 ring-black/10 backdrop-blur dark:ring-white/10 ${
        height === null ? "max-h-[70dvh]" : ""
      } ${dragging ? "" : "transition-[height] duration-200 ease-out motion-reduce:transition-none"}`}
    >
      <button
        type="button"
        aria-label={handleLabel}
        title={handleLabel}
        className="group flex h-5 w-full shrink-0 cursor-row-resize touch-none items-center justify-center print:hidden"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, h: current(), moved: false };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = d.y - e.clientY;
          if (!d.moved && Math.abs(dy) < 4) return;
          d.moved = true;
          setDragging(true);
          setHeight(Math.min(maxPx(), Math.max(FOLDED_PX, d.h + dy)));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          if (!d?.moved) return;
          // A drag isn't also a tap.
          moved.current = true;
          choose(snap(Math.min(maxPx(), Math.max(FOLDED_PX, d.h + d.y - e.clientY))));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          setHeight(chosenHeight);
        }}
        onClick={() => {
          if (moved.current) moved.current = false;
          else toggle();
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const step = window.innerHeight * KEY_SHARE * (e.key === "ArrowUp" ? 1 : -1);
          choose(snap(Math.min(maxPx(), Math.max(FOLDED_PX, current() + step))));
        }}
      >
        <span className="h-1 w-10 rounded-full bg-line transition group-hover:bg-faint group-focus-visible:bg-accent" />
      </button>
      <div className="min-h-0 flex-auto space-y-3 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </div>
  );
}
