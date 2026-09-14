// app/api/profile/route.ts
//
// 프로필 저장/로드/초기화 보조(로컬스토리지 동기화용).
// 실제 저장은 클라이언트 localStorage에 하고, 서버는 저장·로딩 엔드포인트를 제공.
// PRD 5) 프로필 입력·저장·수정·재활용, 표 3.

import { NextRequest, NextResponse } from 'next/server';

function validateProfile(body: unknown): { ok: true; profile: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '프로필 본문이 객체여야 합니다.' };
  }

  const p = body as Record<string, unknown>;

  if (typeof p.homeName !== 'string' || p.homeName.trim().length === 0) {
    return { ok: false, error: 'homeName(집 위치 이름)이 필요합니다.' };
  }
  if (typeof p.homeAddress !== 'string' || p.homeAddress.trim().length === 0) {
    return { ok: false, error: 'homeAddress(집 상세 주소)가 필요합니다.' };
  }
  if (typeof p.workName !== 'string' || p.workName.trim().length === 0) {
    return { ok: false, error: 'workName(출근지 이름)이 필요합니다.' };
  }
  if (typeof p.workAddress !== 'string' || p.workAddress.trim().length === 0) {
    return { ok: false, error: 'workAddress(출근지 상세 주소)가 필요합니다.' };
  }
  if (typeof p.targetArrival !== 'string' || !/^\d{1,2}:\d{2}$/.test(p.targetArrival)) {
    return { ok: false, error: 'targetArrival(목표 도착 시각, HH:MM)이 필요합니다.' };
  }
  if (p.preferredTransport !== 'subway' && p.preferredTransport !== 'bus' && p.preferredTransport !== 'any') {
    return { ok: false, error: 'preferredTransport는 subway, bus, any 중 하나여야 합니다.' };
  }
  if (typeof p.prepMinutes !== 'number' || p.prepMinutes < 0) {
    return { ok: false, error: 'prepMinutes(준비 시간)은 0 이상의 숫자여야 합니다.' };
  }
  if (typeof p.taxiCallAddOn !== 'boolean') {
    return { ok: false, error: 'taxiCallAddOn은 boolean이어야 합니다.' };
  }
  if (typeof p.taxiCallAddMinutes !== 'number' || p.taxiCallAddMinutes < 0) {
    return { ok: false, error: 'taxiCallAddMinutes는 0 이상의 숫자여야 합니다.' };
  }

  return { ok: true, profile: p };
}

export async function GET() {
  // 현재는 서버에 프로필 저장소가 없으므로, 클라이언트가 localStorage를 사용하도록
  // 기본 프로필 예시(빈 값 아님, 최소 유효 프로필)를 반환하지는 않고
  // 저장된 프로필이 없다고 응답한다.
  return NextResponse.json({
    ok: true,
    found: false,
    note: '서버에 저장된 프로필이 없습니다. 클라이언트 localStorage를 확인하세요.',
  });
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

  const validated = validateProfile(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 },
    );
  }

  // 현재는 서버에 저장하지 않고, 클라이언트가 localStorage에 저장하도록 성공 응답만 반환.
  return NextResponse.json({
    ok: true,
    saved: true,
    note: '프로필이 저장되었습니다. 클라이언트 localStorage에 반영되었습니다.',
    profile: validated.profile,
  });
}

export async function DELETE() {
  // 프로필 초기화 요청(클라이언트가 localStorage 초기화 후 호출).
  return NextResponse.json({
    ok: true,
    cleared: true,
    note: '프로필이 초기화되었습니다.',
  });
}
