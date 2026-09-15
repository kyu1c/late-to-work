// src/lib/api/kakao.ts
//
// 카카오맵 REST API(서버용) + 카카오모빌리티 Navi API를 여기에서 함께 다룬다.
// 둘 다 같은 KakaoAK 키(KAKAO_REST_API_KEY)를 사용하지만 엔드포인트와 용도가 다르다.
//
// - 카카오맵 REST: 주소/키워드/카테고리 검색, 대중교통·도보 경로 등 (서버에서 호출)
// - 카카오모빌리티 Navi: 자동차 길찾기 + 미래 운행 정보 (차량 ETA, 요금)
//
// 원칙:
//  - 키 값은 절대 로깅·응답·문서에 노출하지 않는다.
//  - 키가 없으면 요청을 보내지 않고 폴백 신호만 반환한다.
//  - 좌표는 서버 내부용이며, 사용자에게 보여줄 결과에는 숨긴다.

import { getJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';
import { AddressSearchResult } from '../types';

const API_KEY_ENV = EnvKeys.KAKAO_REST_API_KEY;

function authHeader(): string {
  const key = process.env[API_KEY_ENV] ?? '';
  return `KakaoAK ${key}`;
}

// ------------------------------------------------------ 주소/키워드 검색 (좌표 숨김)

export interface KakaoSearchItem {
  id: string;
  name: string;
  address: string;       // 상세 주소
  roadAddress?: string;  // 도로명 주소
  x: number;            // 경도 (내부용)
  y: number;            // 위도 (내부용)
  phone?: string;
}

export interface KakaoSearchResponse {
  results: KakaoSearchItem[];
}

// 키워드 검색 응답 문서 타입
type KakaoKeywordDoc = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name?: string;
  x: number;
  y: number;
  phone?: string;
};

// 주소 검색 응답 문서 타입
type KakaoAddressDoc = {
  id: string;
  address_name: string;
  road_address_name?: string;
  x: number;
  y: number;
};

