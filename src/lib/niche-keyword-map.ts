// UI_SPEC.md §7.1 "탐색·분석" 한국형 서브카테고리 칩: YouTube 공식 카테고리 매핑이 부정확하므로
// 칩별 (검색 키워드 세트, 제목 매칭 정규식) 조합으로 정확도를 보강한다. NICHE_CATALOG(니치 카탈로그)와 1:1 대응.

export type NicheKeywordEntry = { keywords: string[]; titlePattern: RegExp };

export const NICHE_KEYWORD_MAP: Record<string, NicheKeywordEntry> = {
  "주식·코인": { keywords: ["주식", "코인", "비트코인", "투자"], titlePattern: /주식|코인|비트코인|투자|증권|재테크/ },
  "자기계발·생산성": { keywords: ["자기계발", "생산성", "습관", "루틴"], titlePattern: /자기계발|생산성|습관|루틴|동기부여/ },
  "테크 리뷰": { keywords: ["테크 리뷰", "신제품 리뷰", "스마트폰 리뷰"], titlePattern: /리뷰|언박싱|스펙|테크/ },
  "AI·생성형 도구": { keywords: ["AI 도구", "생성형 AI", "챗GPT"], titlePattern: /AI|인공지능|챗봇|GPT/i },
  "부동산": { keywords: ["부동산", "아파트", "청약"], titlePattern: /부동산|아파트|청약|전세|매매/ },
  "먹방·혼밥": { keywords: ["먹방", "혼밥", "맛집"], titlePattern: /먹방|혼밥|맛집|먹거리/ },
  "연애·솔로지옥": { keywords: ["연애", "솔로", "소개팅"], titlePattern: /연애|솔로|소개팅|이별|썸/ },
  "브이로그·일상": { keywords: ["브이로그", "일상"], titlePattern: /브이로그|일상|vlog/i },
  "쇼츠·밈": { keywords: ["쇼츠", "밈", "짤"], titlePattern: /쇼츠|밈|shorts|짤/i },
  "K-pop·아이돌": { keywords: ["케이팝", "아이돌", "직캠"], titlePattern: /케이팝|k-?pop|아이돌|직캠/i },
  "게임·리뷰": { keywords: ["게임 리뷰", "게임 공략"], titlePattern: /게임|공략|플레이/ },
  "키즈·교육": { keywords: ["키즈", "어린이 교육"], titlePattern: /키즈|어린이|유아|교육/ },
  "뷰티·패션": { keywords: ["뷰티", "메이크업", "패션"], titlePattern: /뷰티|메이크업|패션|화장품|코디/ },
  "여행·맛집": { keywords: ["여행", "맛집 추천"], titlePattern: /여행|맛집|투어|여행지/ },
  "자동차": { keywords: ["자동차", "신차 리뷰"], titlePattern: /자동차|신차|시승|자동차리뷰/ },
  "이슈·정치 시사": { keywords: ["시사 이슈", "정치 뉴스"], titlePattern: /이슈|정치|시사|사건|뉴스/ },
};

export function getNicheKeywordEntry(niche: string): NicheKeywordEntry | undefined {
  return NICHE_KEYWORD_MAP[niche];
}
