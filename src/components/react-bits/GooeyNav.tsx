import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import "./GooeyNav.css";

export interface GooeyNavItem {
  label: string;
  href: string;
}

export interface GooeyNavProps {
  items: GooeyNavItem[];
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  colors?: number[];
  initialActiveIndex?: number;
}

type Particle = {
  start: [number, number];
  end: [number, number];
  time: number;
  scale: number;
  color: number;
  rotate: number;
};

export default function GooeyNav({
  items,
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  colors = [1, 2, 3, 1, 2, 3, 1, 4],
  initialActiveIndex = 0,
}: GooeyNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<number[]>([]);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);

  const clearParticles = () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    filterRef.current?.querySelectorAll(".particle").forEach((particle) => particle.remove());
    filterRef.current?.classList.remove("active");
  };

  const updateEffectPosition = (element: HTMLElement) => {
    const container = containerRef.current;
    const filter = filterRef.current;
    const text = textRef.current;
    if (!container || !filter || !text) return;
    const containerRect = container.getBoundingClientRect();
    const position = element.getBoundingClientRect();
    const styles = {
      left: `${position.x - containerRect.x}px`,
      top: `${position.y - containerRect.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
    };
    Object.assign(filter.style, styles);
    Object.assign(text.style, styles);
    text.textContent = element.textContent;
  };

  const noise = (amount = 1) => amount / 2 - Math.random() * amount;
  const getPosition = (distance: number, index: number) => {
    const angle = ((360 + noise(8)) / particleCount) * index * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)] as [number, number];
  };
  const createParticle = (index: number, time: number): Particle => {
    const rotation = noise(particleR / 10);
    return {
      start: getPosition(particleDistances[0], particleCount - index),
      end: getPosition(particleDistances[1] + noise(7), particleCount - index),
      time,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)] ?? 1,
      rotate: (rotation > 0 ? rotation + particleR / 20 : rotation - particleR / 20) * 10,
    };
  };

  const makeParticles = () => {
    const filter = filterRef.current;
    if (!filter || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    clearParticles();
    void filter.offsetWidth;
    const bubbleTime = animationTime * 2 + timeVariance;
    filter.style.setProperty("--time", `${bubbleTime}ms`);
    for (let index = 0; index < particleCount; index += 1) {
      const time = animationTime * 2 + noise(timeVariance * 2);
      const particleData = createParticle(index, time);
      const createTimer = window.setTimeout(() => {
        const particle = document.createElement("span");
        const point = document.createElement("span");
        particle.className = "particle";
        point.className = "point";
        particle.style.setProperty("--start-x", `${particleData.start[0]}px`);
        particle.style.setProperty("--start-y", `${particleData.start[1]}px`);
        particle.style.setProperty("--end-x", `${particleData.end[0]}px`);
        particle.style.setProperty("--end-y", `${particleData.end[1]}px`);
        particle.style.setProperty("--time", `${particleData.time}ms`);
        particle.style.setProperty("--scale", `${particleData.scale}`);
        particle.style.setProperty("--color", `var(--color-${particleData.color}, white)`);
        particle.style.setProperty("--rotate", `${particleData.rotate}deg`);
        particle.appendChild(point);
        filter.appendChild(particle);
        requestAnimationFrame(() => filter.classList.add("active"));
        const removeTimer = window.setTimeout(() => particle.remove(), time);
        timersRef.current.push(removeTimer);
      }, 30);
      timersRef.current.push(createTimer);
    }
  };

  const selectItem = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (activeIndex === index) return;
    const item = event.currentTarget.parentElement;
    if (!item) return;
    setActiveIndex(index);
    updateEffectPosition(item);
    textRef.current?.classList.remove("active");
    void textRef.current?.offsetWidth;
    textRef.current?.classList.add("active");
    makeParticles();
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeItem = navRef.current?.children.item(activeIndex) as HTMLElement | null;
    if (!container || !activeItem) return;
    updateEffectPosition(activeItem);
    textRef.current?.classList.add("active");
    const resizeObserver = new ResizeObserver(() => {
      const current = navRef.current?.children.item(activeIndex) as HTMLElement | null;
      if (current) updateEffectPosition(current);
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [activeIndex]);

  useLayoutEffect(() => () => clearParticles(), []);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      <nav aria-label="Primary navigation">
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li className={activeIndex === index ? "active" : ""} key={item.href}>
              <a
                href={item.href}
                aria-current={activeIndex === index ? "page" : undefined}
                onClick={(event) => selectItem(event, index)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} />
      <span className="effect text" ref={textRef} />
    </div>
  );
}
