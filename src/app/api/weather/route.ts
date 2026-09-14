// app/api/weather/route.ts
//
// 기상청 초단기실황 기반 강수 여부 조회.
// PRD 5) 날씨·강수 확인, 10) 성공 기준 F.

import { NextRequest, NextResponse } from 'next/server';
import { kmaUltraShortSnapshot } from '@/lib/api/kma';

export async function GET(req: NextRequest) {
  const result = await kmaUltraShortSnapshot(61, 126);

  if (result.ok && result.data) {
    return NextResponse.json({
      ok: true,
      isRaining: result.data.isRaining,
      note: result.data.note,
      source: 'kma',
    });
  }

  return NextResponse.json({
    ok: false,
    isRaining: false,
    note: '날씨 정보 연결 안 됨',
    source: 'none',
    fallback: true,
  });
}
