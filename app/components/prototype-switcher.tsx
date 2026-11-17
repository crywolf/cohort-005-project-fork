/**
 * PROTOTYPE (throwaway) — floating variant switcher used by wayfinder UI
 * prototypes. Renders a fixed bottom-centre bar that cycles `?variant=`
 * search param variants. Hidden in production builds.
 */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: PrototypeVariant[];
  current: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function cycle(direction: -1 | 1) {
    const index = variants.findIndex((v) => v.key === current);
    const next =
      variants[(index + direction + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    navigate(
      { search: params.toString() },
      { replace: true, preventScrollReset: true }
    );
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, variants]);

  if (import.meta.env.PROD) return null;

  const active = variants.find((v) => v.key === current);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-1.5 text-zinc-100 shadow-xl">
      <FlaskConical className="size-4 text-zinc-400" />
      <button
        onClick={() => cycle(-1)}
        className="rounded-full p-1 hover:bg-zinc-700"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 px-2 text-center text-xs">
        <span className="font-semibold">{current}</span>
        {active ? ` (${active.name})` : null}
      </span>
      <button
        onClick={() => cycle(1)}
        className="rounded-full p-1 hover:bg-zinc-700"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
