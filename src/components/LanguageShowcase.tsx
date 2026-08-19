import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Braces, Code2, Database, Layers3, Terminal, Workflow } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const languages = [
  { name: "TypeScript", role: "Product & API", code: "type Product = Intent & Evidence", color: "#dfff68", icon: Braces },
  { name: "React", role: "Experience", code: "<Workspace state={verified} />", color: "#61dafb", icon: Code2 },
  { name: "Python", role: "Graph intelligence", code: "graph.impact(change, depth=2)", color: "#ffd43b", icon: Workflow },
  { name: "SQL", role: "Durable truth", code: "SELECT evidence FROM build", color: "#ff9ffc", icon: Database },
  { name: "Node.js", role: "Orchestration", code: "await pipeline.resume(jobId)", color: "#8cc84b", icon: Terminal },
  { name: "Any stack", role: "Adapter boundary", code: "source → graph → proof", color: "#c084fc", icon: Layers3 },
];

export function LanguageShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;
    const context = gsap.context(() => {
      const media = gsap.matchMedia();
      media.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            end: () => `+=${distance()}`,
            invalidateOnRefresh: true,
          },
        });
      });
      return () => media.revert();
    }, root);
    return () => context.revert();
  }, []);

  return (
    <section ref={rootRef} id="languages" className="language-showcase">
      <div className="language-showcase-heading">
        <p>SUPPORTED BY DESIGN</p>
        <h2>One intent. Many capable stacks.</h2>
      </div>
      <div ref={trackRef} className="language-track">
        {languages.map(({ name, role, code, color, icon: Icon }, index) => (
          <article className="language-panel" style={{ "--language-accent": color } as React.CSSProperties} key={name}>
            <div className="language-panel-top">
              <span>0{index + 1}</span>
              <Icon />
            </div>
            <div>
              <p>{role}</p>
              <h3>{name}</h3>
              <code>{code}</code>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
