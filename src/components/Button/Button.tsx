import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type Ref } from "react";
import "./Button.css";
import { buildShineCache, paintShine, type ShineCache, type ShineType } from "./shine";

export type ButtonType = ShineType;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> {
  /** 圆角。数字按像素处理，字符串按 CSS 长度原样使用。 */
  borderRadius: number | string;
  /** 边框宽度。数字按像素处理，字符串按 CSS 长度原样使用。 */
  borderWidth: number | string;
  /** 按钮上显示的文本。 */
  text: string;
  /** 外观：dark 为深色，light 为浅色。 */
  type: ButtonType;
  ref?: Ref<HTMLButtonElement>;
}

function toCssLength(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value;
}

function assignRef(ref: Ref<HTMLButtonElement> | undefined, node: HTMLButtonElement | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export function Button({
  borderRadius,
  borderWidth,
  text,
  type,
  className,
  style,
  ref,
  ...rest
}: ButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssVars = {
    "--border-radius": toCssLength(borderRadius),
    "--border-width": toCssLength(borderWidth),
  } as CSSProperties;

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const canvas = canvasRef.current;
    if (!button || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cache: ShineCache | null = null;
    let cacheKey = "";
    let offset = 0;
    let last = performance.now();
    let frame = 0;
    let stopped = false;

    function buildCache(): ShineCache | null {
      const rect = button!.getBoundingClientRect();
      const radius = readRadius(button!);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const key = [
        Math.round(rect.width * dpr),
        Math.round(rect.height * dpr),
        radius.toFixed(2),
        dpr,
      ].join("x");
      if (key === cacheKey && cache) return cache;
      cacheKey = key;
      const next = buildShineCache(rect.width, rect.height, radius, dpr);
      if (!next) return null;
      if (canvas!.width !== next.pixelWidth || canvas!.height !== next.pixelHeight) {
        canvas!.width = next.pixelWidth;
        canvas!.height = next.pixelHeight;
      }
      return next;
    }

    function draw(now: number) {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const paused = reduce.matches || button!.disabled || document.hidden;
      if (cache && !paused && cache.total > 0) {
        const period = button!.matches(":hover") ? 2.3 : 5.6;
        offset = (offset + (cache.total * dt) / period) % cache.total;
      }
      if (cache) paintShine(ctx!, cache, offset, type);
      frame = requestAnimationFrame(draw);
    }

    function rebuild() {
      cache = buildCache();
      if (cache) paintShine(ctx!, cache, offset, type);
    }

    rebuild();
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(rebuild);
    observer.observe(button);
    window.addEventListener("resize", rebuild);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", rebuild);
    };
  }, [borderRadius, borderWidth, type]);

  return (
    <button
      {...rest}
      type="button"
      data-type={type}
      ref={(node) => {
        buttonRef.current = node;
        assignRef(ref, node);
      }}
      className={["shine-button", className].filter(Boolean).join(" ")}
      style={{ ...style, ...cssVars }}
    >
      <canvas ref={canvasRef} className="shine-button__canvas" aria-hidden="true" />
      <span className="shine-button__label">{text}</span>
    </button>
  );
}

function readRadius(el: HTMLElement): number {
  const raw = getComputedStyle(el).borderTopLeftRadius.trim();
  const rect = el.getBoundingClientRect();
  if (raw.endsWith("%")) {
    const pct = (parseFloat(raw) || 0) / 100;
    return Math.min(rect.width, rect.height) * pct;
  }
  return parseFloat(raw) || 0;
}
