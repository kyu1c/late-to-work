// app/api/recommend/route.ts
//
// 아침 재추천 실시간 계산: 서버 시각 기준 비교표+결론+행동.
// PRD 5) 아침 재추천(비교표 + 한 줄 결론 + 행동) — 실시간 계산.
// P0 2번에 해당.

import { NextRequest, NextResponse } from 'next/server';
import { transitChain } from '@/lib/transitChain';
import { taxiChain } from '@/lib/taxiChain';
import { calcCompareOptions, CalcCompareOptionsInput } from '@/lib/calc/calcTrip';
import { NaviDirectionsParams, naviCarTrip } from '@/lib/api/navi';
import { kmaUltraShortSnapshot } from '@/lib/api/kma';
import { RecommendRequest } from '@/lib/types';
import { EnvKeys } from '@/lib/config';

function nowHHmm(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * HH:MM 문자열을 KST 기준 YYYYMMDDHHMM 형식으로 변환한다.
 * Navi /v1/future/directions의 departure_time 파라미터 형식에 맞춘다.
 */
function yyyymmddhhmm(hhmm: string): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const [h, min] = hhmm.split(':').map((s) => s.padStart(2, '0'));
  return `${y}${m}${day}${h}${min}`;
}

function localDayOfWeek(): number {
  // 0=Sunday, 1=Monday, ..., 6=Saturday
  return new Date().getDay();
}

