import { useLayoutEffect, useRef } from "react";
import {
  animate,
  createAnimatable,
  createScope,
  createTimeline,
  stagger,
  utils,
} from "animejs";
import { Braces, Check, Code2, Network, ShieldCheck } from "lucide-react";

const orbitNodes = [
  { label: "SPEC", className: "orbit-node-spec", icon: Braces },
  { label: "CODE", className: "orbit-node-code", icon: Code2 },
  { label: "GRAPH", className: "orbit-node-graph", icon: Network },
  { label: "PROVE", className: "orbit-node-prove", icon: ShieldCheck },
];

export function AnimeBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;

    const scope = createScope({
      root,
      mediaQueries: {
        reduceMotion: "(prefers-reduced-motion: reduce)",
        isMobile: "(max-width: 767px)",
      },
    }).add((self) => {
      const reduceMotion = self?.matches.reduceMotion ?? false;
      const isMobile = self?.matches.isMobile ?? false;

      utils.set(stage, {
        perspective: 1100,
        rotateX: isMobile ? -5 : -8,
        rotateY: isMobile ? -4 : -10,
        translateZ: 0,
      });
      utils.set(".anime-orbit-a", { rotateX: 68, rotateY: -12, rotateZ: 18 });
      utils.set(".anime-orbit-b", { rotateX: 72, rotateY: 18, rotateZ: -28 });
      utils.set(".anime-orbit-c", { rotateX: 58, rotateY: -28, rotateZ: 52 });
      utils.set(".anime-depth-card", { translateZ: -120, rotateY: -8 });
      utils.set(".anime-core", { translateZ: 55 });

      if (reduceMotion) {
        utils.set(".anime-reveal", { opacity: 1, scale: 1, translateZ: 0 });
        return;
      }

      const entrance = createTimeline({
        defaults: { ease: "outExpo" },
      })
        .add(
          ".anime-orbit",
          {
            opacity: [0, 0.72],
            scale: [0.54, 1],
            translateZ: [-280, 0],
            duration: 1500,
            delay: stagger(110, { from: "center" }),
          },
          0,
        )
        .add(
          ".anime-core",
          {
            opacity: [0, 1],
            scale: [0.4, 1],
            rotateZ: [-30, 0],
            duration: 1200,
          },
          260,
        )
        .add(
          ".anime-orbit-node",
          {
            opacity: [0, 1],
            scale: [0.35, 1],
            translateZ: [-80, 45],
            duration: 850,
            delay: stagger(95),
          },
          520,
        )
        .add(
          ".anime-depth-card",
          {
            opacity: [0, 1],
            translateY: [24, 0],
            translateZ: [-180, -80],
            duration: 900,
            delay: stagger(120),
          },
          650,
        )
        .add(
          ".anime-particle",
          {
            opacity: [0, stagger([0.2, 0.76])],
            scale: [0, 1],
            duration: 600,
            delay: stagger(38, { from: "center" }),
          },
          700,
        );

      const loops = [
        animate(".anime-orbit-a", {
          rotateZ: "+=1turn",
          duration: 28000,
          ease: "linear",
          loop: true,
        }),
        animate(".anime-orbit-b", {
          rotateZ: "-=1turn",
          duration: 35000,
          ease: "linear",
          loop: true,
        }),
        animate(".anime-orbit-c", {
          rotateZ: "+=1turn",
          duration: 44000,
          ease: "linear",
          loop: true,
        }),
        animate(".anime-core-ring", {
          rotateZ: "+=1turn",
          duration: 18000,
          ease: "linear",
          loop: true,
        }),
        animate(".anime-depth-card", {
          translateY: stagger([-7, 8]),
          rotateZ: stagger([-1.4, 1.4]),
          duration: stagger([3200, 4400]),
          ease: "inOutSine",
          alternate: true,
          loop: true,
        }),
        animate(".anime-particle", {
          opacity: stagger([0.18, 0.78], { from: "center" }),
          scale: stagger([0.7, 1.45], { from: "center" }),
          duration: stagger([1300, 2600]),
          ease: "inOutSine",
          alternate: true,
          loop: true,
        }),
      ];

      const stageMotion = createAnimatable(stage, {
        rotateX: 520,
        rotateY: 520,
        translateX: 620,
        translateY: 620,
        ease: "out(4)",
      });

      const handlePointerMove = (event: PointerEvent) => {
        const bounds = root.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          return;
        }

        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        stageMotion.rotateY((isMobile ? -4 : -10) + x * 12);
        stageMotion.rotateX((isMobile ? -5 : -8) - y * 9);
        stageMotion.translateX(x * 13);
        stageMotion.translateY(y * 9);
      };

      const resetPointer = () => {
        stageMotion.rotateY(isMobile ? -4 : -10);
        stageMotion.rotateX(isMobile ? -5 : -8);
        stageMotion.translateX(0);
        stageMotion.translateY(0);
      };

      const observer = new IntersectionObserver(
        ([entry]) => {
          loops.forEach((animation) => {
            if (entry.isIntersecting) animation.play();
            else animation.pause();
          });
        },
        { threshold: 0.05 },
      );

      observer.observe(root);
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      root.addEventListener("pointerleave", resetPointer);

      return () => {
        entrance.pause();
        loops.forEach((animation) => animation.pause());
        observer.disconnect();
        window.removeEventListener("pointermove", handlePointerMove);
        root.removeEventListener("pointerleave", resetPointer);
      };
    });

    return () => scope.revert();
  }, []);

  return (
    <div ref={rootRef} className="anime-scene" aria-hidden="true">
      <div className="anime-scene-haze" />
      <div className="anime-floor" />
      <div ref={stageRef} className="anime-stage">
        <div className="anime-orbit anime-orbit-a anime-reveal">
          <div className="anime-orbit-track" />
        </div>
        <div className="anime-orbit anime-orbit-b anime-reveal">
          <div className="anime-orbit-track" />
        </div>
        <div className="anime-orbit anime-orbit-c anime-reveal">
          <div className="anime-orbit-track" />
        </div>

        <div className="anime-core anime-reveal">
          <div className="anime-core-ring" />
          <div className="anime-core-inner">
            <span className="anime-core-dot" />
            FW
          </div>
        </div>

        {orbitNodes.map(({ label, className, icon: Icon }) => (
          <div className={`anime-orbit-node anime-reveal ${className}`} key={label}>
            <span><Icon /></span>
            {label}
          </div>
        ))}

        <div className="anime-depth-card anime-depth-card-a anime-reveal">
          <div className="anime-depth-card-icon"><Check /></div>
          <div>
            <strong>12 controls</strong>
            <span>verified</span>
          </div>
        </div>
        <div className="anime-depth-card anime-depth-card-b anime-reveal">
          <span className="anime-live-dot" />
          <div>
            <strong>Graph live</strong>
            <span>156 edges</span>
          </div>
        </div>
        <div className="anime-depth-card anime-depth-card-c anime-reveal">
          <code>REQ-014</code>
          <div className="anime-mini-bars"><i /><i /><i /></div>
        </div>

        {Array.from({ length: 24 }, (_, index) => (
          <i
            className="anime-particle anime-reveal"
            key={index}
            style={{
              left: `${10 + ((index * 37) % 82)}%`,
              top: `${8 + ((index * 53) % 80)}%`,
            }}
          />
        ))}
      </div>
      <div className="anime-scene-vignette" />
    </div>
  );
}
