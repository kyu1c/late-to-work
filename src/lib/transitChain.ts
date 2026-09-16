// src/lib/transitChain.ts
//
// 대중교통 소요시간 위계 체인 (ODsay → 카카오맵 존재확인 → estimate).
// - ODsay를 주력으로 사용 (상세 소요시간·환승·거리 제공).
// - 카카오맵 REST 대중교통은 소요시간을 제공하지 않으므로,
//   ODsay 실패 시 경로 존재 확인 + 카카오맵 길찾기 링크 확보용으로만 사용.
// - Tmap Transit은 일일 호출 한도(10회/일) 및 현재 빈 결과 문제로
//   당면 서비스에선 사용하지 않음(코드상 함수는 유지, 최하단 보류).
// PRD 9) 호출 한도 관리: 각 단계는 fallback 신호 반환, 모두 실패 시 평균/패턴 추정.

import { TransitResult } from '@/lib/types';
import { kakaoTransitTrip } from '@/lib/api/kakao';
import { odsayTransitTrip } from '@/lib/api/odsay';

export async function transitChain(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<TransitResult> {
  // 1) ODsay 대중교통 길찾기 (주력, 상세 수치 제공)
  const odsay = await odsayTransitTrip(startX, startY, '', endX, endY, '');
  if (odsay.ok && odsay.data) {
    return {
      durationMinutes: odsay.data.durationMinutes,
      transfers: odsay.data.transfers,
      distanceMeters: odsay.data.distanceMeters,
      source: 'odsay',
      note: odsay.data.note,
    };
  }

  // ODsay 실패 — 실패 사유를 기록(운영 확인용)
  logTransitFailure('odsay', odsay);

  // 2) ODsay 실패 시 카카오맵 REST 대중교통 존재 확인 + 길찾기 링크 확보
  const kakao = await kakaoTransitTrip(startX, startY, endX, endY);
  if (kakao.ok && kakao.data?.exists) {
    return {
      durationMinutes: null,
      transfers: null,
      distanceMeters: null,
      source: 'kakao',
      note: '카카오맵 대중교통 경로 확인됨 (소요시간·환승·거리는 ODsay 확인 필요)',
      raw: kakao.data,
    };
  }

  // 카카오맵 실패 — 실패 사유를 기록(운영 확인용)
  logTransitFailure('kakao', kakao);

  // 3) 모두 실패 → 실시간 정보 없음 (추정치 금지)
  return {
    durationMinutes: null,
    transfers: null,
    distanceMeters: null,
    source: 'none',
    note: '실시간 대중교통 정보를 가져올 수 없습니다.',
  };
}

function logTransitFailure(step: 'odsay' | 'kakao', result: { ok: boolean; error?: string; fallback?: boolean }) {
  if (result.ok) return;
  // 운영 확인용 기록: 브라우저 콘솔에 남기되, 민감 정보(키 값 등)는 포함하지 않음
  console.warn(`[transitChain] ${step} 단계 실패: ${result.error ?? '알 수 없는 실패'} (fallback=${result.fallback})`);
}
