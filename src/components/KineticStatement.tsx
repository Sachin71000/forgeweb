import { useLayoutEffect, useRef } from "react";
import { createTimeline, splitText, stagger } from "animejs";

export function KineticStatement() {
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const target = textRef.current;
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const split = splitText(target, {
      words: { wrap: "clip" },
      chars: true,
    });

    const timeline = createTimeline({
      defaults: { ease: "out(3)", duration: 520 },
    })
      .add(split.words, {
        translateY: [14, 0],
      }, stagger(80))
      .add(split.chars, {
        opacity: [0.2, 1],
      }, stagger(7, { from: "center" }))
      .init();

    return () => {
      timeline.pause();
      split.revert();
    };
  }, []);

  return (
    <p ref={textRef} className="kinetic-statement">
      Specify clearly · forge securely · verify completely
    </p>
  );
}
