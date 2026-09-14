// app/api/address-search/route.ts
//
// 주소/장소 검색 → 이름+상세 주소 리스트(좌표 숨김).
// 서버가 카카오맵 REST API(키워드/주소)로 검색 후 클라이언트 선택용 결과만 반환.
// PRD 9) 주소/장소 검색 UX, 표 3 좌표 숨김.

import { NextRequest, NextResponse } from 'next/server';
import { kakaoAddressSearchOutput } from '@/lib/api/kakao';

function validateSearchBody(body: unknown): { ok: true; query: string; preferAddress: boolean } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 객체여야 합니다.' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.query !== 'string' || b.query.trim().length === 0) {
    return { ok: false, error: 'query(검색어)가 필요합니다.' };
  }
  if (b.query.length > 100) {
    return { ok: false, error: 'query는 100자 이내여야 합니다.' };
  }

  const preferAddress = typeof b.preferAddress === 'boolean' ? b.preferAddress : false;

  return { ok: true, query: b.query.trim(), preferAddress };
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

  const validated = validateSearchBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  const { query, preferAddress } = validated;

  const result = await kakaoAddressSearchOutput(query, preferAddress);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, fallback: result.fallback },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    results: result.data?.results ?? [],
    // 각 결과에는 name, address 외 x, y(내부 계산용 좌표)가 있다.
    // UI 목록에는 이름+주소만 표시하고, 프로필 저장/추천 계산 시 좌표를 사용한다.
    source: result.data?.source ?? 'address',
    query,
  });
}
