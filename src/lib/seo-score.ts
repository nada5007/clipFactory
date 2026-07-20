// UI_SPEC.md §7.1 "영상 SEO" 구현 노트 + 소스 영상 상세 모달 SEO 탭: 5항목×20점 = 100점 규칙 기반 채점.

export type SeoVideoInput = {
  title: string;
  description: string;
  tags: string[];
  hasMaxResThumbnail: boolean;
};

export type SeoScoreItem = { key: string; label: string; score: number; max: number; detail: string };
export type BestPracticeCheck = { key: string; label: string; passed: boolean };

export type SeoScoreResult = {
  total: number;
  mode: "general" | "keyword";
  targetKeyword?: string;
  items: SeoScoreItem[];
  bestPractices: BestPracticeCheck[];
  suggestions: string[];
};

const ITEM_MAX = 20;
const TAG_CHAR_LIMIT = 500;

function countTimestamps(description: string): number {
  return (description.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) ?? []).length;
}

function hasCta(description: string): boolean {
  return /(구독|좋아요|댓글)/.test(description);
}

function tagCharLength(tags: string[]): number {
  return tags.join(",").length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreTitleLength(len: number): number {
  if (len >= 30 && len <= 60) return ITEM_MAX;
  const distance = len < 30 ? 30 - len : len - 60;
  return clamp(ITEM_MAX - distance * 0.7, 0, ITEM_MAX);
}

function scoreTagCount(count: number): number {
  return clamp((count / 15) * ITEM_MAX, 0, ITEM_MAX);
}

function scoreDescriptionRichness(description: string): number {
  const lengthScore = clamp((description.length / 250) * 12, 0, 12);
  const ctaScore = hasCta(description) ? 4 : 0;
  const timestampScore = countTimestamps(description) > 0 ? 4 : 0;
  return lengthScore + ctaScore + timestampScore;
}

function scoreTagUsage(tags: string[]): number {
  return clamp((tagCharLength(tags) / TAG_CHAR_LIMIT) * ITEM_MAX, 0, ITEM_MAX);
}

function scoreTitleDescriptionMatch(title: string, description: string): number {
  const titleTokens = new Set(title.toLowerCase().split(/\s+/).filter(Boolean));
  const descTokens = new Set(description.toLowerCase().split(/\s+/).filter(Boolean));
  if (titleTokens.size === 0) return 0;
  let common = 0;
  for (const token of Array.from(titleTokens)) if (descTokens.has(token)) common++;
  return clamp((common / titleTokens.size) * ITEM_MAX, 0, ITEM_MAX);
}

function buildBestPractices(video: SeoVideoInput): BestPracticeCheck[] {
  return [
    { key: "thumbnail_resolution", label: "썸네일 HD 해상도", passed: video.hasMaxResThumbnail },
    { key: "timestamps", label: "설명에 타임스탬프", passed: countTimestamps(video.description) > 0 },
    { key: "cta_in_description", label: "댓글·구독 CTA", passed: hasCta(video.description) },
    { key: "tag_count", label: "태그 5개 이상", passed: video.tags.length >= 5 },
    { key: "description_length", label: "설명 250자 이상", passed: video.description.length >= 250 },
  ];
}

function buildSuggestions(items: SeoScoreItem[], video: SeoVideoInput, targetKeyword?: string): string[] {
  const suggestions: string[] = [];
  for (const item of items) {
    if (item.score >= item.max) continue;
    if (item.key === "title" && targetKeyword) suggestions.push(`제목에 타깃 키워드 '${targetKeyword}'를 포함하세요.`);
    else if (item.key === "title") suggestions.push(`제목 길이를 30~60자 사이로 조정하세요 (현재 ${video.title.length}자).`);
    else if (item.key === "description" && targetKeyword)
      suggestions.push(`설명에 타깃 키워드 '${targetKeyword}'와 타임스탬프를 포함하세요.`);
    else if (item.key === "description") suggestions.push("설명에 250자 이상의 내용과 구독/좋아요 CTA, 타임스탬프를 포함하세요.");
    else if (item.key === "tags" && targetKeyword)
      suggestions.push(`타깃 키워드 '${targetKeyword}'를 포함한 태그를 추가하세요.`);
    else if (item.key === "tags") suggestions.push(`태그를 더 추가하세요 (현재 ${video.tags.length}개, 권장 15개 이상).`);
    else if (item.key === "tagUsage")
      suggestions.push(`태그 총 글자 수를 350자 이상으로 늘려 태그 슬롯을 활용하세요 (현재 ${tagCharLength(video.tags)}자).`);
    else if (item.key === "chapters") suggestions.push("설명에 챕터 타임스탬프(예: 0:00 인트로)를 3개 이상 추가하세요.");
    else if (item.key === "hashtags") suggestions.push("제목이나 설명에 관련 해시태그를 추가하세요.");
    else if (item.key === "titleDescriptionMatch") suggestions.push("제목의 핵심 단어를 설명 초반에도 반복해 제목-설명 일치도를 높이세요.");
  }
  return suggestions;
}

export function computeGeneralSeoScore(video: SeoVideoInput): SeoScoreResult {
  const items: SeoScoreItem[] = [
    { key: "title", label: "제목 키워드", score: Math.round(scoreTitleLength(video.title.length)), max: ITEM_MAX, detail: `제목 ${video.title.length}자` },
    { key: "description", label: "설명 키워드", score: Math.round(scoreDescriptionRichness(video.description)), max: ITEM_MAX, detail: `설명 ${video.description.length}자` },
    { key: "tags", label: "태그 키워드", score: Math.round(scoreTagCount(video.tags.length)), max: ITEM_MAX, detail: `태그 ${video.tags.length}개` },
    {
      key: "tagUsage",
      label: "태그 활용도",
      score: Math.round(scoreTagUsage(video.tags)),
      max: ITEM_MAX,
      detail: `태그 ${tagCharLength(video.tags)}/${TAG_CHAR_LIMIT}자`,
    },
    {
      key: "titleDescriptionMatch",
      label: "제목·설명 일치",
      score: Math.round(scoreTitleDescriptionMatch(video.title, video.description)),
      max: ITEM_MAX,
      detail: "공통 토큰 비율",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.score, 0);

  return {
    total,
    mode: "general",
    items,
    bestPractices: buildBestPractices(video),
    suggestions: buildSuggestions(items, video),
  };
}

export function computeKeywordSeoScore(video: SeoVideoInput, targetKeyword: string): SeoScoreResult {
  const keyword = targetKeyword.trim().toLowerCase();
  const titleHasKeyword = video.title.toLowerCase().includes(keyword);
  const descriptionHasKeyword = video.description.toLowerCase().includes(keyword);
  const tagsHaveKeyword = video.tags.some((tag) => tag.toLowerCase().includes(keyword));

  const titleScore = (titleHasKeyword ? 14 : 0) + (scoreTitleLength(video.title.length) / ITEM_MAX) * 6;
  const descriptionScore = (descriptionHasKeyword ? 12 : 0) + (countTimestamps(video.description) > 0 ? 8 : 0);
  const tagsScore = tagsHaveKeyword ? ITEM_MAX : clamp(video.tags.length * 0.7, 0, 10);

  const items: SeoScoreItem[] = [
    {
      key: "title",
      label: "제목+키워드",
      score: Math.round(titleScore),
      max: ITEM_MAX,
      detail: titleHasKeyword ? `키워드 포함, 제목 ${video.title.length}자` : `키워드 미포함, 제목 ${video.title.length}자`,
    },
    {
      key: "description",
      label: "설명+키워드",
      score: Math.round(descriptionScore),
      max: ITEM_MAX,
      detail: descriptionHasKeyword ? "키워드 포함" : "키워드 미포함",
    },
    {
      key: "tags",
      label: "태그+키워드",
      score: Math.round(tagsScore),
      max: ITEM_MAX,
      detail: tagsHaveKeyword ? "타깃 키워드 포함" : "타깃 키워드 미포함",
    },
    {
      key: "tagUsage",
      label: "태그 사용량",
      score: Math.round(scoreTagUsage(video.tags)),
      max: ITEM_MAX,
      detail: `태그 ${tagCharLength(video.tags)}/${TAG_CHAR_LIMIT}자`,
    },
    {
      key: "titleDescriptionMatch",
      label: "제목-설명 일치도",
      score: Math.round(scoreTitleDescriptionMatch(video.title, video.description)),
      max: ITEM_MAX,
      detail: "공통 토큰 비율",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.score, 0);

  return {
    total,
    mode: "keyword",
    targetKeyword,
    items,
    bestPractices: buildBestPractices(video),
    suggestions: buildSuggestions(items, video, targetKeyword),
  };
}