function localToTotal(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function totalToLocal(total: number): string {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60) % 24;
  const m = normalized % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

function validateRecommendBody(body: unknown): {
  ok: true;
  data: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    targetArrival: string;
    departureTime?: string;
    sharedPrepMinutes: number;
    taxiCallAddOn: boolean;
    taxiCallAddMinutes: number;
  };
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 객체여야 합니다.' };
  }

  const b = body as Record<string, unknown>;

  const startX = typeof b.startX === 'number' ? b.startX : null;
  const startY = typeof b.startY === 'number' ? b.startY : null;
  const endX = typeof b.endX === 'number' ? b.endX : null;
  const endY = typeof b.endY === 'number' ? b.endY : null;

  if (startX === null || startY === null || endX === null || endY === null) {
    return { ok: false, error: 'startX, startY, endX, endY(좌표)가 필요합니다.' };
  }

  if (typeof b.targetArrival !== 'string' || !/^\d{1,2}:\d{2}$/.test(b.targetArrival)) {
    return { ok: false, error: 'targetArrival(목표 도착 시각, HH:MM)이 필요합니다.' };
  }

  const departureTime = typeof b.departureTime === 'string' && /^\d{1,2}:\d{2}$/.test(b.departureTime)
    ? b.departureTime
    : undefined;

  const sharedPrepMinutes = typeof b.sharedPrepMinutes === 'number' && b.sharedPrepMinutes >= 0
    ? b.sharedPrepMinutes
    : 5;

  const taxiCallAddOn = typeof b.taxiCallAddOn === 'boolean' ? b.taxiCallAddOn : false;
  const taxiCallAddMinutes = typeof b.taxiCallAddMinutes === 'number' && b.taxiCallAddMinutes >= 0
    ? b.taxiCallAddMinutes
    : 0;

  return {
    ok: true,
    data: {
      startX,
      startY,
      endX,
      endY,
      targetArrival: b.targetArrival,
      departureTime,
      sharedPrepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
    },
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '요청 본문을 JSON으로 읽을 수 없습니다.' },
      { status: 400 },
    );
  }

  const validated = validateRecommendBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const {
    startX,
    startY,
    endX,
    endY,
    targetArrival,
    departureTime,
    sharedPrepMinutes,
    taxiCallAddOn,
    taxiCallAddMinutes,
  } = validated.data;

  // 1) 대중교통 소요시간 (위계 체인)
  const transitResult = await transitChain(startX, startY, endX, endY);

  // 2) 차량(택시) ETA·요금 (현재 기준 위계 체인)
  const taxiParams: NaviDirectionsParams = {
    originLon: startX,
    originLat: startY,
    destLon: endX,
    destLat: endY,
    departureTime: departureTime ? yyyymmddhhmm(departureTime) : undefined,
  };
  const taxiResult = await taxiChain(taxiParams);

  // 2b) 미래 운행 정보: 3개 후보 출발 시각 기준 차량 ETA (P1-6)
  // 첫 2개는 현재 시각 +5분, +10분 기준. 나머지 1개는 앞선 2개 결과를 기반으로
  // 코드가 합리적 추론해 선정한다(여기서는 median-based 추론으로 처리).
  const nowStr = nowHHmm();
  const nowTotal = localToTotal(nowStr);
  const dep5 = totalToLocal(nowTotal + 5);
  const dep10 = totalToLocal(nowTotal + 10);
  const futureDepartures: string[] = [dep5, dep10];
  const futureEta: (number | null)[] = [];
  const futureFare: (number | null)[] = [];

  async function fetchFuture(departureHHmm: string): Promise<{ eta: number | null; fare: number | null }> {
    const params: NaviDirectionsParams = {
      originLon: startX,
      originLat: startY,
      destLon: endX,
      destLat: endY,
      departureTime: yyyymmddhhmm(departureHHmm),
    };
    const res = await naviCarTrip(params);
    if (res.ok && res.data) {
      return { eta: res.data.durationMinutes, fare: res.data.taxiFare };
    }
    // 실패해도 estimate 폴백이 이미 taxiChain에 있으므로, 여기선 estimate로 채우지 않고 null 유지
    return { eta: null, fare: null };
  }

  const f5 = await fetchFuture(dep5);
  const f10 = await fetchFuture(dep10);
  futureEta.push(f5.eta, f10.eta);
  futureFare.push(f5.fare, f10.fare);

  // 3번째 후보: 앞선 2개의 ETA가 둘 다 있으면 그 중앙값을 기준으로,
  // 택시 총 소요(차량+준비)가 목표 도착까지 남은 시간과 비슷하게 되는 출발 시각을 추론
  let dep3 = dep10;
  if (f5.eta != null && f10.eta != null) {
    const medianEta = Math.round((f5.eta + f10.eta) / 2);
    const taxiPrep = Math.round(toMinutes(sharedPrepMinutes) + toMinutes(taxiCallAddOn ? taxiCallAddMinutes : 0));
    const neededTotal = localToTotal(targetArrival) - localToTotal(nowStr) - taxiPrep - medianEta;
    // 필요한 여유가 양수면 지금+여유, 음수면 더 당겨야 함. 범위는 +5~+20분 사이에서 보정
    let candidate = nowTotal + Math.max(5, Math.min(20, Math.round(neededTotal)));
    if (candidate > nowTotal + 25) candidate = nowTotal + 25;
    if (candidate < nowTotal + 5) candidate = nowTotal + 5;
    dep3 = totalToLocal(candidate);
  }
  futureDepartures.push(dep3);
  const f3 = await fetchFuture(dep3);
  futureEta.push(f3.eta);
  futureFare.push(f3.fare);

  // 3) calcCompareOptions로 비교표·결론·행동 계산
  const now = departureTime ?? nowHHmm();
  const input: CalcCompareOptionsInput = {
    nowTime: now,
    targetArrival,
    sharedPrepMinutes,
    taxiCallAddOn,
    taxiCallAddMinutes,
    transit: {
      durationMinutes: transitResult.durationMinutes,
      transfers: transitResult.transfers,
      distanceMeters: transitResult.distanceMeters,
      source: transitResult.source,
      note: transitResult.note,
      isEstimate: transitResult.source === 'estimate',
    },
    taxi: {
      vehicleEtaMinutes: taxiResult.vehicleEtaMinutes,
      taxiFare: taxiResult.taxiFare,
      distanceMeters: taxiResult.distanceMeters,
      source: taxiResult.source,
      note: taxiResult.note,
      isEstimate: taxiResult.source === 'estimate',
    },
    weekday: localDayOfWeek(),
  };

  const calcResult = calcCompareOptions(input);

  if (!calcResult) {
    return NextResponse.json(
      { ok: false, error: '계산 결과를 만들 수 없습니다. 입력값을 확인하세요.' },
      { status: 500 },
    );
  }

  // 4) 날씨 정보: KMA 초단기예보(nx=61, ny=126, 서울)로 강수 여부 확인.
  // 실패해도 추천 핵심 흐름에는 영향 없으므로, 실패 시 weather 생략.
  let weather: { isRaining: boolean; note: string } | undefined;
  try {
    const snap = await kmaUltraShortSnapshot(61, 126);
    if (snap.ok && snap.data) {
      weather = { isRaining: snap.data.isRaining, note: snap.data.note };
    }
  } catch (e) {
    console.error('KMA 날씨 조회 중 예기치 않은 오류:', e);
  }

  return NextResponse.json({
    ok: true,
    result: {
      nowTime: calcResult.nowTime,
      targetArrival: calcResult.targetArrival,
      sharedPrepMinutes: calcResult.sharedPrepMinutes,
      taxiPrepTotalMinutes: calcResult.taxiPrepTotalMinutes,
      transit: calcResult.transit,
      taxi: calcResult.taxi,
      comparison: calcResult.comparison,
      actions: calcResult.actions,
      weather,
      note: calcResult.note,
      taxiFuture: {
        departureTimes: futureDepartures,
        vehicleEtaMinutes: futureEta,
        taxiFare: futureFare,
      },
    },
  });
}
