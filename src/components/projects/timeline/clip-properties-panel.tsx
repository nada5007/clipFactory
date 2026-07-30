"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  COLOR_PRESETS,
  DEFAULT_IMAGE_EFFECTS,
  DEFAULT_VIDEO_OPTIONS,
  DEFAULT_VIDEO_TRANSFORM,
  DEFAULT_VIDEO_TRANSITION,
  formatMmSsMs,
  parseMmSsMs,
  rewrapTextToMaxLineLength,
  resolveSubtitleStyle,
  type PanDirection,
  type PanSpeed,
  type PersistedTimelineClip,
  type PersistedTimelineTrack,
  type SubtitleStyle,
  type TransitionType,
  type VideoClipMask,
  type ZoomType,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";

const OUTLINE_BTN = "border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white";

const TRANSITION_GROUPS: { label: string; options: { value: TransitionType; label: string }[] }[] = [
  {
    label: "기본",
    options: [
      { value: "none", label: "없음" },
      { value: "fade", label: "페이드" },
      { value: "cut", label: "컷" },
    ],
  },
  {
    label: "슬라이드",
    options: [
      { value: "slide-left", label: "슬라이드 (좌)" },
      { value: "slide-right", label: "슬라이드 (우)" },
      { value: "slide-up", label: "슬라이드 (상)" },
      { value: "slide-down", label: "슬라이드 (하)" },
    ],
  },
  {
    label: "와이프",
    options: [
      { value: "wipe-left", label: "와이프 (좌)" },
      { value: "wipe-right", label: "와이프 (우)" },
      { value: "wipe-up", label: "와이프 (상)" },
      { value: "wipe-down", label: "와이프 (하)" },
    ],
  },
  {
    label: "대각선",
    options: [
      { value: "diagonal-tl", label: "대각선 (좌상)" },
      { value: "diagonal-br", label: "대각선 (우하)" },
    ],
  },
  {
    label: "페이드",
    options: [
      { value: "fade-black", label: "흑색 페이드" },
      { value: "fade-white", label: "백색 페이드" },
    ],
  },
];

function formatClipTimecode(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

// MM:SS.mmm 형식 시간 입력 — Enter/blur로 커밋, Alt+↑/↓로 100ms씩 조절(참조 사이트 동일 단축키).
function TimeInput({ label, valueMs, onChange }: { label: string; valueMs: number; onChange: (ms: number) => void }) {
  const [draft, setDraft] = useState(formatMmSsMs(valueMs));
  useEffect(() => setDraft(formatMmSsMs(valueMs)), [valueMs]);

  function commit() {
    const parsed = parseMmSsMs(draft);
    if (parsed !== null) onChange(parsed);
    else setDraft(formatMmSsMs(valueMs));
  }

  return (
    <label className="space-y-1">
      <span className="text-white/40">{label}</span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            onChange(Math.max(0, valueMs + (e.key === "ArrowUp" ? 100 : -100)));
          }
        }}
        className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 font-mono text-white"
      />
    </label>
  );
}

type PatchBody = Record<string, unknown>;

