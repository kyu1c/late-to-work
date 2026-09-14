// app/api/taxi/route.ts
//
// 차량(택시) ETA·요금 조회 (위계 체인).
// PRD 5) 차량(택시) ETA·요금, 9) 호출 한도 관리.

import { NextRequest, NextResponse } from 'next/server';
import { taxiChain } from '@/lib/taxiChain';
import { NaviDirectionsParams } from '@/lib/api/navi';

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

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { ok: false, error: '잘못된 요청입니다.' },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const originLon = typeof b.startX === 'number' ? b.startX : null;
  const originLat = typeof b.startY === 'number' ? b.startY : null;
  const destLon = typeof b.endX === 'number' ? b.endX : null;
  const destLat = typeof b.endY === 'number' ? b.endY : null;
  const originName = typeof b.startName === 'string' ? b.startName : undefined;
  const destName = typeof b.endName === 'string' ? b.endName : undefined;
  const departureTime = typeof b.departureTime === 'string' ? b.departureTime : undefined;

  if (originLon === null || originLat === null || destLon === null || destLat === null) {
    return NextResponse.json(
      { ok: false, error: 'startX, startY, endX, endY(좌표)가 필요합니다.' },
      { status: 400 },
    );
  }

  const params: NaviDirectionsParams = {
    originLon,
    originLat,
    originName,
    destLon,
    destLat,
    destName,
    departureTime,
  };

  const result = await taxiChain(params);

  return NextResponse.json({ ok: true, result });
}
