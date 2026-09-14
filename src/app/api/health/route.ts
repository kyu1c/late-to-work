// app/api/health/route.ts
//
// 서비스 키 연결 상태 요약(값은 포함하지 않음) + 기본 동작 확인용 헬스체크.
// 시크릿 창 테스트 / 디버깅용.

import { NextResponse } from 'next/server';
import { envSummary } from '@/lib/config';

export async function GET() {
  const keys = envSummary();

  return NextResponse.json({
    ok: true,
    keys,
    note: '값은 포함하지 않습니다. 키 존재 여부만 표시합니다.',
  });
}
