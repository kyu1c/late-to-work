// src/lib/api/tago.ts
//
// TAGO(국토교통부) 버스/지하철 API (서버용) — 4순위 보조
// - 버스정류소 검색, 지하철역 검색 등
//
// 원칙:
//  - TAGO_BUS_KEY, TAGO_SUBWAY_KEY는 공공데이터포털 발급 키로 URL-encoded 형태일 수 있음.
//  - process.env에서 읽은 뒤 unquote 한 번만 적용하고, 요청 파라미터는 urlencode로 구성.
//  - 키 값은 절대 로깅·응답·문서에 노출하지 않는다.
//  - 실패 시 폴백 필요 여부를 함께 반환한다.
//
// 참조: API_INTEROP_GUIDE.md §2 (TAGO)
//       - 버스정류소: getSttnNoList (http://apis.data.go.kr/...)
//       - 지하철역: GetKwrdFndSubwaySttnList

import { getJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';
import { TransitResult } from '../types';

const TAGO_BUS_KEY_ENV = EnvKeys.TAGO_BUS_KEY;
const TAGO_SUBWAY_KEY_ENV = EnvKeys.TAGO_SUBWAY_KEY;

function unquoteOnce(raw: string): string {
  // public-data-portal 키는 URL-encoded일 수 있음 → 한 번만 디코딩
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * TAGO 버스정류소 검색을 시도한다.
 * - 버스정류소 정보 조회용. 4순위 보조.
 * - GET http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList
 * - 필수: serviceKey(unquote 1회), cityCode(5자리 문자열, 서울=12),
 *         nodeNm(정류소명), numOfRows, pageNo, _type=json
 * - resultCode 00 또는 0 모두 성공, items가 "NO_DATA" 문자열일 수 있음
 */
export async function tagoBusSearch(
  cityCode: string,
  nodeNm: string,
): Promise<{ ok: boolean; data?: { stationId?: string; stationName?: string }[]; error?: string; fallback: boolean }> {
  if (!hasEnv(TAGO_BUS_KEY_ENV)) {
    return {
      ok: false,
      error: 'TAGO_BUS_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const rawKey = process.env[TAGO_BUS_KEY_ENV] ?? '';
  const serviceKey = unquoteOnce(rawKey);

  const params = new URLSearchParams();
  params.set('serviceKey', serviceKey);
  params.set('cityCode', cityCode);
  params.set('nodeNm', nodeNm);
  params.set('numOfRows', '10');
  params.set('pageNo', '1');
  params.set('_type', 'json');

  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList?${params.toString()}`;

  const result = await getJson<unknown>(url, undefined, 10000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `TAGO 버스정류소 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'TAGO 버스정류소: 응답 파싱 실패', fallback: true };
  }

  const d = data as Record<string, unknown>;
  const resp = d.response;
  if (!resp || typeof resp !== 'object') {
    return { ok: false, error: 'TAGO 버스정류소: response 없음', fallback: true };
  }

  const header = (resp as Record<string, unknown>).header;
  const resultCode =
    header && typeof header === 'object'
      ? (header as Record<string, unknown>).resultCode
      : null;
  if (resultCode !== '00' && resultCode !== '0') {
    const resultMsg =
      header && typeof header === 'object'
        ? (header as Record<string, unknown>).resultMsg
        : '';
    return {
      ok: false,
      error: `TAGO 버스정류소 resultCode=${resultCode} (${resultMsg})`,
      fallback: true,
    };
  }

  const body = (resp as Record<string, unknown>).body;
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'TAGO 버스정류소: body 없음', fallback: true };
  }

  const items = (body as Record<string, unknown>).items;
  let itemList: unknown[] = [];
  if (Array.isArray(items)) {
    itemList = items;
  } else if (items === 'NO_DATA' || items === null || items === undefined) {
    itemList = [];
  } else if (typeof items === 'object') {
    const item = (items as Record<string, unknown>).item;
    if (Array.isArray(item)) itemList = item;
  }

  const out: { stationId?: string; stationName?: string }[] = [];
  for (const it of itemList) {
    if (!it || typeof it !== 'object') continue;
    const obj = it as Record<string, unknown>;
    const stationId = obj.nodeid ?? obj.stationId;
    const stationName = obj.nodenm ?? obj.stationName;
    if (typeof stationId === 'string' || typeof stationName === 'string') {
      out.push({
        stationId: typeof stationId === 'string' ? stationId : undefined,
        stationName: typeof stationName === 'string' ? stationName : undefined,
      });
    }
  }

  return { ok: true, data: out, fallback: false };
}

