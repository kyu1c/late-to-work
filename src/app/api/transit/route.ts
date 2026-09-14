// app/api/transit/route.ts
//
// 대중교통 소요시간 조회 (위계 체인).
// PRD 5) 대중교통 소요시간, 9) 호출 한도 관리.

import { NextRequest, NextResponse } from 'next/server';
import { transitChain } from '@/lib/transitChain';

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
  const startX = typeof b.startX === 'number' ? b.startX : null;
  const startY = typeof b.startY === 'number' ? b.startY : null;
  const endX = typeof b.endX === 'number' ? b.endX : null;
  const endY = typeof b.endY === 'number' ? b.endY : null;

  if (startX === null || startY === null || endX === null || endY === null) {
    return NextResponse.json(
      { ok: false, error: 'startX, startY, endX, endY(좌표)가 필요합니다.' },
      { status: 400 },
    );
  }

  const result = await transitChain(startX, startY, endX, endY);

  return NextResponse.json({ ok: true, result });
}
