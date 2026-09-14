// src/lib/api/odsay.ts
//
// ODsay 대중교통 길찾기 API (서버용) — 3순위
// - 대중교통 경로 소요시간/환승 등 조회
//
// 원칙:
//  - ODSAY_API_KEY를 process.env에서 읽고, 값이 없으면 요청을 보내지 않는다.
//  - ODsay 키는 특수문자 포함 가능 → 요청 전 명시적 인코딩(encodeURIComponent 수준) 필요.
//  - 키 값은 절대 로깅·응답·문서에 노출하지 않는다.
//  - 실패 시 폴백 필요 여부를 함께 반환한다.
//
// 참조: API_INTEROP_GUIDE.md §4 (searchPubTransPathT)
//       https://api.odsay.com/v1/api/searchPubTransPathT
//       필수: SX, SY, EX, EY (경위도), apiKey(인코딩), language, CID

import { getJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';
import { TransitResult } from '../types';

const ODSAY_API_KEY_ENV = EnvKeys.ODSAY_API_KEY;

export interface OdsayTransitResult {
  durationMinutes: number | null;
  transfers: number | null;
  distanceMeters: number | null;
  note: string;
}

/**
 * ODsay 대중교통 길찾기를 조회한다.
 * - 3순위 대중교통 소스. 카카오맵, Tmap transit 실패/빈 결과 시 시도.
 * - GET https://api.odsay.com/v1/api/searchPubTransPathT
 * - apiKey는 특수문자 포함 가능 → encodeURIComponent로 인코딩 필수.
 * - CID: 1000(수도권), 7000(부산), 4000(대구), 5000(광주), 3000(대전)
 */
export async function odsayTransitTrip(
  startX: number,
  startY: number,
  _startName: string,
  endX: number,
  endY: number,
  _endName: string,
): Promise<{ ok: boolean; data?: OdsayTransitResult; error?: string; fallback: boolean }> {
  if (!hasEnv(ODSAY_API_KEY_ENV)) {
    return {
      ok: false,
      error: 'ODSAY_API_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const rawKey = process.env[ODSAY_API_KEY_ENV] ?? '';
  // ODsay 키는 특수문자 포함 가능 → 명시적 인코딩
  const encodedKey = encodeURIComponent(rawKey);

  const params = new URLSearchParams();
  params.set('SX', String(startX));
  params.set('SY', String(startY));
  params.set('EX', String(endX));
  params.set('EY', String(endY));
  params.set('apiKey', encodedKey);
  params.set('language', '0'); // 국문
  params.set('CID', '1000');   // 수도권

  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?${params.toString()}`;

  const result = await getJson<unknown>(url, undefined, 12000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `ODsay 대중교통 길찾기 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'ODsay: 응답 파싱 실패', fallback: true };
  }

  const d = data as Record<string, unknown>;
  const resultObj = d.result;
  if (!resultObj || typeof resultObj !== 'object') {
    return { ok: false, error: 'ODsay: result 객체 없음', fallback: true };
  }

  const paths = (resultObj as Record<string, unknown>).path;
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, error: 'ODsay: 경로 결과 없음', fallback: true };
  }

  // 여러 경로 중 최소 소요시간 선택
  let bestMinutes: number | null = null;
  let totalDistance: number | null = null;
  let totalTransfers: number | null = null;

  for (const path of paths) {
    if (!path || typeof path !== 'object') continue;
    const p = path as Record<string, unknown>;
    const info = p.info;
    if (!info || typeof info !== 'object') continue;
    const i = info as Record<string, unknown>;

    const totalTime = i.totalTime;
    if (typeof totalTime === 'number') {
      if (bestMinutes === null || totalTime < bestMinutes) bestMinutes = totalTime;
    }

    const dist = i.totalDistance;
    if (typeof dist === 'number' && totalDistance === null) totalDistance = dist;

    const busTransit = i.busTransitCount;
    const subwayTransit = i.subwayTransitCount;
    if (typeof busTransit === 'number' && typeof subwayTransit === 'number') {
      const t = busTransit + subwayTransit;
      if (totalTransfers === null || t < totalTransfers) totalTransfers = t;
    }
  }

  if (bestMinutes === null) {
    return { ok: false, error: 'ODsay: 소요시간 추출 실패', fallback: true };
  }

  return {
    ok: true,
    data: {
      durationMinutes: bestMinutes,
      transfers: totalTransfers,
      distanceMeters: totalDistance,
      note: 'ODsay 대중교통 길찾기 기준',
    },
    fallback: false,
  };
}