/** 키워드 검색 (예: "카카오", "스타벅스", 회사명 등). */
export async function searchByKeyword(
  query: string,
  options?: { category?: string; x?: number; y?: number; radius?: number },
): Promise<{ ok: boolean; data?: KakaoSearchResponse; error?: string; fallback: boolean }> {
  if (!hasEnv(API_KEY_ENV)) {
    return {
      ok: false,
      error: 'KAKAO_REST_API_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const params = new URLSearchParams();
  params.set('query', query);
  if (options?.category) params.set('category_code', options.category);
  if (options?.x !== undefined) params.set('x', String(options.x));
  if (options?.y !== undefined) params.set('y', String(options.y));
  if (options?.radius !== undefined) params.set('radius', String(options.radius));

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`;
  const result = await getJson<{ documents: KakaoKeywordDoc[] }>(url, { Authorization: authHeader() });

  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `카카오 키워드 검색 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const items: KakaoSearchItem[] = result.data.documents.map((d) => ({
    id: d.id,
    name: d.place_name,
    address: d.address_name,
    roadAddress: d.road_address_name ?? undefined,
    x: d.x,
    y: d.y,
    phone: d.phone ?? undefined,
  }));

  return { ok: true, data: { results: items }, fallback: false };
}

/** 주소 검색 (도로명/지번). 검색어를 기준으로 주소 후보 목록을 얻는다. */
export async function searchAddress(
  query: string,
): Promise<{ ok: boolean; data?: KakaoSearchResponse; error?: string; fallback: boolean }> {
  if (!hasEnv(API_KEY_ENV)) {
    return {
      ok: false,
      error: 'KAKAO_REST_API_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
  const result = await getJson<{ documents: KakaoAddressDoc[] }>(url, { Authorization: authHeader() });

  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `카카오 주소 검색 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const items: KakaoSearchItem[] = result.data.documents.map((d) => ({
    id: d.id,
    name: d.road_address_name ?? d.address_name,
    address: d.road_address_name ?? d.address_name,
    x: d.x,
    y: d.y,
  }));

  return { ok: true, data: { results: items }, fallback: false };
}

/** 클라이언트에 보여줄 주소 검색 결과(주소/키워드 통합, 좌표는 내부 계산용). */
export interface KakaoAddressSearchOutput {
  results: AddressSearchResult[];
  source: 'keyword' | 'address';
}

export async function kakaoAddressSearchOutput(
  query: string,
  preferAddressSearch = false,
): Promise<{ ok: boolean; data?: KakaoAddressSearchOutput; error?: string; fallback: boolean }> {
  // 주소 검색을 우선 시도하되, 결과가 없으면 키워드 검색을 보조로 사용한다.
  const primary = preferAddressSearch ? searchAddress(query) : searchByKeyword(query);
  const primaryResult = await primary;

  if (primaryResult.ok && primaryResult.data?.results.length! > 0) {
    return {
      ok: true,
      data: {
        results: primaryResult.data!.results.map((item) => ({
          name: item.name,
          address: item.roadAddress ?? item.address,
          x: Number(item.x),
          y: Number(item.y),
        })),
        source: preferAddressSearch ? 'address' : 'keyword',
      },
      fallback: false,
    };
  }

  // 1차 결과가 비어 있으면 보조 검색 시도
  const secondary = preferAddressSearch ? searchByKeyword(query) : searchAddress(query);
  const secondaryResult = await secondary;

  if (secondaryResult.ok && secondaryResult.data?.results.length! > 0) {
    return {
      ok: true,
      data: {
        results: secondaryResult.data!.results.map((item) => ({
          name: item.name,
          address: item.roadAddress ?? item.address,
          x: Number(item.x),
          y: Number(item.y),
        })),
        source: preferAddressSearch ? 'keyword' : 'address',
      },
      fallback: false,
    };
  }

  // 둘 다 실패/비어 있음 → 1차 실패 원인을 우선 노출
  const baseError = primaryResult.ok
    ? '검색 결과가 없습니다.'
    : `카카오 주소/키워드 검색 실패: ${primaryResult.error}`;
  return {
    ok: false,
    error: baseError,
    fallback: !primaryResult.ok && !secondaryResult.ok,
  };
}

// ------------------------------------------------------ 대중교통 경로 (1순위 대중교통 소스)

/**
 * 카카오맵 대중교통 경로를 조회한다.
 * - 1순위 대중교통 소스(경로 존재 확인 + 카카오맵 링크 제공 용도).
 * - 카카오맵 REST 대중교통 API(dapi.kakao.com/v2/routing/publictraffic)는
 *   경로 상세(소요시간/환승/거리)를 직접 제공하지 않고,
 *   전체 경로 수·유형별 개수·랜딩 URL만 반환한다.
 * - 따라서 실제 소요시간·환승·거리는 ODsay/Tmap Transit 결과에서 가져오며,
 *   이 함수는 "대중교통 경로가 존재함"을 확인하고 카카오맵 길찾기 링크를 제공하는 역할을 한다.
 * - 호출 성공 시 durationMinutes/transfers/distanceMeters는 null로 두고,
 *  후속 체인(ODsay/Tmap)에서 실제 수치를 채운다.
 */
export async function kakaoTransitTrip(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<{
  ok: boolean;
  data?: {
    durationMinutes: number | null;
    transfers: number | null;
    distanceMeters: number | null;
    exists: boolean;
    totalRoutes: number | null;
    busCount: number | null;
    subwayCount: number | null;
    landingUrl: string | null;
    note: string;
  };
  error?: string;
  fallback: boolean;
}> {
  if (!hasEnv(API_KEY_ENV)) {
    return {
      ok: false,
      error: 'KAKAO_REST_API_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const params = new URLSearchParams();
  params.set('start_x', String(startX));
  params.set('start_y', String(startY));
  params.set('end_x', String(endX));
  params.set('end_y', String(endY));

  const url = `https://dapi.kakao.com/v2/routing/publictraffic?${params.toString()}`;
  const result = await getJson<{ status?: string; properties?: { total?: number; bus?: number; subway?: number; busAndSubway?: number; landingURL?: string } }>(url, { Authorization: authHeader() });

  if (!result.ok) {
    const classification = classifyFailure(result);
    return {
      ok: false,
      error: `카카오맵 대중교통 경로 실패: ${result.error}`,
      fallback: classification.kind === 'authFailure' ? false : true,
    };
  }

  const props = result.data?.properties;
  const status = result.data?.status;
  const total = props?.total;

  // 카카오맵 REST 대중교통은 경로 상세(소요시간/환승/거리)를 제공하지 않음.
  // 총 경로 수·유형별 개수·랜딩 URL만 반환하므로, "경로 존재 확인"만 하고
  // 실제 소요시간은 후속 체인(ODsay/Tmap)에서 채운다.
  const exists = status === 'OK' && typeof total === 'number' && total > 0;

  return {
    ok: true,
    data: {
      durationMinutes: null,
      transfers: null,
      distanceMeters: null,
      exists,
      totalRoutes: exists ? total : null,
      busCount: props?.bus ?? null,
      subwayCount: props?.subway ?? null,
      landingUrl: props?.landingURL ?? null,
      note: exists
        ? `카카오맵 대중교통 경로 확인됨 (총 ${total}개 경로, 상세 수치는 ODsay/Tmap 참고)`
        : '카카오맵 대중교통 경로 결과가 없습니다.',
    },
    fallback: false,
  };
}
