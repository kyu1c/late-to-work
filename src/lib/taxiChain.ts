// src/lib/taxiChain.ts
//
// 차량(택시) ETA·요금 위계 체인 (Navi → Tmap car → estimate).
// PRD 9) 호출 한도 관리: 각 단계는 fallback 신호 반환, 모두 실패 시 평균/패턴 추정.

import { TaxiResult } from '@/lib/types';
import { naviCarTrip, NaviDirectionsParams } from '@/lib/api/navi';
import { tmapCarTrip } from '@/lib/api/tmap';

export async function taxiChain(params: NaviDirectionsParams): Promise<TaxiResult> {
  const naviRes = await naviCarTrip(params);
  if (naviRes.ok && naviRes.data) {
    return {
      vehicleEtaMinutes: naviRes.data.durationMinutes,
      taxiFare: naviRes.data.taxiFare,
      distanceMeters: naviRes.data.distanceMeters,
      source: 'navi',
      note: naviRes.data.trafficState
        ? `카카오내비 기준(교통: ${naviRes.data.trafficState})`
        : '카카오내비 기준',
    };
  }

  const tmapRes = await tmapCarTrip(
    params.originLon,
    params.originLat,
    params.destLon,
    params.destLat,
  );
  if (tmapRes.ok && tmapRes.data) {
    return {
      vehicleEtaMinutes: tmapRes.data.durationMinutes,
      taxiFare: null,
      distanceMeters: tmapRes.data.distanceMeters,
      source: 'tmap',
      note: tmapRes.data.note,
    };
  }

  return {
    vehicleEtaMinutes: 16,
    taxiFare: null,
    distanceMeters: null,
    source: 'estimate',
    note: '평균/패턴 기반 추정치(택시 기본 가정값)',
  };
}
