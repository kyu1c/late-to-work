// src/lib/api/navi.ts
//
// 카카오모빌리티 Navi API (카카오내비 길찾기)
//  - 자동차 길찾기: https://apis-navi.kakaomobility.com/v1/directions
//  - 미래 운행 정보: https://apis-navi.kakaomobility.com/v1/future/directions
//
// 같은 KakaoAK 키(KAKAO_REST_API_KEY)를 사용하지만, 카카오맵 REST와는 별도 엔드포인트.
// 키는 process.env에서 읽고, 값이 없으면 요청을 보내지 않는다.
//
// 참고: 미래 운행 정보 API는 차량 전용이며, 대중교통 미래 시각 경로는 제공하지 않는다.
//       대중교통은 현재 시각 기준 소요시간을 사용한다.

import { getJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';
import { TaxiResult, ApiResult } from '../types';

const API_KEY_ENV = EnvKeys.KAKAO_REST_API_KEY;

function authHeader(): string {
  const key = process.env[API_KEY_ENV] ?? '';
  return `KakaoAK ${key}`;
}

/** Navi API 기본 요청 Base URL */
const NAVI_BASE = 'https://apis-navi.kakaomobility.com/v1';

// 좌표 문자열 포맷: "lon,lat" (카카오내비는 lon,lat 순서로 받는 경우가 많음)
// PRD/calc 쪽에서 lon=x, lat=y로 쓰고 있으므로 여기서도 그 순서를 그대로 사용한다.
function coordsString(lon: number, lat: number, name?: string): string {
  const base = `${lon},${lat}`;
  if (!name) return base;
  return `${base},name=${encodeURIComponent(name)}`;
}

// ------------------------------------------------------ 차량 길찾기 (현재 기준, ETA + 요금)

export interface NaviDirectionsParams {
  originLon: number;
  originLat: number;
  originName?: string;
  destLon: number;
  destLat: number;
  destName?: string;
  departureTime?: string; // 미래 운행 정보용 (YYYYMMDDHHMM). 없으면 현재 기준.
  priority?: 'RECOMMEND' | 'TIME' | 'DISTANCE';
  waypoints?: Array<{ lon: number; lat: number; name?: string }>;
  avoid?: string;
  alternatives?: boolean;
}

/** Navi 응답에서 필요한 값만 추린 내부 형태 */
export interface NaviCarTripSummary {
  durationMinutes: number | null;   // 예상 소요시간 (분)
  distanceMeters: number | null;    // 거리 (m)
  taxiFare: number | null;          // 택시 요금 (원)
  trafficSpeed?: number | null;     // 교통 속도 관련 정보(있을 경우)
  trafficState?: string | null;     // 교통 상태 텍스트(있을 경우)
  raw?: unknown;
}

/**
 * 차량 경로 정보를 조회한다.
 * - departureTime이 있으면 미래 운행 정보 API를 사용
 * - 없으면 현재 기준 차량 길찾기 API를 사용
 */
export async function naviCarTrip(params: NaviDirectionsParams): Promise<ApiResult<NaviCarTripSummary>> {
  if (!hasEnv(API_KEY_ENV)) {
    return {
      ok: false,
      error: 'KAKAO_REST_API_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const { originLon, originLat, originName, destLon, destLat, destName, departureTime, priority = 'RECOMMEND', waypoints, avoid, alternatives } = params;

  const query = new URLSearchParams();
  query.set('origin', coordsString(originLon, originLat, originName));
  query.set('destination', coordsString(destLon, destLat, destName));
  query.set('priority', priority);

  if (waypoints && waypoints.length > 0) {
    query.set('waypoints', waypoints.map((w) => coordsString(w.lon, w.lat, w.name)).join('|'));
  }
  if (avoid) query.set('avoid', avoid);
  if (alternatives !== undefined) query.set('alternatives', String(alternatives));

  let url: string;
  if (departureTime) {
    // 미래 운행 정보: 출발 시각은 현재 이후여야 함
    url = `${NAVI_BASE}/future/directions?${query.toString()}&departure_time=${departureTime}`;
  } else {
    url = `${NAVI_BASE}/directions?${query.toString()}`;
  }

  const headers = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  };

  const result = await getJson<unknown>(url, headers, 15000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `카카오내비 길찾기 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  // 응답 파싱
  const summary = extractCarSummary(result.data);
  return { ok: true, data: summary };
}

/**
 * Navi 길찾기 응답에서 필요한 값만 추출한다.
 * - summary.duration (초) → 분
 * - summary.distance (m)
 * - summary.fare?.taxi (원)
 * - traffic 관련 필드(있는 경우)
 */
function extractCarSummary(raw: unknown): NaviCarTripSummary {
  if (!raw || typeof raw !== 'object') {
    return { durationMinutes: null, distanceMeters: null, taxiFare: null };
  }

  const obj = raw as Record<string, unknown>;
  const routes = obj.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    return { durationMinutes: null, distanceMeters: null, taxiFare: null };
  }
  const summary = routes[0].summary;
  if (!summary || typeof summary !== 'object') {
    return { durationMinutes: null, distanceMeters: null, taxiFare: null };
  }
  const s = summary as Record<string, unknown>;

  const durationSeconds = typeof s.duration === 'number' ? s.duration : null;
  const durationMinutes = durationSeconds != null ? Math.round(durationSeconds / 60) : null;

  const distanceMeters = typeof s.distance === 'number' ? s.distance : null;

  let taxiFare: number | null = null;
  const fare = s.fare;
  if (fare && typeof fare === 'object') {
    const fareObj = fare as Record<string, unknown>;
    if (typeof fareObj.taxi === 'number') {
      taxiFare = fareObj.taxi;
    }
  }

  const trafficSpeed = typeof s.traffic_speed === 'number' ? s.traffic_speed : undefined;
  const trafficState = typeof s.traffic_state === 'string' ? s.traffic_state : undefined;

  return {
    durationMinutes,
    distanceMeters,
    taxiFare,
    trafficSpeed: trafficSpeed ?? null,
    trafficState: trafficState ?? null,
    raw,
  };
}

// ------------------------------------------------------ 카카오T 딥링크 (앱 열기용)

/**
 * 카카오T 택시 호출용 딥링크를 생성한다.
 *  - 목적지/출발지를 미리 채워넣는 기능은 공식 확인이 필요하므로,
 *    이 단계에서는 앱을 열어 사용자가 직접 출발/도착을 입력하도록 하는 수준을 기본으로 한다.
 *  - 필요시 이후 검증 결과에 따라 파라미터 반영 여부를 결정한다.
 */
export function kakaoTDeepLink(): string {
  // 카카오T 딥링크 스킴은 앱에서 설치된 카카오T를 실행하는 용도.
  // 정확한 파라미터 지원 범위는 카카오T 공식 문서/딥링크 정책 확인 후 확정한다.
  return 'kakaot://';
}
