"use client";

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

// PROJECT_SPEC.md §2.2 "유튜브 데이터 분석 — 하위 메뉴 검색 결과 유지": 분석 하위 메뉴(탐색·분석/채널 분석/
// 소스 발굴/떡상 영상/영상 SEO)의 검색 결과·입력을 다른 페이지로 이동했다가 돌아와도 유지한다.
// 구현: 모듈 레벨 인메모리 저장소. Next App Router의 페이지 전환은 클라이언트 사이드(런타임 유지)라
// 이 모듈 싱글턴에 담아두면 재방문 시 복원된다(전체 새로고침 시에는 초기화 — 의도된 범위).
// Set 등 직렬화 불가 값도 그대로 보존된다.
const memoryStore = new Map<string, unknown>();

// useState 드롭인 대체: 같은 key로 마운트되면 저장소의 마지막 값으로 초기화한다. 함수형 업데이트 지원.
export function usePersistedState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (memoryStore.has(key) ? (memoryStore.get(key) as T) : initialValue));
  const keyRef = useRef(key);
  keyRef.current = key;

  const setPersisted = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setValue((prev) => {
      const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
      memoryStore.set(keyRef.current, next);
      return next;
    });
  }, []);

  return [value, setPersisted];
}
