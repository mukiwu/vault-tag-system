import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import lottie from "lottie-web/build/player/esm/lottie_light.min.js";
import sparkle from "./sparkle.json";

type Tool = { name: string; url?: string; featured?: boolean };

const TOOLS: readonly Tool[] = [
  { name: "Hyday", url: "https://hyday.tw", featured: true },
  { name: "Obsidian", url: "https://obsidian.md", featured: true },
  { name: "Heptabase", url: "https://heptabase.com", featured: true },
  { name: "Notion", url: "https://notion.so", featured: true },
  { name: "Logseq", url: "https://logseq.com" },
  { name: "Bear", url: "https://bear.app" },
  { name: "Typora", url: "https://typora.io" },
  { name: "Roam Research", url: "https://roamresearch.com" },
  { name: "所有 .md 筆記庫" },
];

/** 動畫畫布的一半，用來把爆發對準標籤中心 */
const HALF_W = sparkle.w / 2;
const HALF_H = sparkle.h / 2;

export function CompatChips() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  // 九個標籤共用一個播放器，滑到誰就把它搬過去，不必開九份
  useEffect(() => {
    const container = layerRef.current;
    if (!container) return;

    const anim = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData: sparkle,
    });
    animRef.current = anim;
    // 開發時可以在 console 停格檢查動畫，正式版不會有
    if (import.meta.env.DEV) {
      (window as unknown as { __sparkle?: AnimationItem }).__sparkle = anim;
    }
    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, []);

  const burst = (target: HTMLElement) => {
    const wrap = wrapRef.current;
    const layer = layerRef.current;
    const anim = animRef.current;
    if (!wrap || !layer || !anim) return;

    // 會暈車的人不該被閃，這裡直接跳過
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const chip = target.getBoundingClientRect();
    const base = wrap.getBoundingClientRect();
    layer.style.left = `${chip.left - base.left + chip.width / 2 - HALF_W}px`;
    layer.style.top = `${chip.top - base.top + chip.height / 2 - HALF_H}px`;
    layer.style.opacity = "1";
    anim.goToAndPlay(0, true);
  };

  return (
    <div className="compat-chips" ref={wrapRef}>
      <div className="sparkle-layer" ref={layerRef} aria-hidden="true" />
      {TOOLS.map((tool) =>
        tool.url ? (
          <a
            key={tool.name}
            className={tool.featured ? "chip highlight" : "chip"}
            href={tool.url}
            target="_blank"
            rel="noreferrer"
            onMouseEnter={(e) => burst(e.currentTarget)}
            onFocus={(e) => burst(e.currentTarget)}
          >
            {tool.name}
          </a>
        ) : (
          <span key={tool.name} className="chip plain">
            {tool.name}
          </span>
        ),
      )}
    </div>
  );
}
