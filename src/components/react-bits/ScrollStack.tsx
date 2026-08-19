/* React Bits-inspired ScrollStack, adapted to native page scroll + GSAP. */
import { Children, useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function ScrollStackItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`scroll-stack-card ${className}`}>{children}</article>;
}

export default function ScrollStack({ children, className = "" }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const context = gsap.context(() => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = gsap.utils.toArray<HTMLElement>(".scroll-stack-card");
        cards.forEach((card, index) => {
          gsap.fromTo(
            card,
            { y: 70, scale: 0.93, rotate: index % 2 ? 1.2 : -1.2 },
            {
              y: 0,
              scale: 1,
              rotate: 0,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                start: "top 88%",
                end: "top 24%",
                scrub: 0.8,
              },
            },
          );
        });
      });
      return () => media.revert();
    }, root);
    return () => context.revert();
  }, []);

  return (
    <div ref={rootRef} className={`scroll-stack ${className}`}>
      {Children.map(children, (child) => child)}
      <div className="scroll-stack-release" aria-hidden="true" />
    </div>
  );
}
