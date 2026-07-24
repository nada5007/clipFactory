// UI_SPEC.md §7.1 "탐색·분석" 결과 하단 "이 결과의 핵심 토픽": 결과 제목 코퍼스에서 TF-IDF 기반 상위 토픽을 추출한다.
// 형태소 분석기 없이, 공백/구두점 단위 토큰화 + 문서빈도(df) 기반 TF-IDF 근사로 산출한다.

const TOKEN_PATTERN = /[가-힣a-zA-Z0-9]+/g;
const MIN_TOKEN_LENGTH = 2;
const STOPWORDS = new Set([
  "그리고", "그것", "이것", "저것", "합니다", "습니다", "하는", "있는", "없는", "위해",
  "하고", "에서", "으로", "에게", "부터", "까지", "그리", "이제", "정말", "완전",
]);

function tokenize(title: string): Set<string> {
  const tokens = title.match(TOKEN_PATTERN) ?? [];
  return new Set(tokens.filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t)));
}

export type TopicCount = { term: string; count: number };

// topN개 반환. count = 결과 코퍼스(titles) 중 해당 용어가 등장한 문서(제목) 수(document frequency).
export function extractTopTopics(titles: string[], topN = 10): TopicCount[] {
  if (titles.length === 0) return [];

  const documentFrequency = new Map<string, number>();
  for (const title of titles) {
    Array.from(tokenize(title)).forEach((term) => {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    });
  }

  const totalDocs = titles.length;
  const scored = Array.from(documentFrequency.entries()).map(([term, df]) => {
    // idf: 코퍼스 전체에 고르게 등장하는 단어(예: "영상", "쇼츠")는 변별력이 낮으므로 가중치를 낮춘다.
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
    return { term, count: df, score: df * idf };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, topN)
    .map(({ term, count }) => ({ term, count }));
}
