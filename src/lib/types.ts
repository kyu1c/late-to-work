// src/lib/types.ts

/**
 * late-to-work 서비스의 공통 타입.
 * PRD v2 readable 기준으로 정의하며, 외부 API 응답 파싱 시 이 타입으로 맞춘다.
 */

/** 프로필 저장 형태 (localStorage + 서버 저장 공통) */
export interface Profile {
  homeName: string; // 집 위치 이름 (역/건물/주소명)
  homeAddress: string; // 집 상세 주소
  homeX?: number; // 집 경도 (내부용)
  homeY?: number; // 집 위도 (내부용)
  workName: string; // 출근지 이름
  workAddress: string; // 출근지 상세 주소
  workX?: number; // 출근지 경도 (내부용)
  workY?: number; // 출근지 위도 (내부용)
  targetArrival: string; // 목표 도착 시각 (HH:MM)
  preferredTransport: 'subway' | 'bus' | 'any';
  usualTransitMinutes?: number; // 평소 대중교통 소요시간 (분, 선택)
  usualHours?: number; // 평소 평균 이동 소요 시간 — 시 (선택)
  usualMinutes?: number; // 평소 평균 이동 소요 시간 — 분 (선택)
  preferredTimeA?: string; // 전날 밤 선호 시간대 A (HH:MM)
  preferredTimeB?: string; // 전날 밤 선호 시간대 B (HH:MM)
  prepMinutes: number; // 공통 준비 시간 (분, 기본 5)
  taxiCallAddOn: boolean; // 택시 호출 시간 추가 on/off
  taxiCallAddMinutes: number; // 택시 호출 추가 시간 (분)
  lastCachedNight?: string; // 마지막 전날 밤 추천 캐시 날짜 (YYYY-MM-DD)
  lastNightTightDeparture?: string; // 마지막 전날 밤 타이트 출발 시각 (HH:MM)
  lastNightLooseDeparture?: string; // 마지막 전날 밤 여유 출발 시각 (HH:MM)
}

/** 대중교통 경로 결과 (서버에서 가공 후 클라이언트에 전달) */
export interface TransitResult {
  durationMinutes: number | null; // 소요시간 (분), 실패 시 null
  transfers: number | null; // 환승 횟수, 실패 시 null
  distanceMeters: number | null; // 거리 (m), 실패 시 null
  source: 'kakao' | 'tmap' | 'odsay' | 'tago' | 'estimate' | 'none';
  note: string; // 사용자에게 보여줄 참고 문구
  raw?: unknown; // 디버깅용 원본(클라이언트엔 노출하지 않되, 필요시 서버 로그용으로 남겨둘 수 있음)
}

/** 택시(차량) 경로 결과 */
export interface TaxiResult {
  vehicleEtaMinutes: number | null; // 차량 이동 예상 시간 (분)
  taxiFare: number | null; // 택시 요금 (원)
  distanceMeters: number | null; // 거리 (m)
  source: 'navi' | 'tmap' | 'estimate' | 'none';
  note: string;
  raw?: unknown;
}

/** 주소 검색 결과 (UI에는 이름+주소만 표시, 좌표는 내부 계산용) */
export interface AddressSearchResult {
  name: string;
  address: string;
  x?: number;
  y?: number;
}

/** 주소 검색 API 응답 */
export interface AddressSearchResponse {
  results: AddressSearchResult[];
  source: 'address' | 'keyword' | 'none';
  query: string;
}

/** 아침 재추천 요청 */
export interface RecommendRequest {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetArrival: string; // HH:MM
  departureTime?: string; // HH:MM, 없으면 서버 시각 사용
  sharedPrepMinutes?: number;
  taxiCallAddOn?: boolean;
  taxiCallAddMinutes?: number;
  // precomputed 결과 (중복 호출 방지용)
  transitDurationMinutes?: number;
  transitTransfers?: number;
  transitDistanceMeters?: number;
  taxiVehicleEtaMinutes?: number;
  taxiFare?: number;
}

/** 아침 재추천 응답 */
export interface RecommendResponse {
  nowTime: string; // 서버 시각 (HH:MM)
  targetArrival: string;
  sharedPrepMinutes: number;
  taxiPrepTotalMinutes: number;
  transit: {
    durationMinutes: number | null;
    transfers: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
  };
  taxi: {
    vehicleEtaMinutes: number | null;
    taxiFare: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
  };
  comparison: {
    departureTimeUsed: string; // 계산에 사용한 출발 기준 시각 (HH:MM)
    public: {
      departureTime: string;
      totalMinutes: number;
      arrivalTime: string;
      transitMinutes: number;
      prepMinutes: number;
    };
    taxi: {
      departureTime: string;
      totalMinutes: number;
      arrivalTime: string;
      vehicleEtaMinutes: number;
      prepMinutes: number;
    };
    latest: {
      public: {
        latestDeparture: string;
        minutesUntilMustLeave: number; // 양수=여유, 0이하=늦었거나 지금 출발해야 함
      };
      taxi: {
        latestDeparture: string;
        minutesUntilMustLeave: number;
      };
    };
    faster: 'public' | 'taxi' | 'same';
    fasterMinutes: number;
    statement: string;
  };
  actions: string[]; // 오늘 바로 할 행동 2~3개
  weather?: {
    isRaining: boolean;
    note: string;
  };
  note: string; // 전체 참고 문구 (불확실성, 추정 표시 등)
}

/** 전날 밤 추천 응답 */
export interface NightBeforeResponse {
  targetArrival: string;
  isRaining: boolean;
  tight: {
    departureTime: string;
    transportNote: string;
    arrivalNote: string;
  };
  loose: {
    departureTime: string;
    transportNote: string;
    arrivalNote: string;
  };
  note: string;
}

/** API 호출 공통 결과 (성공/실패 구분) */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fallback: boolean };
