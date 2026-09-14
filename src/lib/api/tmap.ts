// src/lib/api/tmap.ts
//
// Tmap/티맵 REST API (서버용) — 보조 소스
// - 차량 경로(실시간 교통 ETA): Tmap car routes POST
// - 대중교통 경로: Tmap transit/routes POST
//
// 원칙:
//  - TMAP_APP_KEY를 process.env에서 읽고, 값이 없으면 요청을 보내지 않는다.
//  - 키 값은 절대 로깅·응답·문서에 노출하지 않는다.
//  - 좌표는 서버 내부용이며, 사용자에게 보여줄 결과에는 숨긴다.
//  - 실패 시 폴백 필요 여부를 함께 반환해 호출 측이 다음 순위로 넘어갈 수 있게 한다.
//
// 참조: API_INTEROP_GUIDE.md §5 (Tmap car routes / transit/routes)

import { getJson, postJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';
import { TransitResult, TaxiResult } from '../types';

const TMAP_APP_KEY_ENV = EnvKeys.TMAP_APP_KEY;

// ------------------------------------------------------ 차량 경로 (택시 ETA 보조)

export interface TmapCarResult {
  durationMinutes: number | null;
  distanceMeters: number | null;
  trafficInfo?: string | null;
  note: string;
}

/**
 * Tmap car routes(차량 경로)를 조회한다.
 * - 2순위 차량 소스. Navi 실패/빈 결과 시 시도.
 * - POST https://apis.openapi.sk.com/tmap/routes?version=1
 * - 인증: header appKey, Accept: application/json, Content-Type: application/json
 * - 응답: features[].properties.pointType === "S" → totalTime(초) → 분 환산
 */
export async function tmapCarTrip(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<{ ok: boolean; data?: TmapCarResult; error?: string; fallback: boolean }> {
  if (!hasEnv(TMAP_APP_KEY_ENV)) {
    return {
      ok: false,
      error: 'TMAP_APP_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const key = process.env[TMAP_APP_KEY_ENV] ?? '';

  const url = 'https://apis.openapi.sk.com/tmap/routes?version=1';
  const headers = {
    appKey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const now = new Date();
  const gpsTime = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);

  const body = {
    startX,
    startY,
    endX,
    endY,
    tollgateFareOption: 16,
    roadType: 32,
    directionOption: 0,
    endRpFlag: 'G',
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    sort: 'index',
    totalValue: 1,
    trafficInfo: 'Y',
    mainRoadInfo: 'N',
    carType: 0,
    detailPosFlag: '2',
    gpsTime,
    speed: 10,
    uncetaintyP: 1,
    uncetaintyA: 1,
    uncetaintyAP: 1,
  };

  const result = await postJson<unknown>(url, body, headers, 15000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `Tmap 차량 경로 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Tmap 차량 경로: 응답 파싱 실패', fallback: true };
  }

  const features = (data as Record<string, unknown>).features;
  if (!Array.isArray(features) || features.length === 0) {
    return { ok: false, error: 'Tmap 차량 경로: features 없음', fallback: true };
  }

  let summary: Record<string, unknown> | null = null;
  for (const feat of features) {
    if (feat && typeof feat === 'object') {
      const featObj = feat as Record<string, unknown>;
      const props = featObj.properties;
      if (props && typeof props === 'object') {
        const propsObj = props as Record<string, unknown>;
        if (propsObj.pointType === 'S') {
          summary = propsObj;
          break;
        }
      }
    }
  }
  if (!summary) {
    summary = (features[0] as Record<string, unknown>).properties as Record<string, unknown> || {};
  }

  const totalSeconds = summary?.totalTime;
  if (typeof totalSeconds !== 'number') {
    return { ok: false, error: 'Tmap 차량 경로: totalTime 추출 실패', fallback: true };
  }

  const durationMinutes = Math.round(totalSeconds / 60);
  const distanceMeters = typeof summary?.totalDistance === 'number' ? summary.totalDistance : null;
  const trafficInfo =
    typeof summary?.traffic_state === 'string' ? summary.traffic_state : undefined;

  return {
    ok: true,
    data: {
      durationMinutes,
      distanceMeters,
      trafficInfo,
      note: 'Tmap 차량 경로 기준',
    },
    fallback: false,
  };
}

// ------------------------------------------------------ 대중교통 경로 (대중교통 보조)

export interface TmapTransitResult {
  durationMinutes: number | null;
  transfers: number | null;
  distanceMeters: number | null;
  note: string;
}

/**
 * Tmap transit/routes(대중교통 경로)를 조회한다.
 * - 2순위 대중교통 소스. 카카오맵 실패/빈 결과 시 시도.
 * - POST https://apis.openapi.sk.com/transit/routes?version=1
 * - 인증: header appKey, Accept: application/json, Content-Type: application/json
 * - 요청 바디: startX/Y/endX/Y (string), lang, format, count
 * - 응답: plan.itineraries[] 또는 route/routes/result
 */
export async function tmapTransitTrip(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  debug?: boolean,
): Promise<{ ok: boolean; data?: TmapTransitResult; error?: string; fallback: boolean }> {
  if (!hasEnv(TMAP_APP_KEY_ENV)) {
    return {
      ok: false,
      error: 'TMAP_APP_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const key = process.env[TMAP_APP_KEY_ENV] ?? '';

  const url = 'https://apis.openapi.sk.com/transit/routes';
  const headers = {
    appKey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const body = {
    startX: String(startX),
    startY: String(startY),
    endX: String(endX),
    endY: String(endY),
    lang: 0,
    format: 'json',
    count: 10,
  };

  const result = await postJson<unknown>(url, body, headers, 10000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `Tmap 대중교통 경로 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Tmap 대중교통: 응답 파싱 실패', fallback: true };
  }

  if (debug) {
    console.log('[Tmap Transit Debug] 응답 전체:', JSON.stringify(data, null, 2).slice(0, 3000));
  }

  const d = data as Record<string, unknown>;

  // Document 기준: metaData + plan.itineraries
  const metaData = (d.metaData as Record<string, unknown>) ?? {};
  const plan = (d.plan as Record<string, unknown>) ?? {};
  const itineraries = (plan.itineraries as unknown[]) ?? [];

  // plan.itineraries가 없으면 metaData.requestParameters에서 버스/지하철 개수로 판단
  const reqParams = (metaData.requestParameters as Record<string, unknown>) ?? {};
  const busCount = typeof reqParams.busCount === 'number' ? reqParams.busCount : 0;
  const subwayCount = typeof reqParams.subwayCount === 'number' ? reqParams.subwayCount : 0;
  const subwayBusCount = typeof reqParams.subwayBusCount === 'number' ? reqParams.subwayBusCount : 0;

  if (itineraries.length === 0) {
    // 대중교통 경로가 없다고 판단됨
    return {
      ok: false,
      error: `Tmap 대중교통 경로 없음 (버스 ${busCount}건, 지하철 ${subwayCount}건, 버스+지하철 ${subwayBusCount}건)`,
      fallback: true,
    };
  }

  // 각 경로에서 소요시간·거리·환승 추출 (Document 필드명 기준)
  let bestMinutes: number | null = null;
  let totalDistance: number | null = null;
  let transfers: number | null = null;

  for (const it of itineraries) {
    if (!it || typeof it !== 'object') continue;
    const obj = it as Record<string, unknown>;

    // totalTime: 초 단위 (Document: 총 소요시간(sec))
    const totalTime = obj.totalTime;
    if (typeof totalTime === 'number') {
      const mins = Math.round(totalTime / 60);
      if (bestMinutes === null || mins < bestMinutes) bestMinutes = mins;
    }

    // totalDistance: 총 이동거리(m), totalWalkDistance: 총 보행자 이동 거리(m)
    const dist = obj.totalDistance;
    if (typeof dist === 'number' && totalDistance === null) totalDistance = dist;

    // transferCount: 환승횟수
    const tr = obj.transferCount;
    if (typeof tr === 'number' && transfers === null) transfers = tr;
  }

  if (bestMinutes === null) {
    return { ok: false, error: 'Tmap 대중교통: 소요시간 추출 실패', fallback: true };
  }

  return {
    ok: true,
    data: {
      durationMinutes: bestMinutes,
      transfers,
      distanceMeters: totalDistance,
      note: 'Tmap 대중교통 경로 기준',
    },
    fallback: false,
  };
}
