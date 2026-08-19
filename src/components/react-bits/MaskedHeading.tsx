/* React Bits-inspired MaskedHeading. Platform-only; see THIRD_PARTY_NOTICES.md. */
import { useLayoutEffect, useRef, type CSSProperties, type ElementType } from "react";
import { gsap } from "gsap";

export interface MaskedHeadingProps {
  text?: string;
  tag?: ElementType;
  mediaType?: "image" | "video";
  src?: string;
  poster?: string;
  fillScale?: number;
  parallax?: number;
  reveal?: "rise" | "wipe" | "fade" | "none";
  trigger?: "view" | "mount" | "hover";
  align?: "left" | "center" | "right";
  className?: string;
  style?: CSSProperties;
}

export default function MaskedHeading({
  text = "Designed in the details",
  tag: Tag = "h1",
  src = "",
  poster = "",
  fillScale = 1.25,
  parallax = 26,
  reveal = "rise",
  trigger = "mount",
  align = "left",
  className = "",
  style,
}: MaskedHeadingProps) {
  const rootRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const textLayer = textRef.current;
    if (!root || !textLayer) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || reveal === "none") return;

    const context = gsap.context(() => {
      const play = () => {
        if (reveal === "wipe") {
          gsap.fromTo(textLayer, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.25, ease: "power4.inOut" });
        } else if (reveal === "fade") {
          gsap.fromTo(textLayer, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "power3.out" });
        } else {
          gsap.fromTo(textLayer, { yPercent: 110, rotate: 2 }, { yPercent: 0, rotate: 0, duration: 1.15, ease: "power4.out" });
        }
      };

      if (trigger === "hover") {
        root.addEventListener("pointerenter", play);
      } else if (trigger === "view") {
        const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
            play();
            observer.disconnect();
          }
        }, { threshold: 0.3 });
        observer.observe(root);
        return () => observer.disconnect();
      } else {
        play();
      }
    }, root);

    const onMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * parallax;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * parallax;
      gsap.to(textLayer, { backgroundPosition: `calc(50% + ${x}px) calc(50% + ${y}px)`, duration: 0.6, ease: "power3.out", overwrite: true });
    };
    root.addEventListener("pointermove", onMove);

    return () => {
      context.revert();
      root.removeEventListener("pointermove", onMove);
    };
  }, [parallax, reveal, trigger]);

  const backgroundImage = `url(${src || poster})`;
  return (
    <Tag
      ref={rootRef}
      className={`masked-heading ${className}`}
      style={{ textAlign: align, ...style }}
      aria-label={text}
    >
      <span
        ref={textRef}
        aria-hidden="true"
        style={{ backgroundImage, backgroundSize: `${fillScale * 100}%` }}
      >
        {text}
      </span>
    </Tag>
  );
}