/**
 * TAGO 지하철역 검색을 시도한다.
 * - 지하철역 정보 조회용. 4순위 보조.
 * - GET http://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList
 * - 필수: serviceKey(unquote 1회), subwayStationName(역명, "역" 접미사 없이),
 *         numOfRows, pageNo, _type=json
 * - cityCode 불필요. 역명에 "역" 포함 시 결과 없을 수 있음 → 제거 후 재시도.
 */
export async function tagoSubwaySearch(
  subwayStationName: string,
): Promise<{ ok: boolean; data?: { stationId?: string; stationName?: string }[]; error?: string; fallback: boolean }> {
  if (!hasEnv(TAGO_SUBWAY_KEY_ENV)) {
    return {
      ok: false,
      error: 'TAGO_SUBWAY_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const rawKey = process.env[TAGO_SUBWAY_KEY_ENV] ?? '';
  const serviceKey = unquoteOnce(rawKey);

  // 최초 요청: 입력 그대로
  const params = new URLSearchParams();
  params.set('serviceKey', serviceKey);
  params.set('subwayStationName', subwayStationName);
  params.set('numOfRows', '10');
  params.set('pageNo', '1');
  params.set('_type', 'json');

  const url = `http://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList?${params.toString()}`;

  const result = await getJson<unknown>(url, undefined, 10000);
  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `TAGO 지하철역 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const data = result.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'TAGO 지하철역: 응답 파싱 실패', fallback: true };
  }

  const d = data as Record<string, unknown>;
  const resp = d.response;
  if (!resp || typeof resp !== 'object') {
    return { ok: false, error: 'TAGO 지하철역: response 없음', fallback: true };
  }

  const header = (resp as Record<string, unknown>).header;
  const resultCode =
    header && typeof header === 'object'
      ? (header as Record<string, unknown>).resultCode
      : null;
  if (resultCode !== '00' && resultCode !== '0') {
    const resultMsg =
      header && typeof header === 'object'
        ? (header as Record<string, unknown>).resultMsg
        : '';
    return {
      ok: false,
      error: `TAGO 지하철역 resultCode=${resultCode} (${resultMsg})`,
      fallback: true,
    };
  }

  const body = (resp as Record<string, unknown>).body;
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'TAGO 지하철역: body 없음', fallback: true };
  }

  let items = (body as Record<string, unknown>).items;
  let itemList: unknown[] = [];
  if (Array.isArray(items)) {
    itemList = items;
  } else if (items === 'NO_DATA' || items === null || items === undefined) {
    itemList = [];
  } else if (typeof items === 'object') {
    const item = (items as Record<string, unknown>).item;
    if (Array.isArray(item)) itemList = item;
  }

  // 결과가 없으면 "역" 접미사 제거 후 재시도
  if (itemList.length === 0 && subwayStationName.endsWith('역')) {
    const trimmed = subwayStationName.slice(0, -1);
    if (trimmed.length > 0) {
      const params2 = new URLSearchParams();
      params2.set('serviceKey', serviceKey);
      params2.set('subwayStationName', trimmed);
      params2.set('numOfRows', '10');
      params2.set('pageNo', '1');
      params2.set('_type', 'json');
      const url2 = `http://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList?${params2.toString()}`;
      const result2 = await getJson<unknown>(url2, undefined, 10000);
      if (result2.ok && result2.data && typeof result2.data === 'object') {
        const d2 = result2.data as Record<string, unknown>;
        const resp2 = d2.response;
        if (resp2 && typeof resp2 === 'object') {
          const header2 = (resp2 as Record<string, unknown>).header;
          const rc2 =
            header2 && typeof header2 === 'object'
              ? (header2 as Record<string, unknown>).resultCode
              : null;
          if (rc2 === '00' || rc2 === '0') {
            const body2 = (resp2 as Record<string, unknown>).body;
            if (body2 && typeof body2 === 'object') {
              let items2 = (body2 as Record<string, unknown>).items;
              if (Array.isArray(items2)) itemList = items2;
              else if (typeof items2 === 'object') {
                const item2 = (items2 as Record<string, unknown>).item;
                if (Array.isArray(item2)) itemList = item2;
              }
            }
          }
        }
      }
    }
  }

  const out: { stationId?: string; stationName?: string }[] = [];
  for (const it of itemList) {
    if (!it || typeof it !== 'object') continue;
    const obj = it as Record<string, unknown>;
    const stationId = obj.subwayStationId ?? obj.stationId;
    const stationName = obj.subwayStationName ?? obj.stationName;
    if (typeof stationId === 'string' || typeof stationName === 'string') {
      out.push({
        stationId: typeof stationId === 'string' ? stationId : undefined,
        stationName: typeof stationName === 'string' ? stationName : undefined,
      });
    }
  }

  return { ok: true, data: out, fallback: false };
}