async function patchClip(projectId: string, clipId: string, body: PatchBody) {
  const res = await fetch(`/api/projects/${projectId}/timeline/clips/${clipId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

type Props = {
  projectId: string;
  clip: PersistedTimelineClip;
  track: PersistedTimelineTrack;
  // 현재 멀티 셀렉트된 클립 전체(트랙 무관 — 사용처에서 clip.trackId로 필터링). 1개 이하면 일반 모드.
  selectedClips: PersistedTimelineClip[];
  videoWidth: number;
  videoHeight: number;
  canSplit: boolean;
  onSplit: () => void;
  onDelete: () => void;
  onCommitTiming: (clipId: string, startMs: number, endMs: number) => void;
  onPatched: (payload: PersistedTimelineClip["payload"]) => void;
  onRefetchAll: () => void;
};

// 자막/비디오/이미지 클립 선택 시 서브탭 속성 패널(§5.2). 다른 클립 타입(TTS/BGM/비디오오디오/효과음)은
// 기존 플랫 패널을 그대로 쓰고(부모 컴포넌트에서 처리), 이 컴포넌트는 자막·비디오·이미지 전용이다.
export function ClipPropertiesPanel(props: Props) {
  if (props.track.type === "SUBTITLE") return <SubtitleClipProperties {...props} />;
  if (props.track.type === "VIDEO") return <MediaClipProperties {...props} kind="video" />;
  if (props.track.type === "IMAGE") return <MediaClipProperties {...props} kind="image" />;
  return null;
}

function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded px-2 py-1 text-xs",
            active === t.key ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:text-white",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function BasicInfoTab({
  clip,
  track,
  canSplit,
  onSplit,
  onDelete,
  onCommitTiming,
  extra,
}: Pick<Props, "clip" | "track" | "canSplit" | "onSplit" | "onDelete" | "onCommitTiming"> & { extra?: React.ReactNode }) {
  const durationMs = clip.endMs - clip.startMs;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="font-medium">클립 정보</p>
        <div className="space-y-0.5 text-white/50">
          <p>클립 ID: {clip.id.slice(0, 10)}...</p>
          <p>트랙: {track.name}</p>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-white/10 pt-2">
        <p className="font-medium">시간</p>
        <p className="text-white/70">
          시작: <span className="font-mono">{formatMmSsMs(clip.startMs)}</span>
          {"  "}끝: <span className="font-mono">{formatMmSsMs(clip.endMs)}</span>
        </p>
        <p className="text-white/70">
          지속: <span className="font-medium text-sky-400">{(durationMs / 1000).toFixed(3)}초</span> ({durationMs}ms)
        </p>
        <p className="text-[11px] text-white/40">시간 편집 (MM:SS.mmm 형식, Alt+방향키로 100ms 조절)</p>
        <div className="grid grid-cols-2 gap-2">
          <TimeInput label="시작 시간" valueMs={clip.startMs} onChange={(ms) => onCommitTiming(clip.id, ms, clip.endMs)} />
          <TimeInput label="종료 시간" valueMs={clip.endMs} onChange={(ms) => onCommitTiming(clip.id, clip.startMs, ms)} />
        </div>
      </div>

      {extra}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className={OUTLINE_BTN} onClick={onSplit} disabled={!canSplit}>
          ✂ 분할(재생헤드)
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          삭제
        </Button>
      </div>
    </div>
  );
}

function SubtitleClipProperties({
  projectId,
  clip,
  track,
  selectedClips,
  videoWidth,
  videoHeight,
  canSplit,
  onSplit,
  onDelete,
  onCommitTiming,
  onPatched,
  onRefetchAll,
}: Props) {
  const [tab, setTab] = useState<"basic" | "text" | "style" | "effects">("basic");
  useEffect(() => setTab("basic"), [clip.id]);

  const [textDraft, setTextDraft] = useState(clip.payload.text ?? "");
  useEffect(() => setTextDraft(clip.payload.text ?? ""), [clip.id, clip.payload.text]);
  const [maxLen, setMaxLen] = useState(15);
  const [savingText, setSavingText] = useState(false);
  const [applyAll, setApplyAll] = useState(false);

  const style = resolveSubtitleStyle(clip.payload.style, videoWidth, videoHeight);
  const dirty = textDraft !== (clip.payload.text ?? "");

  // 같은 트랙(자막)의 클립만 일괄 편집 대상으로 삼는다 — 멀티 셀렉트가 트랙을 넘나들 수 있어서.
  const sameTrackSelected = selectedClips.filter((c) => c.trackId === clip.trackId);
  const batchMode = sameTrackSelected.length > 1;

  // "수동 줄바꿈 적용됨": 저장된 텍스트에 이미 개행이 있는데, 지금 기준 글자수로 다시 자동 줄바꿈했을 때와
  // 결과가 다르면(=자동 줄바꿈 결과가 아니면) 수동으로 편집된 것으로 간주한다.
  const savedText = clip.payload.text ?? "";
  const autoWrappedOfSaved = rewrapTextToMaxLineLength(savedText.replace(/\n/g, " "), maxLen);
  const isManuallyWrapped = savedText.includes("\n") && savedText !== autoWrappedOfSaved;

  async function saveText() {
    setSavingText(true);
    try {
      const updated = await patchClip(projectId, clip.id, { text: textDraft });
      if (updated) onPatched(updated.payload);
    } finally {
      setSavingText(false);
    }
  }

  async function handleRewrap() {
    if (batchMode) {
      for (const c of sameTrackSelected) {
        const rewrapped = rewrapTextToMaxLineLength(c.payload.text ?? "", maxLen);
        await patchClip(projectId, c.id, { text: rewrapped });
      }
      onRefetchAll();
      return;
    }
    const rewrapped = rewrapTextToMaxLineLength(textDraft, maxLen);
    setTextDraft(rewrapped);
    const updated = await patchClip(projectId, clip.id, { text: rewrapped });
    if (updated) onPatched(updated.payload);
  }

  async function updateStyle(partial: Partial<SubtitleStyle>) {
    if (applyAll) {
      const res = await fetch(`/api/projects/${projectId}/timeline/subtitle-style/apply-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (res.ok) onRefetchAll();
    } else {
      const updated = await patchClip(projectId, clip.id, { style: partial });
      if (updated) onPatched(updated.payload);
    }
  }

  return (
    <div className="space-y-3">
      <p className={cn(batchMode ? "font-medium text-sky-400" : "text-white/50")}>
        {batchMode ? `${sameTrackSelected.length}개 클립 선택됨 (일괄 편집 모드)` : `subtitle 클립: ${clip.payload.label}`}
      </p>

      <TabBar
        tabs={[
          { key: "basic" as const, label: "기본 정보" },
          { key: "text" as const, label: "자막" },
          { key: "style" as const, label: "스타일" },
          { key: "effects" as const, label: "효과" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "basic" && (
        <BasicInfoTab
          clip={clip}
          track={track}
          canSplit={canSplit}
          onSplit={onSplit}
          onDelete={onDelete}
          onCommitTiming={onCommitTiming}
        />
      )}

      {tab === "text" && (
        <div className="space-y-3">
          {batchMode ? (
            <p className="rounded-md bg-white/5 p-2 text-white/50">
              {sameTrackSelected.length}개 클립이 선택되어 개별 텍스트 편집은 비활성화됩니다. 자막 재구성은 선택된
              모든 클립에 각각 적용됩니다.
            </p>
          ) : (
            <div className="space-y-1">
              <span className="text-white/40">자막 텍스트</span>
              <Textarea
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                className="min-h-16 border-white/20 bg-white/5 text-white"
              />
              {isManuallyWrapped && (
                <p className="font-medium text-amber-400">⚠ 수동 줄바꿈 적용됨 (최대글자수 무시)</p>
              )}
              {dirty && (
                <Button size="sm" onClick={saveText} disabled={savingText}>
                  {savingText ? "저장 중..." : "텍스트 저장"}
                </Button>
              )}
            </div>
          )}
          <div className="space-y-1 rounded-md border border-white/10 p-2">
            <p className="font-medium">자막 재구성</p>
            <p className="text-white/40">
              입력한 글자수에 맞춰 의미가 통하는 단위로 분할합니다. 정확한 글자수가 아닌, 해당 글자수 내외의
              자연스러운 끊김 기준입니다.
            </p>
            <div className="flex items-center gap-2">
              <Slider value={[maxLen]} onValueChange={([v]) => setMaxLen(v)} min={8} max={30} step={1} />
              <span className="w-10 shrink-0 text-white/50">{maxLen}자</span>
            </div>
            <Button size="sm" onClick={handleRewrap}>
              자막 재구성 (R){batchMode ? ` - ${sameTrackSelected.length}개` : ""}
            </Button>
          </div>
        </div>
      )}

      {tab === "style" && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-2">
            <Checkbox checked={applyAll} onCheckedChange={(v) => setApplyAll(Boolean(v))} />
            <span>
              모든 자막에 스타일 적용
              <span className="mt-0.5 block text-white/50">체크 시 아래 스타일 변경이 모든 자막 클립에 동시 적용됩니다</span>
            </span>
          </label>

          <div className="space-y-2">
            <p className="font-medium">폰트 설정</p>
            <label className="block space-y-1">
              <span className="text-white/40">폰트</span>
              <select
                className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white"
                value={style.fontFamily}
                onChange={(e) => updateStyle({ fontFamily: e.target.value })}
              >
                {["Nanum Gothic", "Pretendard", "Noto Sans KR", "Arial"].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-white/40">글자 크기 {style.fontSizePx}px</span>
              <Slider value={[style.fontSizePx]} onValueChange={([v]) => updateStyle({ fontSizePx: v })} min={20} max={140} step={1} />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/40">글자 색상</span>
              <input type="color" value={style.fontColor} onChange={(e) => updateStyle({ fontColor: e.target.value })} />
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={style.bold} onCheckedChange={(v) => updateStyle({ bold: Boolean(v) })} />
              <span>굵게</span>
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">배경 설정</p>
            <label className="flex items-center gap-2">
              <span className="text-white/40">배경 색상</span>
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-white/40">배경 투명도 {style.backgroundOpacity.toFixed(2)}</span>
              <Slider
                value={[style.backgroundOpacity]}
                onValueChange={([v]) => updateStyle({ backgroundOpacity: v })}
                min={0}
                max={1}
                step={0.05}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">위치 설정 (px 단위)</p>
            <label className="block space-y-1">
              <span className="text-white/40">가로 위치 {style.positionXPx}</span>
              <Slider
                value={[style.positionXPx]}
                onValueChange={([v]) => updateStyle({ positionXPx: v })}
                min={0}
                max={videoWidth}
                step={1}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-white/40">세로 위치 {style.positionYPx}</span>
              <Slider
                value={[style.positionYPx]}
                onValueChange={([v]) => updateStyle({ positionYPx: v })}
                min={0}
                max={videoHeight}
                step={1}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">테두리 설정</p>
            <label className="block space-y-1">
              <span className="text-white/40">테두리 두께 {style.borderWidthPx}px</span>
              <Slider
                value={[style.borderWidthPx]}
                onValueChange={([v]) => updateStyle({ borderWidthPx: v })}
                min={0}
                max={20}
                step={1}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/40">테두리 색상</span>
              <input type="color" value={style.borderColor} onChange={(e) => updateStyle({ borderColor: e.target.value })} />
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">레이아웃 설정</p>
            <label className="block space-y-1">
              <span className="text-white/40">최대 줄 길이 {style.maxLineLength}자</span>
              <Slider
                value={[style.maxLineLength]}
                onValueChange={([v]) => updateStyle({ maxLineLength: v })}
                min={8}
                max={40}
                step={1}
              />
            </label>
          </div>
        </div>
      )}

      {tab === "effects" && <p className="text-white/40">참조 사이트에도 아직 공개되지 않은 기능입니다.</p>}
    </div>
  );
}

const PAN_DIRECTIONS: { value: PanDirection; label: string }[] = [
  { value: "random", label: "랜덤" },
  { value: "left", label: "좌" },
  { value: "right", label: "우" },
  { value: "up", label: "상" },
  { value: "down", label: "하" },
];
const PAN_SPEEDS: { value: PanSpeed; label: string }[] = [
  { value: "slow", label: "느림" },
  { value: "normal", label: "보통" },
  { value: "fast", label: "빠름" },
];
const ZOOM_TYPES: { value: ZoomType; label: string }[] = [
  { value: "in", label: "줌 인" },
  { value: "out", label: "줌 아웃" },
];

// 비디오·이미지 클립은 변환/전환/키프레임/마스크가 동일 구조라 하나의 컴포넌트로 공유한다.
// 차이: 이미지는 "비디오 옵션" 탭이 없고, "효과" 탭에 패닝/줌(켄 번즈) 섹션이 추가되며,
// "기본 정보" 탭의 AI 영상 분석 카드는 비디오 전용이다.
function MediaClipProperties({
  kind,
  projectId,
  clip,
  track,
  selectedClips,
  canSplit,
  onSplit,
  onDelete,
  onCommitTiming,
  onPatched,
}: Props & { kind: "video" | "image" }) {
  type MediaTab = "basic" | "transform" | "effects" | "transition" | "keyframes" | "special" | "options" | "mask";
  const [tab, setTab] = useState<MediaTab>("basic");
  useEffect(() => setTab("basic"), [clip.id]);

  const sameTrackSelected = selectedClips.filter((c) => c.trackId === clip.trackId);
  const batchMode = sameTrackSelected.length > 1;

  const transform = { ...DEFAULT_VIDEO_TRANSFORM, ...clip.payload.transform };
  // ImageClipEffects가 VideoClipEffects의 상위집합이라 기본값 하나로 두 kind를 모두 커버한다.
  const effects = { ...DEFAULT_IMAGE_EFFECTS, ...clip.payload.effects };
  const transition = { ...DEFAULT_VIDEO_TRANSITION, ...clip.payload.transition };
  const videoOptions = { ...DEFAULT_VIDEO_OPTIONS, ...clip.payload.videoOptions };
  const mask = clip.payload.mask ?? null;
  const [applyAllTransform, setApplyAllTransform] = useState(false);
  const [applyAllEffects, setApplyAllEffects] = useState(false);
  const [applyAllTransition, setApplyAllTransition] = useState(false);

  async function update(body: Record<string, unknown>) {
    const updated = await patchClip(projectId, clip.id, body);
    if (updated) onPatched(updated.payload);
  }

  const tabs: { key: MediaTab; label: string }[] = [
    { key: "basic", label: "기본 정보" },
    { key: "transform", label: "변환" },
    { key: "effects", label: kind === "video" ? "비디오 효과" : "이미지 효과" },
    { key: "transition", label: "전환" },
    { key: "keyframes", label: "키프레임" },
    { key: "special", label: "특수효과" },
    ...(kind === "video" ? [{ key: "options" as const, label: "비디오 옵션" }] : []),
    { key: "mask", label: "마스크" },
  ];

  return (
    <div className="space-y-3">
      <p className={cn(batchMode ? "font-medium text-sky-400" : "text-white/50")}>
        {batchMode ? `${sameTrackSelected.length}개 클립 선택됨 (일괄 편집 모드)` : `${kind} 클립: ${clip.payload.label}`}
      </p>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "basic" && (
        <BasicInfoTab
          clip={clip}
          track={track}
          canSplit={canSplit}
          onSplit={onSplit}
          onDelete={onDelete}
          onCommitTiming={onCommitTiming}
          extra={
            kind === "video" ? (
              <div className="space-y-1 rounded-md border border-violet-400/40 bg-violet-400/10 p-2">
                <p className="font-medium text-violet-200">✨ AI 영상 분석</p>
                <p className="text-white/50">
                  퍼온 영상으로 쇼츠를 만들 때 사용하는 기능입니다. 영상 음성·시각·viral 패턴을 종합 분석해 편집
                  포인트를 추출합니다.
                </p>
                <Button size="sm" className={OUTLINE_BTN} variant="outline" disabled title="다음 라운드 예정">
                  AI 영상 분석 시작
                </Button>
              </div>
            ) : undefined
          }
        />
      )}

      {tab === "transform" && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-2">
            <Checkbox checked={applyAllTransform} onCheckedChange={(v) => setApplyAllTransform(Boolean(v))} />
            <span>모든 {kind === "video" ? "비디오" : "이미지"}에 변환 적용</span>
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">위치 X {transform.x.toFixed(2)}</span>
            <Slider value={[transform.x]} onValueChange={([v]) => update({ transform: { x: v } })} min={-1} max={2} step={0.01} />
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">위치 Y {transform.y.toFixed(2)}</span>
            <Slider value={[transform.y]} onValueChange={([v]) => update({ transform: { y: v } })} min={-1} max={2} step={0.01} />
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">스케일 {transform.scale.toFixed(2)}x</span>
            <Slider value={[transform.scale]} onValueChange={([v]) => update({ transform: { scale: v } })} min={0.1} max={3} step={0.01} />
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">회전 {transform.rotationDeg}deg</span>
            <Slider
              value={[transform.rotationDeg]}
              onValueChange={([v]) => update({ transform: { rotationDeg: v } })}
              min={-180}
              max={180}
              step={1}
            />
            <div className="flex gap-1">
              {[0, 90, 180, -90].map((deg) => (
                <Button key={deg} size="sm" variant="outline" className={cn("h-6 px-2", OUTLINE_BTN)} onClick={() => update({ transform: { rotationDeg: deg } })}>
                  {deg}
                </Button>
              ))}
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">투명도 {(transform.opacity * 100).toFixed(0)}%</span>
            <Slider value={[transform.opacity]} onValueChange={([v]) => update({ transform: { opacity: v } })} min={0} max={1} step={0.01} />
          </label>
          <Button
            size="sm"
            variant="outline"
            className={OUTLINE_BTN}
            onClick={() => update({ transform: { flipH: !transform.flipH } })}
          >
            {transform.flipH ? "반전 적용됨" : "반전 없음"}
          </Button>
        </div>
      )}

      {tab === "effects" && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-2">
            <Checkbox checked={applyAllEffects} onCheckedChange={(v) => setApplyAllEffects(Boolean(v))} />
            <span>모든 {kind === "video" ? "비디오" : "이미지"}에 효과 적용</span>
          </label>

          {kind === "image" && (
            <>
              <div className="space-y-1.5 border-b border-white/10 pb-2">
                <label className="flex items-center gap-2">
                  <Checkbox checked={effects.panEnabled} onCheckedChange={(v) => update({ effects: { panEnabled: Boolean(v) } })} />
                  <span className="font-medium">패닝 효과</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-white/40">방향</span>
                    <select
                      className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white disabled:opacity-40"
                      value={effects.panDirection}
                      disabled={!effects.panEnabled}
                      onChange={(e) => update({ effects: { panDirection: e.target.value } })}
                    >
                      {PAN_DIRECTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-white/40">속도</span>
                    <select
                      className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white disabled:opacity-40"
                      value={effects.panSpeed}
                      disabled={!effects.panEnabled}
                      onChange={(e) => update({ effects: { panSpeed: e.target.value } })}
                    >
                      {PAN_SPEEDS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5 border-b border-white/10 pb-2">
                <label className="flex items-center gap-2">
                  <Checkbox checked={effects.zoomEnabled} onCheckedChange={(v) => update({ effects: { zoomEnabled: Boolean(v) } })} />
                  <span className="font-medium">줌 효과</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-white/40">타입</span>
                  <select
                    className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white disabled:opacity-40"
                    value={effects.zoomType}
                    disabled={!effects.zoomEnabled}
                    onChange={(e) => update({ effects: { zoomType: e.target.value } })}
                  >
                    {ZOOM_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-white/40">강도 {effects.zoomIntensity.toFixed(1)}x</span>
                  <Slider
                    value={[effects.zoomIntensity]}
                    onValueChange={([v]) => update({ effects: { zoomIntensity: v } })}
                    min={1}
                    max={2}
                    step={0.1}
                    disabled={!effects.zoomEnabled}
                  />
                </label>
              </div>
            </>
          )}

          <p className="font-medium">색보정</p>
          <div className="grid grid-cols-3 gap-1">
            {COLOR_PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant="outline"
                className={cn("h-7 px-1 text-[11px]", p.key === effects.colorPreset ? "border-primary bg-primary/20 text-white" : OUTLINE_BTN)}
                onClick={() => update({ effects: { colorPreset: p.key } })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {(
            [
              ["brightness", "밝기"],
              ["contrast", "대비"],
              ["saturation", "채도"],
              ["temperature", "색온도"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="text-white/40">
                {label} {effects[key]}
              </span>
              <Slider value={[effects[key]]} onValueChange={([v]) => update({ effects: { [key]: v } })} min={-1} max={1} step={0.01} />
            </label>
          ))}
        </div>
      )}

      {tab === "transition" && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 p-2">
            <Checkbox checked={applyAllTransition} onCheckedChange={(v) => setApplyAllTransition(Boolean(v))} />
            <span>모든 {kind === "video" ? "비디오" : "이미지"}에 전환 적용</span>
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">전환 효과</span>
            <select
              className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white"
              value={transition.type}
              onChange={(e) => update({ transition: { type: e.target.value } })}
            >
              {TRANSITION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-white/40">
              지속 시간 {transition.durationMs}ms ({(transition.durationMs / 1000).toFixed(1)}초)
            </span>
            <Slider
              value={[transition.durationMs]}
              onValueChange={([v]) => update({ transition: { durationMs: v } })}
              min={100}
              max={2000}
              step={50}
            />
          </label>
          <p className="rounded-md bg-white/5 p-2 text-white/50">
            현재 설정: {TRANSITION_GROUPS.flatMap((g) => g.options).find((o) => o.value === transition.type)?.label} /{" "}
            {transition.durationMs}ms
          </p>
        </div>
      )}

      {tab === "keyframes" && (
        <div className="space-y-2 text-white/60">
          <div className="flex items-center justify-between">
            <span>현재 시점: {formatClipTimecode(clip.startMs)}</span>
            <span>클립 길이: {((clip.endMs - clip.startMs) / 1000).toFixed(1)}s</span>
          </div>
          {(
            [
              ["positionX", "위치 X"],
              ["positionY", "위치 Y"],
              ["scale", "스케일"],
              ["rotation", "회전"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
              <span>{label}</span>
              <span className="text-white/40">{(clip.payload.keyframes?.[key] ?? []).length}개 키프레임</span>
            </div>
          ))}
          <p className="text-white/40">
            * 타임라인에서 재생 위치를 이동한 후 각 속성에 키프레임을 추가하세요. 속성당 최대 8개까지 지원됩니다.
          </p>
        </div>
      )}

      {tab === "special" && <p className="text-white/40">참조 사이트에도 아직 공개되지 않은 기능입니다.</p>}

      {tab === "options" && kind === "video" && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-white/40">재생 속도 (클립 길이가 함께 조정됩니다) {videoOptions.speed.toFixed(2)}x</span>
            <Slider value={[videoOptions.speed]} onValueChange={([v]) => update({ videoOptions: { speed: v } })} min={0.25} max={4} step={0.05} />
          </label>
          <Button
            size="sm"
            variant="outline"
            className={OUTLINE_BTN}
            onClick={() => update({ videoOptions: { flipH: !videoOptions.flipH } })}
          >
            {videoOptions.flipH ? "반전 적용됨" : "반전 없음"}
          </Button>
        </div>
      )}

      {tab === "mask" && <MaskTab mask={mask} onChange={(m) => update({ mask: m })} />}
    </div>
  );
}

function MaskTab({ mask, onChange }: { mask: VideoClipMask; onChange: (mask: VideoClipMask) => void }) {
  if (!mask) {
    return (
      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={() =>
            onChange({
              shape: "rect",
              x: 0.5,
              y: 0.5,
              width: 0.5,
              height: 0.5,
              rotationDeg: 0,
              featherPx: 0,
              roundnessPct: 0,
              inverted: false,
            })
          }
        >
          마스크 추가
        </Button>
        <p className="text-white/40">
          클립의 특정 영역만 보이게 만드는 잘라내기 영역을 추가합니다. 마스크는 클립과 함께 줌/이동/회전됩니다.
        </p>
      </div>
    );
  }

  function set(patch: Partial<NonNullable<VideoClipMask>>) {
    onChange({ ...mask!, ...patch });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(["rect", "ellipse"] as const).map((shape) => (
          <Button
            key={shape}
            size="sm"
            variant="outline"
            className={cn("flex-1", shape === mask.shape ? "border-primary bg-primary/20 text-white" : OUTLINE_BTN)}
            onClick={() => set({ shape })}
          >
            {shape === "rect" ? "사각형" : "타원"}
          </Button>
        ))}
      </div>
      {(
        [
          ["x", "위치 X", 0, 1],
          ["y", "위치 Y", 0, 1],
          ["width", "너비", 0, 1],
          ["height", "높이", 0, 1],
          ["rotationDeg", "회전", -180, 180],
          ["featherPx", "페더링(경계 부드러움)", 0, 50],
          ["roundnessPct", "둥근 모서리", 0, 100],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key} className="block space-y-1">
          <span className="text-white/40">
            {label}: {mask[key]}
          </span>
          <Slider value={[mask[key]]} onValueChange={([v]) => set({ [key]: v })} min={min} max={max} step={key === "x" || key === "y" || key === "width" || key === "height" ? 0.01 : 1} />
        </label>
      ))}
      <label className="flex items-center gap-2">
        <Checkbox checked={mask.inverted} onCheckedChange={(v) => set({ inverted: Boolean(v) })} />
        <span>반전 (마스크 바깥만 보이기)</span>
      </label>
      <Button variant="destructive" className="w-full" onClick={() => onChange(null)}>
        마스크 제거
      </Button>
    </div>
  );
}
