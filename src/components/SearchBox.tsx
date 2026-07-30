"use client";

import { useEffect, useRef, useState } from "react";

export interface PlaceResult {
  id: string;
  primary: string;
  secondary: string;
  lat: number;
  lon: number;
  /** [south, west, north, east] when the place has a known extent. */
  bbox?: [number, number, number, number];
  isGolf: boolean;
}

interface SearchBoxProps {
  onSelect: (place: PlaceResult) => void;
  /** Proximity bias for suggestions (usually the current map center). */
  getBias: () => { lat: number; lon: number } | null;
}

const PHOTON_URL = "https://photon.komoot.io/api/";

interface PhotonProps {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  extent?: number[];
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProps;
}

function parsePhoton(data: unknown): PlaceResult[] {
  const features =
    (data as { features?: PhotonFeature[] })?.features ?? [];

  const results: PlaceResult[] = features.map((feature, index) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [0, 0];
    const p = feature.properties ?? {};
    const isGolf = p.osm_value === "golf_course" || p.osm_value === "golf";

    const address = [p.housenumber, p.street].filter(Boolean).join(" ");
    const primary = (p.name || address || p.city || p.state || "Result").trim();
    const secondary = [
      p.name ? p.street : null,
      p.city,
      p.state,
      p.country,
    ]
      .filter((part): part is string => Boolean(part) && part !== primary)
      .join(", ");

    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(p.extent) && p.extent.length === 4) {
      // Photon extent is [minLon, maxLat, maxLon, minLat].
      const [w, n, e, s] = p.extent;
      bbox = [s, w, n, e];
    }

    return {
      id: `${p.osm_type ?? "x"}-${p.osm_id ?? index}`,
      primary,
      secondary,
      lat,
      lon,
      bbox,
      isGolf,
    };
  });

  // Float golf courses to the top; keep relevance order otherwise.
  results.sort((a, b) => Number(b.isGolf) - Number(a.isGolf));
  return results;
}

export default function SearchBox({ onSelect, getBias }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A query under two characters has no results and is not loading, whatever
  // a previous query left behind in state.
  const tooShort = query.trim().length < 2;
  const visibleSuggestions = tooShort ? [] : suggestions;
  const isLoading = tooShort ? false : loading;

  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to fetch. Deliberately no setState here — "too short means no
    // results" is a render-time truth (see tooShort below), not a state
    // transition. Setting it here both tripped React 19's cascading-render
    // rule and raced the in-flight request this effect's cleanup aborts.
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL(PHOTON_URL);
        url.searchParams.set("q", trimmed);
        url.searchParams.set("limit", "8");
        url.searchParams.set("lang", "en");
        const bias = getBias();
        if (bias) {
          url.searchParams.set("lat", String(bias.lat));
          url.searchParams.set("lon", String(bias.lon));
        }

        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = await response.json();

        setSuggestions(parsePhoton(data));
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, getBias]);

  const choose = (place: PlaceResult) => {
    setQuery(place.primary);
    setOpen(false);
    setSuggestions([]);
    onSelect(place);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || visibleSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleSuggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(visibleSuggestions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[1300] flex justify-center p-2"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="pointer-events-auto relative w-full max-w-md">
        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-lg ring-1 ring-black/10">
          <svg
            className="h-4 w-4 shrink-0 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => visibleSuggestions.length > 0 && setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Search a golf course or address"
            className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            aria-label="Search a golf course or address"
            autoComplete="off"
          />
          {isLoading && (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          )}
          {!isLoading && query && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setSuggestions([]);
                setOpen(false);
              }}
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {open && visibleSuggestions.length > 0 && (
          <ul
            className="absolute inset-x-0 top-full mt-2 max-h-[50dvh] overflow-y-auto rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/10"
            onMouseDown={(e) => e.preventDefault()}
          >
            {visibleSuggestions.map((place, index) => (
              <li key={place.id}>
                <button
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    choose(place);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition ${
                    index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="mt-0.5 text-base leading-none">
                    {place.isGolf ? "⛳" : "📍"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {place.primary}
                    </span>
                    {place.secondary && (
                      <span className="block truncate text-xs text-slate-500">
                        {place.secondary}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
