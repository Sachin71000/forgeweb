/*
 * Adapted from React Bits GradientWaves for the ForgeWeb platform UI.
 * React Bits: MIT + Commons Clause. See THIRD_PARTY_NOTICES.md.
 */
import { useEffect, useRef, useState } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

export type GradientWavesDetail = "low" | "medium" | "high";

export interface GradientWavesProps {
  horizonColor?: string;
  waveColor?: string;
  crestColor?: string;
  speed?: number;
  amplitude?: number;
  waveScale?: number;
  waveRatio?: number;
  swell?: number;
  turbulence?: number;
  tilt?: number;
  zoom?: number;
  height?: number;
  fogDepth?: number;
  detail?: GradientWavesDetail;
  brightness?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  parallaxStrength?: number;
  grain?: boolean;
  grainIntensity?: number;
  className?: string;
}

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (abs(dist) > 20000.0) return 20000.0;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  float c = cos(xrot);
  float s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;
  float fog = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = clamp(mix(uHorizonColor, body, fog) * uBrightness, 0.0, 1.0);
  float alpha = clamp(fog, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  fragColor = vec4(col * clamp(alpha, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;

const hexToRgb = (hex: string): Float32Array => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return new Float32Array([1, 1, 1]);
  return new Float32Array([
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  ]);
};

export default function GradientWaves({
  horizonColor = "#0a0d0c",
  waveColor = "#5227ff",
  crestColor = "#ff9ffc",
  speed = 0.4,
  amplitude = 2.5,
  waveScale = 0.6,
  waveRatio = 0.9,
  swell = 35,
  turbulence = 20,
  tilt = 1.11,
  zoom = 1,
  height = 5.5,
  fogDepth = 15,
  detail = "medium",
  brightness = 1,
  opacity = 1,
  mouseInteraction = true,
  parallaxStrength = 0.5,
  grain = true,
  grainIntensity = 0.05,
  className = "",
}: GradientWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef({
    horizonColor, waveColor, crestColor, speed, amplitude, waveScale, waveRatio,
    swell, turbulence, tilt, zoom, height, fogDepth, detail, brightness, opacity,
    mouseInteraction, parallaxStrength, grain, grainIntensity,
  });
  const [failed, setFailed] = useState(false);

  settingsRef.current = {
    horizonColor, waveColor, crestColor, speed, amplitude, waveScale, waveRatio,
    swell, turbulence, tilt, zoom, height, fogDepth, detail, brightness, opacity,
    mouseInteraction, parallaxStrength, grain, grainIntensity,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.innerWidth < 768 ? 1 : 1.5, window.devicePixelRatio || 1),
      });
    } catch {
      setFailed(true);
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.className = "size-full block";
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uWaveScale: { value: waveScale },
        uWaveRatio: { value: waveRatio },
        uSwell: { value: swell },
        uTurbulence: { value: turbulence },
        uTilt: { value: tilt },
        uZoom: { value: zoom },
        uHeight: { value: height },
        uFogDepth: { value: fogDepth },
        uSteps: { value: detail === "low" ? 40 : detail === "high" ? 110 : 70 },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uGrain: { value: grain ? 1 : 0 },
        uGrainIntensity: { value: grainIntensity },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uParallax: { value: parallaxStrength },
        uEnableMouse: { value: mouseInteraction },
        uHorizonColor: { value: hexToRgb(horizonColor) },
        uWaveColor: { value: hexToRgb(waveColor) },
        uCrestColor: { value: hexToRgb(crestColor) },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const updateUniforms = () => {
      const value = settingsRef.current;
      program.uniforms.uSpeed.value = value.speed;
      program.uniforms.uAmplitude.value = value.amplitude;
      program.uniforms.uWaveScale.value = value.waveScale;
      program.uniforms.uWaveRatio.value = value.waveRatio;
      program.uniforms.uSwell.value = value.swell;
      program.uniforms.uTurbulence.value = value.turbulence;
      program.uniforms.uTilt.value = value.tilt;
      program.uniforms.uZoom.value = value.zoom;
      program.uniforms.uHeight.value = value.height;
      program.uniforms.uFogDepth.value = value.fogDepth;
      program.uniforms.uSteps.value = value.detail === "low" ? 40 : value.detail === "high" ? 110 : 70;
      program.uniforms.uBrightness.value = value.brightness;
      program.uniforms.uOpacity.value = value.opacity;
      program.uniforms.uGrain.value = value.grain ? 1 : 0;
      program.uniforms.uGrainIntensity.value = value.grainIntensity;
      program.uniforms.uParallax.value = value.parallaxStrength;
      program.uniforms.uEnableMouse.value = value.mouseInteraction;
      program.uniforms.uHorizonColor.value = hexToRgb(value.horizonColor);
      program.uniforms.uWaveColor.value = hexToRgb(value.waveColor);
      program.uniforms.uCrestColor.value = hexToRgb(value.crestColor);
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height));
      const resolution = program.uniforms.iResolution.value as Float32Array;
      resolution[0] = gl.drawingBufferWidth;
      resolution[1] = gl.drawingBufferHeight;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const target = [0.5, 0.5];
    const current = [0.5, 0.5];
    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      target[0] = (event.clientX - bounds.left) / bounds.width;
      target[1] = 1 - (event.clientY - bounds.top) / bounds.height;
    };
    const onPointerLeave = () => {
      target[0] = 0.5;
      target[1] = 0.5;
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = 0;
    const startedAt = performance.now();
    const render = (time: number) => {
      updateUniforms();
      program.uniforms.iTime.value = reduceMotion ? 0 : (time - startedAt) * 0.001;
      current[0] += 0.05 * (target[0] - current[0]);
      current[1] += 0.05 * (target[1] - current[1]);
      const mouse = program.uniforms.uMouse.value as Float32Array;
      mouse[0] = current[0];
      mouse[1] = current[1];
      renderer.render({ scene: mesh });
      if (visible && !reduceMotion) frame = requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible && !frame && !reduceMotion) frame = requestAnimationFrame(render);
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(container);
    frame = requestAnimationFrame(render);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative size-full overflow-hidden ${failed ? "gradient-waves-fallback" : ""} ${className}`.trim()}
      role="presentation"
    />
  );
}
