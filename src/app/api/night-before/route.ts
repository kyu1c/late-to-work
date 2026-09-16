// app/api/night-before/route.ts
//
// 전날 밤 2개 시간대 추천 (타이트 + 여유).
// PRD 5) P1 5. 전날 밤 2개 시간대 추천 + 선호 교통편 반영.
// 오후 4시 기점으로 재계산 여부 판단. 여기서는 계산만 수행.

import { NextRequest, NextResponse } from 'next/server';
import { calcNightBefore, NightBeforeInput } from '@/lib/calc/calcTrip';
import { NightBeforeResponse } from '@/lib/types';

function validateNightBody(body: unknown): {
  ok: true;
  data: {
    targetArrival: string;
    sharedPrepMinutes: number;
    taxiCallAddOn: boolean;
    taxiCallAddMinutes: number;
    transitDurationMinutes?: number;
    transitTransfers?: number;
    transitDistanceMeters?: number;
    taxiVehicleEtaMinutes?: number;
    taxiFare?: number;
    isRaining: boolean;
    weekday: number;
    preferTransport: 'subway' | 'bus' | 'any';
    preferredTimeA?: string;
    preferredTimeB?: string;
  };
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 객체여야 합니다.' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.targetArrival !== 'string' || !/^\d{1,2}:\d{2}$/.test(b.targetArrival)) {
    return { ok: false, error: 'targetArrival(목표 도착 시각, HH:MM)이 필요합니다.' };
  }

  const sharedPrepMinutes = typeof b.sharedPrepMinutes === 'number' && b.sharedPrepMinutes >= 0
    ? b.sharedPrepMinutes
    : 5;

  const taxiCallAddOn = typeof b.taxiCallAddOn === 'boolean' ? b.taxiCallAddOn : false;
  const taxiCallAddMinutes = typeof b.taxiCallAddMinutes === 'number' && b.taxiCallAddMinutes >= 0
    ? b.taxiCallAddMinutes
    : 0;

  const preferTransport = b.preferTransport === 'subway' || b.preferTransport === 'bus' || b.preferTransport === 'any'
    ? b.preferTransport
    : 'any';

  const isRaining = typeof b.isRaining === 'boolean' ? b.isRaining : false;
  const weekday = typeof b.weekday === 'number' && b.weekday >= 0 && b.weekday <= 6
    ? b.weekday
    : 1;
  const preferTimeA = typeof b.preferredTimeA === 'string' && /^\d{1,2}:\d{2}$/.test(b.preferredTimeA)
    ? b.preferredTimeA
    : undefined;
  const preferTimeB = typeof b.preferredTimeB === 'string' && /^\d{1,2}:\d{2}$/.test(b.preferredTimeB)
    ? b.preferredTimeB
    : undefined;

  return {
    ok: true,
    data: {
      targetArrival: b.targetArrival,
      sharedPrepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
      transitDurationMinutes: typeof b.transitDurationMinutes === 'number' ? b.transitDurationMinutes : undefined,
      transitTransfers: typeof b.transitTransfers === 'number' ? b.transitTransfers : undefined,
      transitDistanceMeters: typeof b.transitDistanceMeters === 'number' ? b.transitDistanceMeters : undefined,
      taxiVehicleEtaMinutes: typeof b.taxiVehicleEtaMinutes === 'number' ? b.taxiVehicleEtaMinutes : undefined,
      taxiFare: typeof b.taxiFare === 'number' ? b.taxiFare : undefined,
      isRaining,
      weekday,
      preferTransport,
      preferredTimeA: preferTimeA,
      preferredTimeB: preferTimeB,
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

  const validated = validateNightBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const result = calcNightBefore(validated.data);

  if (!result) {
    return NextResponse.json(
      { ok: false, error: '전날 밤 추천 계산 결과를 만들 수 없습니다.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
