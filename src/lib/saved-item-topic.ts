// PROJECT_SPEC.md §2.3 "저장됨 → 프로젝트 연결": 저장된 영상/채널/아이디어 스냅샷을 대본 생성용 topic 텍스트로 변환한다.
// GenerateScriptForm의 topic 글자수 제약(100~2000자)을 만족하도록 충분히 서술적으로 구성한다.

export type VideoSnapshot = {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  ratio?: number;
};

export type ChannelSnapshot = {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
};

export type IdeaSnapshot = {
  title: string;
  hook: string;
  differentiator: string;
  keywords: string[];
  sourceVideoTitle?: string;
};

export type SavedItemSnapshot =
  | { type: "VIDEO"; snapshot: VideoSnapshot }
  | { type: "CHANNEL"; snapshot: ChannelSnapshot }
  | { type: "IDEA"; snapshot: IdeaSnapshot };

const numberFormat = new Intl.NumberFormat("ko-KR");

export function composeTopicFromSavedItem(item: SavedItemSnapshot): string {
  if (item.type === "VIDEO") {
    const { title, channelTitle, viewCount, ratio } = item.snapshot;
    return [
      `참고 영상 "${title}" (${channelTitle} 채널, 조회수 ${numberFormat.format(viewCount)}회)를 벤치마킹한 쇼츠를 기획한다.`,
      ratio ? `이 영상은 해당 채널 평균 대비 ${ratio.toFixed(1)}배 떡상한 소재다.` : undefined,
      "원본을 그대로 베끼지 말고, 같은 주제를 다른 각도(훅, 전개, 결론)로 재해석해 우리 채널 톤에 맞는 대본으로 만든다.",
      "제목, 후킹멘트(첫 3초), 본문, 장면별 이미지 프롬프트를 포함한 완결된 대본을 작성한다.",
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");
  }

  if (item.type === "CHANNEL") {
    const { title, subscriberCount, videoCount, viewCount } = item.snapshot;
    return [
      `벤치마크 채널 "${title}"(구독자 ${numberFormat.format(subscriberCount)}명, 영상 ${numberFormat.format(videoCount)}개, 총 조회수 ${numberFormat.format(viewCount)}회)의 성공 공식을 참고한 쇼츠를 기획한다.`,
      "이 채널이 다루는 주제·톤·구성 패턴을 분석해 우리 채널에 맞게 재해석한 새 소재로 대본을 작성한다.",
      "제목, 후킹멘트(첫 3초), 본문, 장면별 이미지 프롬프트를 포함한 완결된 대본을 작성한다.",
    ].join(" ");
  }

  const { title, hook, differentiator, keywords, sourceVideoTitle } = item.snapshot;
  return [
    `AI가 제안한 쇼츠 아이디어 "${title}"를 대본으로 발전시킨다.`,
    `후킹(첫 3초): ${hook}`,
    `차별화 포인트: ${differentiator}`,
    keywords.length > 0 ? `관련 키워드: ${keywords.join(", ")}` : undefined,
    sourceVideoTitle ? `참고 원본 영상: "${sourceVideoTitle}"` : undefined,
    "위 아이디어를 바탕으로 제목, 후킹멘트, 본문, 장면별 이미지 프롬프트를 포함한 완결된 대본을 작성한다.",
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}
