/* React Bits-inspired BorderGlow. Platform-only; see THIRD_PARTY_NOTICES.md. */
import { useRef, type PointerEvent, type ReactNode } from "react";

export interface BorderGlowProps {
  children?: ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  alwaysOn?: boolean;
  colors?: string[];
}

export default function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "40 80 80",
  backgroundColor = "#120f17",
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  alwaysOn = false,
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
}: BorderGlowProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const edge = Math.min(x, y, bounds.width - x, bounds.height - y);
    const proximity = alwaysOn ? 1 : Math.max(0, 1 - edge / Math.max(edgeSensitivity, 1));
    root.style.setProperty("--border-glow-x", `${x}px`);
    root.style.setProperty("--border-glow-y", `${y}px`);
    root.style.setProperty("--border-glow-opacity", `${proximity}`);
  };

  const onPointerLeave = () => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--border-glow-x", alwaysOn ? "100%" : "50%");
    root.style.setProperty("--border-glow-y", "50%");
    root.style.setProperty("--border-glow-opacity", alwaysOn ? "1" : "0");
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`border-glow ${className}`}
      style={{
        backgroundColor,
        borderRadius,
        "--border-glow-radius": `${glowRadius}px`,
        "--border-glow-opacity": alwaysOn ? 1 : 0,
        "--border-glow-x": alwaysOn ? "100%" : "50%",
        "--border-glow-y": "50%",
        "--border-glow-intensity": glowIntensity,
        "--border-glow-cone": `${coneSpread}%`,
        "--border-glow-hsl": glowColor,
        "--border-glow-a": colors[0],
        "--border-glow-b": colors[1],
        "--border-glow-c": colors[2],
      } as React.CSSProperties}
    >
      <div className="border-glow-content">{children}</div>
    </div>
  );
}
