"use client";

import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { ElevenLabsModelOption, ElevenLabsVoiceOption } from "@/lib/clients/tts";
import {
  DEFAULT_ELEVENLABS_SETTINGS,
  DEFAULT_OPENAI_TTS_MODEL,
  DEFAULT_OPENAI_TTS_VOICE,
  OPENAI_TTS_FORMATS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  type OpenAiTtsFormat,
  type OpenAiTtsModel,
  type TtsProvider,
} from "@/lib/voice-models";

export type TtsFieldsValue = {
  provider: TtsProvider;
  model: string;
  voiceId: string;
  audioFormat: OpenAiTtsFormat;
  instructions: string;
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
};

export const DEFAULT_TTS_FIELDS_VALUE: TtsFieldsValue = {
  provider: "openai",
  model: DEFAULT_OPENAI_TTS_MODEL,
  voiceId: DEFAULT_OPENAI_TTS_VOICE,
  audioFormat: "mp3",
  instructions: "",
  speed: 1.0,
  stability: DEFAULT_ELEVENLABS_SETTINGS.stability,
  similarityBoost: DEFAULT_ELEVENLABS_SETTINGS.similarityBoost,
  style: DEFAULT_ELEVENLABS_SETTINGS.style,
};

function useElevenLabsOptions(enabled: boolean) {
  const [models, setModels] = useState<ElevenLabsModelOption[]>([]);
  const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/settings/elevenlabs-options")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { models: ElevenLabsModelOption[]; voices: ElevenLabsVoiceOption[] } | null) => {
        setModels(data?.models ?? []);
        setVoices(data?.voices ?? []);
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  return { models, voices, loading };
}

export function TtsProviderFields({
  value,
  onChange,
  configuredKeys,
}: {
  value: TtsFieldsValue;
  onChange: (next: TtsFieldsValue) => void;
  configuredKeys: Set<string>;
}) {
  const isOpenAi = value.provider === "openai";
  const { models: elevenModels, voices: elevenVoices, loading: elevenLoading } = useElevenLabsOptions(!isOpenAi);
  const openAiModel = OPENAI_TTS_MODELS.find((m) => m.id === value.model);

  function set<K extends keyof TtsFieldsValue>(key: K, v: TtsFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">프로바이더</label>
        <Select
          value={value.provider}
          onValueChange={(provider) =>
            onChange({
              ...DEFAULT_TTS_FIELDS_VALUE,
              provider: provider as TtsProvider,
              voiceId: provider === "openai" ? DEFAULT_OPENAI_TTS_VOICE : "",
              model: provider === "openai" ? DEFAULT_OPENAI_TTS_MODEL : "",
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai" disabled={!configuredKeys.has("IMAGE_API_KEY")}>
              OpenAI Audio TTS{!configuredKeys.has("IMAGE_API_KEY") && " (API 키 필요)"}
            </SelectItem>
            <SelectItem value="elevenlabs" disabled={!configuredKeys.has("ELEVENLABS_API_KEY")}>
              ElevenLabs{!configuredKeys.has("ELEVENLABS_API_KEY") && " (API 키 필요)"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isOpenAi ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">음성 선택</label>
              <Select value={value.voiceId} onValueChange={(v) => set("voiceId", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_TTS_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">모델</label>
              <Select value={value.model} onValueChange={(v) => set("model", v as OpenAiTtsModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_TTS_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">오디오 포맷</label>
            <Select value={value.audioFormat} onValueChange={(v) => set("audioFormat", v as OpenAiTtsFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_TTS_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {openAiModel?.supportsInstructions && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">음성 지시문 (자연어)</label>
              <Textarea
                value={value.instructions}
                onChange={(e) => set("instructions", e.target.value.slice(0, 200))}
                placeholder='예: 젊은 여성 목소리로, 차분한 톤으로 읽어줘 (자연어로 성별, 말투, 감정 조절 가능)'
                rows={3}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>이 모델은 숫자 속도 조절을 지원하지 않습니다. 원하는 속도나 분위기를 지시문에 작성하세요.</span>
                <span>{value.instructions.length}/200</span>
              </div>
            </div>
          )}

          {openAiModel?.supportsSpeed && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>속도</span>
                <span className="text-xs text-muted-foreground">{value.speed.toFixed(2)}</span>
              </div>
              <Slider
                value={[value.speed]}
                onValueChange={([v]) => set("speed", v)}
                min={0.25}
                max={4}
                step={0.05}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">모델 (Model)</label>
              <Select value={value.model} onValueChange={(v) => set("model", v)} disabled={elevenLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={elevenLoading ? "불러오는 중..." : undefined} />
                </SelectTrigger>
                <SelectContent>
                  {elevenModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">음성 (Voice)</label>
              <Select value={value.voiceId} onValueChange={(v) => set("voiceId", v)} disabled={elevenLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={elevenLoading ? "불러오는 중..." : undefined} />
                </SelectTrigger>
                <SelectContent>
                  {elevenVoices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                      {v.gender ? ` (${v.gender})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>안정성 (Stability)</span>
                <span className="text-xs text-muted-foreground">{value.stability.toFixed(2)}</span>
              </div>
              <Slider value={[value.stability]} onValueChange={([v]) => set("stability", v)} min={0} max={1} step={0.05} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>유사도 부스트 (Similarity Boost)</span>
                <span className="text-xs text-muted-foreground">{value.similarityBoost.toFixed(2)}</span>
              </div>
              <Slider
                value={[value.similarityBoost]}
                onValueChange={([v]) => set("similarityBoost", v)}
                min={0}
                max={1}
                step={0.05}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>스타일 (Style)</span>
                <span className="text-xs text-muted-foreground">{value.style.toFixed(2)}</span>
              </div>
              <Slider value={[value.style]} onValueChange={([v]) => set("style", v)} min={0} max={1} step={0.05} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>속도 (Speed)</span>
                <span className="text-xs text-muted-foreground">{value.speed.toFixed(2)}</span>
              </div>
              <Slider value={[value.speed]} onValueChange={([v]) => set("speed", v)} min={0.7} max={1.2} step={0.01} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function toTtsGenerationOptions(value: TtsFieldsValue) {
  if (value.provider === "openai") {
    return {
      provider: "openai" as const,
      model: value.model,
      voiceId: value.voiceId,
      settings: {
        audioFormat: value.audioFormat,
        instructions: value.instructions || undefined,
        speed: value.speed,
      },
    };
  }
  return {
    provider: "elevenlabs" as const,
    model: value.model,
    voiceId: value.voiceId,
    settings: {
      elevenlabs: {
        stability: value.stability,
        similarityBoost: value.similarityBoost,
        style: value.style,
        speed: value.speed,
      },
    },
  };
}
