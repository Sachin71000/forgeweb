import { useLayoutEffect, useRef } from "react";
import { animate, svg, utils, type JSAnimation } from "animejs";

function generatePoints() {
  const total = utils.random(8, 42);
  const innerRadius = utils.random(18, 48);
  const outerRadius = 56;
  const count = total % 2 ? total + 1 : total;
  let points = "";
  for (let index = 0; index < count; index += 1) {
    const radius = index % 2 ? innerRadius : outerRadius;
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    const x = 152 + utils.round(radius * Math.cos(angle), 0);
    const y = 56 + utils.round(radius * Math.sin(angle), 0);
    points += `${x},${y} `;
  }
  return points;
}

export function MorphingSigil() {
  const rootRef = useRef<SVGSVGElement>(null);
  const sourceRef = useRef<SVGPolygonElement>(null);
  const targetRef = useRef<SVGPolygonElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!root || !source || !target) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let active = true;
    let current: JSAnimation | undefined;

    const morph = () => {
      if (!active) return;
      utils.set(target, { points: generatePoints() });
      current = animate(source, {
        points: svg.morphTo(target),
        ease: "inOutCirc",
        duration: 780,
        onComplete: morph,
      });
    };
    morph();

    return () => {
      active = false;
      current?.pause();
    };
  }, []);

  return (
    <svg ref={rootRef} viewBox="0 0 304 112" className="morphing-sigil" role="img" aria-label="Continuously evolving ForgeWeb specification symbol">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none">
        <polygon ref={sourceRef} points="152,4 170,38 204,56 170,74 152,108 134,74 100,56 134,38" />
        <polygon ref={targetRef} opacity="0" points="152,4 170,38 204,56 170,74 152,108 134,74 100,56 134,38" />
      </g>
      <circle cx="152" cy="56" r="3" fill="currentColor" />
    </svg>
  );
}
