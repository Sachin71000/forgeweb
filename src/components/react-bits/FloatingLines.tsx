import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Timer } from "three/src/core/Timer.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { OrthographicCamera } from "three/src/cameras/OrthographicCamera.js";
import { PlaneGeometry } from "three/src/geometries/PlaneGeometry.js";
import { Scene } from "three/src/scenes/Scene.js";
import { ShaderMaterial } from "three/src/materials/ShaderMaterial.js";
import { Vector2 } from "three/src/math/Vector2.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import "./FloatingLines.css";

type Wave = "top" | "middle" | "bottom";
type WavePosition = { x: number; y: number; rotate: number };

export interface FloatingLinesProps {
  linesGradient?: string[];
  enabledWaves?: Wave[];
  lineCount?: number | number[];
  lineDistance?: number | number[];
  topWavePosition?: WavePosition;
  middleWavePosition?: WavePosition;
  bottomWavePosition?: WavePosition;
  animationSpeed?: number;
  interactive?: boolean;
  bendRadius?: number;
  bendStrength?: number;
  mouseDamping?: number;
  parallax?: boolean;
  parallaxStrength?: number;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  className?: string;
}

const vertexShader = `
precision highp float;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform float animationSpeed;
uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;
uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;
uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;
uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;
uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;
uniform bool parallax;
uniform vec2 parallaxOffset;
uniform vec3 lineGradient[8];
uniform int lineGradientCount;

mat2 rotate(float radians) {
  return mat2(cos(radians), sin(radians), -sin(radians), cos(radians));
}

vec3 getLineColor(float t) {
  if (lineGradientCount <= 0) return vec3(0.18, 0.72, 0.88);
  if (lineGradientCount == 1) return lineGradient[0];
  float scaled = clamp(t, 0.0, 0.9999) * float(lineGradientCount - 1);
  int index = int(floor(scaled));
  int nextIndex = min(index + 1, lineGradientCount - 1);
  return mix(lineGradient[index], lineGradient[nextIndex], fract(scaled)) * 0.54;
}

float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;
  float amplitude = sin(offset + time * 0.2) * 0.3;
  float y = sin(uv.x + offset + time * 0.1) * amplitude;
  if (shouldBend) {
    vec2 delta = screenUv - mouseUv;
    float influence = exp(-dot(delta, delta) * bendRadius);
    y += (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
  }
  return 0.0175 / max(abs(uv.y - y) + 0.01, 0.001) + 0.01;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;
  if (parallax) baseUv += parallaxOffset;

  vec2 mouseUv = vec2(-1000.0);
  if (interactive) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  vec3 color = vec3(0.0);
  if (enableBottom) {
    for (int i = 0; i < 32; ++i) {
      if (i >= bottomLineCount) break;
      float fi = float(i);
      float t = fi / max(float(bottomLineCount - 1), 1.0);
      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      color += getLineColor(t) * wave(
        ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
        1.5 + 0.2 * fi, baseUv, mouseUv, interactive
      ) * 0.2;
    }
  }
  if (enableMiddle) {
    for (int i = 0; i < 32; ++i) {
      if (i >= middleLineCount) break;
      float fi = float(i);
      float t = fi / max(float(middleLineCount - 1), 1.0);
      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      color += getLineColor(t) * wave(
        ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
        2.0 + 0.15 * fi, baseUv, mouseUv, interactive
      );
    }
  }
  if (enableTop) {
    for (int i = 0; i < 32; ++i) {
      if (i >= topLineCount) break;
      float fi = float(i);
      float t = fi / max(float(topLineCount - 1), 1.0);
      float angle = topWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      ruv.x *= -1.0;
      color += getLineColor(t) * wave(
        ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
        1.0 + 0.2 * fi, baseUv, mouseUv, interactive
      ) * 0.1;
    }
  }
  fragColor = vec4(color, 1.0);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;

const MAX_GRADIENT_STOPS = 8;
const DEFAULT_WAVES: Wave[] = ["top", "middle", "bottom"];
const DEFAULT_LINE_COUNT = [6];
const DEFAULT_LINE_DISTANCE = [5];
const DEFAULT_BOTTOM_POSITION: WavePosition = { x: 2, y: -0.7, rotate: -1 };

function hexToVector(hex: string) {
  let value = hex.trim().replace(/^#/, "");
  if (value.length === 3) value = value.split("").map((digit) => digit + digit).join("");
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed) || value.length !== 6) return new Vector3(1, 1, 1);
  return new Vector3(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

export default function FloatingLines({
  linesGradient,
  enabledWaves = DEFAULT_WAVES,
  lineCount = DEFAULT_LINE_COUNT,
  lineDistance = DEFAULT_LINE_DISTANCE,
  topWavePosition,
  middleWavePosition,
  bottomWavePosition = DEFAULT_BOTTOM_POSITION,
  animationSpeed = 1,
  interactive = true,
  bendRadius = 5,
  bendStrength = -0.5,
  mouseDamping = 0.05,
  parallax = true,
  parallaxStrength = 0.2,
  mixBlendMode = "screen",
  className = "",
}: FloatingLinesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetMouse = useRef(new Vector2(-1000, -1000));
  const currentMouse = useRef(new Vector2(-1000, -1000));
  const targetInfluence = useRef(0);
  const currentInfluence = useRef(0);
  const targetParallax = useRef(new Vector2());
  const currentParallax = useRef(new Vector2());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getNumber = (value: number | number[], wave: Wave, fallback: number) => {
      if (typeof value === "number") return value;
      return value[enabledWaves.indexOf(wave)] ?? fallback;
    };
    const enabled = (wave: Wave) => enabledWaves.includes(wave);
    const counts = {
      top: enabled("top") ? Math.min(32, getNumber(lineCount, "top", 6)) : 0,
      middle: enabled("middle") ? Math.min(32, getNumber(lineCount, "middle", 6)) : 0,
      bottom: enabled("bottom") ? Math.min(32, getNumber(lineCount, "bottom", 6)) : 0,
    };
    const distances = {
      top: enabled("top") ? getNumber(lineDistance, "top", 5) * 0.01 : 0.01,
      middle: enabled("middle") ? getNumber(lineDistance, "middle", 5) * 0.01 : 0.01,
      bottom: enabled("bottom") ? getNumber(lineDistance, "bottom", 5) * 0.01 : 0.01,
    };

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    setFailed(false);
    let active = true;
    let visible = document.visibilityState === "visible";
    let frame = 0;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;
    const dpr = innerWidth < 768 ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const gradient = Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1, 1, 1));
    const stops = (linesGradient ?? []).slice(0, MAX_GRADIENT_STOPS);
    stops.forEach((color, index) => gradient[index].copy(hexToVector(color)));

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Vector3(1, 1, 1) },
      animationSpeed: { value: animationSpeed },
      enableTop: { value: enabled("top") },
      enableMiddle: { value: enabled("middle") },
      enableBottom: { value: enabled("bottom") },
      topLineCount: { value: counts.top },
      middleLineCount: { value: counts.middle },
      bottomLineCount: { value: counts.bottom },
      topLineDistance: { value: distances.top },
      middleLineDistance: { value: distances.middle },
      bottomLineDistance: { value: distances.bottom },
      topWavePosition: { value: new Vector3(topWavePosition?.x ?? 10, topWavePosition?.y ?? 0.5, topWavePosition?.rotate ?? -0.4) },
      middleWavePosition: { value: new Vector3(middleWavePosition?.x ?? 5, middleWavePosition?.y ?? 0, middleWavePosition?.rotate ?? 0.2) },
      bottomWavePosition: { value: new Vector3(bottomWavePosition.x, bottomWavePosition.y, bottomWavePosition.rotate) },
      iMouse: { value: new Vector2(-1000, -1000) },
      interactive: { value: interactive && !reduceMotion },
      bendRadius: { value: bendRadius },
      bendStrength: { value: bendStrength },
      bendInfluence: { value: 0 },
      parallax: { value: parallax && !reduceMotion },
      parallaxOffset: { value: new Vector2() },
      lineGradient: { value: gradient },
      lineGradientCount: { value: stops.length },
    };

    const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    const geometry = new PlaneGeometry(2, 2);
    scene.add(new Mesh(geometry, material));
    const timer = new Timer();
    timer.connect(document);

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const pointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      targetMouse.current.set(x * dpr, (rect.height - y) * dpr);
      targetInfluence.current = 1;
      if (parallax) {
        targetParallax.current.set(
          ((x - rect.width / 2) / rect.width) * parallaxStrength,
          (-(y - rect.height / 2) / rect.height) * parallaxStrength,
        );
      }
    };
    const pointerLeave = () => { targetInfluence.current = 0; };
    const visibilityChange = () => { visible = document.visibilityState === "visible"; };
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };

    if (interactive && !reduceMotion) {
      window.addEventListener("pointermove", pointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", pointerLeave);
    }
    document.addEventListener("visibilitychange", visibilityChange);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);

    const render = (timestamp?: number) => {
      if (!active) return;
      if (visible) {
        timer.update(timestamp);
        uniforms.iTime.value = reduceMotion ? 0 : timer.getElapsed();
        if (interactive && !reduceMotion) {
          currentMouse.current.lerp(targetMouse.current, mouseDamping);
          uniforms.iMouse.value.copy(currentMouse.current);
          currentInfluence.current += (targetInfluence.current - currentInfluence.current) * mouseDamping;
          uniforms.bendInfluence.value = currentInfluence.current;
        }
        if (parallax && !reduceMotion) {
          currentParallax.current.lerp(targetParallax.current, mouseDamping);
          uniforms.parallaxOffset.value.copy(currentParallax.current);
        }
        renderer.render(scene, camera);
      }
      if (!reduceMotion) frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", pointerMove);
      document.documentElement.removeEventListener("pointerleave", pointerLeave);
      document.removeEventListener("visibilitychange", visibilityChange);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      timer.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [
    animationSpeed,
    bendRadius,
    bendStrength,
    bottomWavePosition,
    enabledWaves,
    interactive,
    lineCount,
    lineDistance,
    linesGradient,
    middleWavePosition,
    mouseDamping,
    parallax,
    parallaxStrength,
    topWavePosition,
  ]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`floating-lines-container ${failed ? "is-fallback" : ""} ${className}`}
      style={{ mixBlendMode }}
    />
  );
}
