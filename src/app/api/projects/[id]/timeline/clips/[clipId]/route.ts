import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteClip,
  updateAudioOptions,
  updateClipStyle,
  updateClipText,
  updateClipTiming,
  updateClipVideoProps,
} from "@/server/services/timeline.service";

const subtitleStyleSchema = z
  .object({
    fontFamily: z.string(),
    fontSizePx: z.number(),
    fontColor: z.string(),
    bold: z.boolean(),
    backgroundColor: z.string(),
    backgroundOpacity: z.number().min(0).max(1),
    positionXPx: z.number(),
    positionYPx: z.number(),
    borderWidthPx: z.number(),
    borderColor: z.string(),
    maxLineLength: z.number(),
  })
  .partial();

const transformSchema = z
  .object({ x: z.number(), y: z.number(), scale: z.number(), rotationDeg: z.number(), opacity: z.number(), flipH: z.boolean() })
  .partial();

const effectsSchema = z
  .object({
    colorPreset: z.string(),
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
    temperature: z.number(),
    // 이미지 클립 전용(패닝/줌) — 비디오 클립은 이 필드들을 보내지 않는다.
    panEnabled: z.boolean(),
    panDirection: z.enum(["random", "left", "right", "up", "down"]),
    panSpeed: z.enum(["slow", "normal", "fast"]),
    zoomEnabled: z.boolean(),
    zoomType: z.enum(["in", "out"]),
    zoomIntensity: z.number(),
  })
  .partial();

const transitionSchema = z
  .object({
    type: z.enum([
      "none",
      "fade",
      "cut",
      "slide-left",
      "slide-right",
      "slide-up",
      "slide-down",
      "wipe-left",
      "wipe-right",
      "wipe-up",
      "wipe-down",
      "diagonal-tl",
      "diagonal-br",
      "fade-black",
      "fade-white",
    ]),
    durationMs: z.number(),
  })
  .partial();

const videoOptionsSchema = z.object({ speed: z.number(), flipH: z.boolean() }).partial();

const audioOptionsSchema = z
  .object({ volume: z.number().min(0).max(2), muted: z.boolean(), speed: z.number().min(0.25).max(4) })
  .partial();

const maskSchema = z
  .object({
    shape: z.enum(["rect", "ellipse"]),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    rotationDeg: z.number(),
    featherPx: z.number(),
    roundnessPct: z.number(),
    inverted: z.boolean(),
  })
  .nullable();

const keyframeSchema = z.array(z.object({ atMs: z.number(), value: z.number() }));
const keyframesSchema = z
  .object({ positionX: keyframeSchema, positionY: keyframeSchema, scale: keyframeSchema, rotation: keyframeSchema })
  .partial();

const patchSchema = z.object({
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional(),
  text: z.string().optional(),
  style: subtitleStyleSchema.optional(),
  transform: transformSchema.optional(),
  effects: effectsSchema.optional(),
  transition: transitionSchema.optional(),
  videoOptions: videoOptionsSchema.optional(),
  mask: maskSchema.optional(),
  keyframes: keyframesSchema.optional(),
  audioOptions: audioOptionsSchema.optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; clipId: string } },
) {
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const { startMs, endMs, text, style, transform, effects, transition, videoOptions, mask, keyframes, audioOptions } =
    body.data;
  const hasVideoProps =
    transform !== undefined ||
    effects !== undefined ||
    transition !== undefined ||
    videoOptions !== undefined ||
    mask !== undefined ||
    keyframes !== undefined;
  if (
    startMs === undefined &&
    endMs === undefined &&
    text === undefined &&
    style === undefined &&
    !hasVideoProps &&
    audioOptions === undefined
  ) {
    return NextResponse.json({ error: "변경할 값이 없습니다." }, { status: 400 });
  }

  try {
    let clip;
    if (startMs !== undefined && endMs !== undefined) {
      clip = await updateClipTiming(params.clipId, { startMs, endMs });
    }
    if (text !== undefined) {
      clip = await updateClipText(params.clipId, text);
    }
    if (style !== undefined) {
      clip = await updateClipStyle(params.clipId, style);
    }
    if (hasVideoProps) {
      clip = await updateClipVideoProps(params.clipId, { transform, effects, transition, videoOptions, mask, keyframes });
    }
    if (audioOptions !== undefined) {
      clip = await updateAudioOptions(params.clipId, audioOptions);
    }
    return NextResponse.json(clip);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; clipId: string } },
) {
  try {
    await deleteClip(params.clipId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
