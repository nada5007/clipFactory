"use client";

import { useEffect, useRef, useState } from "react";

import type { VideoClipMask } from "@/lib/timeline";
import { cn } from "@/lib/utils";

type Mask = NonNullable<VideoClipMask>;

type HandleId = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "rotate";

const RESIZE_HANDLES: { id: Exclude<HandleId, "move" | "rotate">; signX: -1 | 0 | 1; signY: -1 | 0 | 1 }[] = [
  { id: "nw", signX: -1, signY: -1 },
  { id: "n", signX: 0, signY: -1 },
  { id: "ne", signX: 1, signY: -1 },
  { id: "e", signX: 1, signY: 0 },
  { id: "se", signX: 1, signY: 1 },
  { id: "s", signX: 0, signY: 1 },
  { id: "sw", signX: -1, signY: 1 },
  { id: "w", signX: -1, signY: 0 },
];

const CURSOR_BY_HANDLE: Record<Exclude<HandleId, "move" | "rotate">, string> = {
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
};

function clampMask(patch: Partial<Mask>): Partial<Mask> {
  const next: Partial<Mask> = { ...patch };
  if (next.x !== undefined) next.x = Math.max(0, Math.min(1, next.x));
  if (next.y !== undefined) next.y = Math.max(0, Math.min(1, next.y));
  if (next.width !== undefined) next.width = Math.max(0.03, Math.min(1.5, next.width));
  if (next.height !== undefined) next.height = Math.max(0.03, Math.min(1.5, next.height));
  if (next.rotationDeg !== undefined) {
    let deg = next.rotationDeg % 360;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    next.rotationDeg = Math.round(deg);
  }
  return next;
}

// 참조 사이트(reelbox.ai)처럼 미리보기 화면 위에서 마스크를 직접 드래그로 편집하는 오버레이.
// 좌표계: mask.x/y/width/height는 컨테이너(=영상 프레임) 기준 0~1 정규화 값 + 중심점 기준.
// 회전 중 리사이즈는 화면 픽셀 이동량을 -rotationDeg만큼 되돌려 로컬(비회전) 좌표계에서 계산한 뒤
// 다시 +rotationDeg로 돌려 화면 좌표로 변환한다 — 반대쪽 모서리/변이 고정된 채로 크기가 바뀐다.
export function MaskOverlay({
  clipId,
  mask: maskProp,
  containerWidthPx,
  containerHeightPx,
  onPatch,
}: {
  clipId: string;
  mask: Mask;
  containerWidthPx: number;
  containerHeightPx: number;
  // 마스크는 API가 부분 patch가 아닌 전체 객체 교체를 기대하므로, 항상 병합된 전체 마스크를 전달한다.
  onPatch: (mask: Mask) => void;
}) {
  const [liveMask, setLiveMask] = useState<Mask>(maskProp);
  const isDraggingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingRef.current) setLiveMask(maskProp);
  }, [maskProp, clipId]);

  if (!containerWidthPx || !containerHeightPx) return null;

  const mask = liveMask;
  const centerPx = { x: mask.x * containerWidthPx, y: mask.y * containerHeightPx };
  const sizePx = { w: mask.width * containerWidthPx, h: mask.height * containerHeightPx };

  function beginDrag(handle: HandleId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    const startMask = mask;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const rect = rootRef.current?.getBoundingClientRect();
    const rectLeft = rect?.left ?? 0;
    const rectTop = rect?.top ?? 0;

    function apply(patch: Partial<Mask>) {
      const next: Mask = { ...startMask, ...clampMask(patch) };
      setLiveMask(next);
      onPatch(next);
    }

    function onMove(ev: PointerEvent) {
      if (handle === "move") {
        apply({
          x: startMask.x + (ev.clientX - startClientX) / containerWidthPx,
          y: startMask.y + (ev.clientY - startClientY) / containerHeightPx,
        });
        return;
      }

      if (handle === "rotate") {
        const localX = ev.clientX - rectLeft;
        const localY = ev.clientY - rectTop;
        const cx = startMask.x * containerWidthPx;
        const cy = startMask.y * containerHeightPx;
        const deg = Math.round((Math.atan2(localX - cx, -(localY - cy)) * 180) / Math.PI);
        apply({ rotationDeg: deg });
        return;
      }

      const target = RESIZE_HANDLES.find((h) => h.id === handle);
      if (!target) return;
      const { signX, signY } = target;

      const dxPx = ev.clientX - startClientX;
      const dyPx = ev.clientY - startClientY;
      const rad = (startMask.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // 화면 이동량 -> 회전을 되돌린 로컬(비회전) 좌표계 이동량
      const localDx = dxPx * cos + dyPx * sin;
      const localDy = -dxPx * sin + dyPx * cos;

      const hw = (startMask.width * containerWidthPx) / 2;
      const hh = (startMask.height * containerHeightPx) / 2;

      const draggedX = signX !== 0 ? signX * hw + localDx : 0;
      const draggedY = signY !== 0 ? signY * hh + localDy : 0;
      const fixedX = -signX * hw;
      const fixedY = -signY * hh;

      const newWidthPx = signX !== 0 ? Math.abs(draggedX - fixedX) : startMask.width * containerWidthPx;
      const newHeightPx = signY !== 0 ? Math.abs(draggedY - fixedY) : startMask.height * containerHeightPx;
      const localOffsetX = signX !== 0 ? (draggedX + fixedX) / 2 : 0;
      const localOffsetY = signY !== 0 ? (draggedY + fixedY) / 2 : 0;

      // 로컬 중심 오프셋 -> 화면 좌표로 다시 회전
      const screenOffsetX = localOffsetX * cos - localOffsetY * sin;
      const screenOffsetY = localOffsetX * sin + localOffsetY * cos;

      apply({
        x: startMask.x + screenOffsetX / containerWidthPx,
        y: startMask.y + screenOffsetY / containerHeightPx,
        width: newWidthPx / containerWidthPx,
        height: newHeightPx / containerHeightPx,
      });
    }

    function onUp() {
      isDraggingRef.current = false;
      setLiveMask(maskProp); // 최신 확정값(서버 왕복 결과)으로 정합화
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <div
        className="pointer-events-auto absolute cursor-move border-2 border-dashed border-sky-400"
        style={{
          left: centerPx.x - sizePx.w / 2,
          top: centerPx.y - sizePx.h / 2,
          width: sizePx.w,
          height: sizePx.h,
          transform: `rotate(${mask.rotationDeg}deg)`,
          borderRadius: mask.shape === "ellipse" ? "50%" : `${(mask.roundnessPct / 100) * 50}%`,
        }}
        onPointerDown={(e) => beginDrag("move", e)}
      >
        {/* 회전 핸들 연결선 + 원형 핸들 */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 -translate-y-full bg-sky-400" />
        <div
          className="pointer-events-auto absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-[calc(100%+24px)] cursor-grab rounded-full border-2 border-sky-400 bg-emerald-400"
          onPointerDown={(e) => beginDrag("rotate", e)}
        />

        {RESIZE_HANDLES.map(({ id, signX, signY }) => (
          <div
            key={id}
            className={cn(
              "pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 border border-sky-600 bg-white",
              CURSOR_BY_HANDLE[id],
            )}
            style={{
              left: `${((signX + 1) / 2) * 100}%`,
              top: `${((signY + 1) / 2) * 100}%`,
            }}
            onPointerDown={(e) => beginDrag(id, e)}
          />
        ))}
      </div>
    </div>
  );
}
