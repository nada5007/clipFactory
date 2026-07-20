"use client";

import { Canvas, FabricImage, Textbox } from "fabric";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { resolveThumbnailResolution } from "@/lib/thumbnail";

const FONT_FAMILIES = ["sans-serif", "serif", "Impact", "Georgia", "Arial Black"];
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 400;
const MAX_DISPLAY_WIDTH = 320;

type ProjectImage = { id: string; order: number };
type BackgroundSource = "upload" | "color" | "project-image";

export function ThumbnailPanel({
  projectId,
  videoFormat,
}: {
  projectId: string;
  videoFormat: "SHORT" | "LONG";
}) {
  const resolution = resolveThumbnailResolution(videoFormat);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const textboxRef = useRef<Textbox | null>(null);

  const [bgSource, setBgSource] = useState<BackgroundSource>("color");
  const [bgColor, setBgColor] = useState("#111827");
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const [selectedProjectImageId, setSelectedProjectImageId] = useState("");
  const [textEnabled, setTextEnabled] = useState(true);
  const [text, setText] = useState("제목을 입력하세요");
  const [fontSize, setFontSize] = useState(96);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0]);
  const [textColor, setTextColor] = useState("#ffffff");
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedThumbnailUrl, setSavedThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new Canvas(canvasElRef.current, {
      width: resolution.width,
      height: resolution.height,
      backgroundColor: bgColor,
    });
    // Fabric은 캔버스를 자체 wrapper div로 감싸며 실제 픽셀 크기로 인라인 스타일을 지정하므로,
    // Tailwind max-width로는 제어할 수 없다. cssOnly 옵션으로 내부 해상도는 유지한 채 표시 크기만 축소한다.
    const displayScale = Math.min(1, MAX_DISPLAY_WIDTH / resolution.width);
    canvas.setDimensions(
      { width: resolution.width * displayScale, height: resolution.height * displayScale },
      { cssOnly: true },
    );
    fabricCanvasRef.current = canvas;

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      // 캔버스가 폐기되면 그 안의 오브젝트도 함께 사라지므로 참조도 반드시 초기화한다.
      // (초기화하지 않으면 React StrictMode의 dev 이중 마운트에서 재생성된 새 캔버스가
      // "이미 텍스트박스가 있다"고 오판해 텍스트 오버레이가 생성되지 않는다.)
      textboxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.width, resolution.height]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || bgSource !== "color") return;
    canvas.backgroundImage = undefined;
    canvas.set("backgroundColor", bgColor);
    canvas.renderAll();
  }, [bgSource, bgColor]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/images`)
      .then((res) => res.json())
      .then((images: ProjectImage[]) => setProjectImages(images));
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/thumbnail`)
      .then((res) => res.json())
      .then((data) => setSavedThumbnailUrl(data ? `/api/projects/${projectId}/thumbnail/file?t=${Date.now()}` : null));
  }, [projectId]);

  async function applyBackgroundImageUrl(url: string) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const scale = Math.max(resolution.width / (img.width || 1), resolution.height / (img.height || 1));
    img.set({
      scaleX: scale,
      scaleY: scale,
      left: resolution.width / 2,
      top: resolution.height / 2,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    canvas.backgroundImage = img;
    canvas.renderAll();
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    applyBackgroundImageUrl(URL.createObjectURL(file));
  }

  useEffect(() => {
    if (bgSource === "project-image" && selectedProjectImageId) {
      applyBackgroundImageUrl(`/api/projects/${projectId}/images/${selectedProjectImageId}/file`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgSource, selectedProjectImageId]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (textEnabled && !textboxRef.current) {
      const textbox = new Textbox(text, {
        left: resolution.width / 2,
        top: resolution.height / 2,
        originX: "center",
        originY: "center",
        fontSize,
        fontFamily,
        fill: textColor,
        stroke: strokeEnabled ? strokeColor : undefined,
        strokeWidth: strokeEnabled ? Math.max(2, fontSize * 0.04) : 0,
        textAlign: "center",
        width: resolution.width * 0.8,
      });
      canvas.add(textbox);
      canvas.setActiveObject(textbox);
      textboxRef.current = textbox;
      canvas.renderAll();
    } else if (!textEnabled && textboxRef.current) {
      canvas.remove(textboxRef.current);
      textboxRef.current = null;
      canvas.renderAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEnabled]);

  useEffect(() => {
    const textbox = textboxRef.current;
    if (!textbox) return;
    textbox.set({
      text,
      fontSize,
      fontFamily,
      fill: textColor,
      stroke: strokeEnabled ? strokeColor : undefined,
      strokeWidth: strokeEnabled ? Math.max(2, fontSize * 0.04) : 0,
    });
    fabricCanvasRef.current?.renderAll();
  }, [text, fontSize, fontFamily, textColor, strokeEnabled, strokeColor]);

  // UI_SPEC.md §4.5 "마우스 휠로 글자 크기 미세 조절": 텍스트 박스 위에서만 휠 스크롤이 크기를 바꾼다.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const handler = (opt: { e: WheelEvent; target?: unknown }) => {
      if (!textboxRef.current || opt.target !== textboxRef.current) return;
      opt.e.preventDefault();
      opt.e.stopPropagation();
      setFontSize((prev) => Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, prev - opt.e.deltaY * 0.2)));
    };
    canvas.on("mouse:wheel", handler);
    return () => {
      canvas.off("mouse:wheel", handler);
    };
  }, []);

  async function save() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError(null);
    try {
      const imageDataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, width: resolution.width, height: resolution.height }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "썸네일 저장에 실패했습니다.");
      }
      setSavedThumbnailUrl(`/api/projects/${projectId}/thumbnail/file?t=${Date.now()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "썸네일 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">썸네일</h2>
        {savedThumbnailUrl && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">저장된 썸네일</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedThumbnailUrl} alt="저장된 썸네일" className="h-10 rounded border" />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row">
        <div className="flex justify-center lg:w-auto lg:shrink-0">
          <div className="overflow-hidden rounded border">
            <canvas ref={canvasElRef} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <div className="space-y-2">
            <Label>배경</Label>
            <Select value={bgSource} onValueChange={(v) => setBgSource(v as BackgroundSource)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="color">단일 색상</SelectItem>
                <SelectItem value="upload">이미지 업로드</SelectItem>
                <SelectItem value="project-image">프로젝트 생성 이미지</SelectItem>
              </SelectContent>
            </Select>

            {bgSource === "color" && (
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-9 w-16 rounded border"
              />
            )}
            {bgSource === "upload" && <Input type="file" accept="image/*" onChange={handleFileUpload} />}
            {bgSource === "project-image" && (
              <div className="grid grid-cols-4 gap-2">
                {projectImages.length === 0 ? (
                  <p className="col-span-4 text-xs text-muted-foreground">생성된 이미지가 없습니다.</p>
                ) : (
                  projectImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedProjectImageId(img.id)}
                      className={`aspect-video overflow-hidden rounded border-2 ${
                        selectedProjectImageId === img.id ? "border-primary" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/projects/${projectId}/images/${img.id}/file`}
                        alt={`장면 ${img.order + 1}`}
                        className="size-full object-cover"
                      />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={textEnabled} onCheckedChange={(v) => setTextEnabled(Boolean(v))} />
              텍스트 오버레이
            </label>
          </div>

          {textEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="thumbnail-text">문구</Label>
                <Input id="thumbnail-text" value={text} onChange={(e) => setText(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  캔버스에서 드래그로 위치 이동, 모서리 핸들로 크기 조절, 텍스트 위 마우스 휠로 글자 크기 조절 가능
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>글자 크기</Label>
                  <span className="text-sm text-muted-foreground">{Math.round(fontSize)}px</span>
                </div>
                <Slider
                  value={[fontSize]}
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step={1}
                  onValueChange={([v]) => setFontSize(v)}
                />
              </div>

              <div className="space-y-2">
                <Label>폰트</Label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-4">
                <div className="space-y-2">
                  <Label>글자 색상</Label>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-9 w-16 rounded border"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={strokeEnabled} onCheckedChange={(v) => setStrokeEnabled(Boolean(v))} />
                    테두리
                  </label>
                  {strokeEnabled && (
                    <input
                      type="color"
                      value={strokeColor}
                      onChange={(e) => setStrokeColor(e.target.value)}
                      className="h-9 w-16 rounded border"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "썸네일 저장"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
