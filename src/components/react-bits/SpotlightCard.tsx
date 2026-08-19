import { useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  light?: string;
};

/**
 * Platform-only spotlight interaction adapted for ForgeWeb from the React Bits
 * component pattern. See THIRD_PARTY_NOTICES.md for license information.
 */
export function SpotlightCard({
  children,
  className,
  light = "rgba(223, 255, 104, 0.13)",
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const updateSpotlight = (event: MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const bounds = card.getBoundingClientRect();
    card.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
    card.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
    card.style.setProperty("--spotlight-color", light);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={updateSpotlight}
      className={cn("spotlight-card", className)}
    >
      {children}
    </div>
  );
}
