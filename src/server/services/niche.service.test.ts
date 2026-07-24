import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listNiches, setNiches } from "@/server/services/niche.service";

describe("niche.service", () => {
  let originalNiches: string[] = [];

  // NicheSetting은 사용자별 구분 없는 전역 테이블이라 실제 설정값이 들어있을 수 있다.
  // 무조건 비우면 사용자의 실제 니치 설정을 지워버리므로, 스냅샷 후 테스트가 끝나면 반드시 복원한다.
  beforeAll(async () => {
    originalNiches = await listNiches();
  });

  afterAll(async () => {
    await setNiches(originalNiches);
  });

  it("설정한 니치가 없으면 빈 배열을 반환한다", async () => {
    await setNiches([]);
    expect(await listNiches()).toEqual([]);
  });

  it("니치를 저장하면 저장한 순서대로 조회된다", async () => {
    await setNiches(["부동산", "먹방·혼밥"]);
    expect(await listNiches()).toEqual(["부동산", "먹방·혼밥"]);
  });

  it("다시 설정하면 기존 목록을 완전히 교체한다", async () => {
    await setNiches(["부동산"]);
    await setNiches(["게임·리뷰", "여행·맛집"]);
    expect(await listNiches()).toEqual(["게임·리뷰", "여행·맛집"]);
  });

  it("중복 카테고리는 하나로 합쳐진다", async () => {
    const result = await setNiches(["부동산", "부동산"]);
    expect(result).toEqual(["부동산"]);
    expect(await listNiches()).toEqual(["부동산"]);
  });
});
