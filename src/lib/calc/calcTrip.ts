// src/lib/calc/calcTrip.ts

/**
 * late-to-work 시간 계산 로직.
 * calc_trip.py의 핵심 함수를 TypeScript로 옮기고,
 * PRD에서 정한 준비 시간 구조(공통 준비 + 택시 호출 추가 on/off)를 반영한다.
 *
 * 원칙:
 * - HH:MM 문자열을 기준으로 계산하며, 경계(24시간)를 넘어가는 구간은 정규화한다.
 * - 도착/출발 시각 차이는 '도착 기준'으로 계산한다.
 * - 추정값/원본값 구분을 명시적으로 남긴다.
 */

import {
  RecommendRequest,
  RecommendResponse,
  NightBeforeResponse,
  TransitResult,
} from '../types';

// ---------------------------------------------------------------------------
// 시간 파싱/포맷
// ---------------------------------------------------------------------------

const HHMM_RE = /^\s*(\d{1,2}):(\d{2})\s*$/;

export interface ParsedTime {
  hours: number;
  minutes: number;
}

/**
 * HH:MM 문자열을 파싱한다.
 * HH는 0~23, MM은 0~59 범위면 정상으로 본다.
 * 범위를 벗어난 경우 실패를 반환한다.
 */
export function parseTime(s: string): ParsedTime | null {
  const m = s.match(HHMM_RE);
  if (!m) return null;

  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

/**
 * ParsedTime을 HH:MM 문자열로 반환한다.
 * 자정을 넘어가는 계산 결과도 HH:MM으로 표현한다 (초를 무시한 분 단위 기준).
 */
export function formatTime(parsed: ParsedTime): string {
  const totalMinutes = parsed.hours * 60 + parsed.minutes;
  const normalized = totalMinutes % (24 * 60);
  const h = Math.floor(normalized / 60) % 24;
  const m = normalized % 60;
  return `${pad(h)}:${pad(m)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 분 단위 차이를 HH:MM로 환산한다.
 */
export function minutesToTime(minutes: number): string {
  const totalMinutes = Math.round(minutes) % (24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${pad(h)}:${pad(m)}`;
}

// ---------------------------------------------------------------------------
// calc_trip.py 포트: 핵심 5함수
// ---------------------------------------------------------------------------

/**
 * calc_trip.py: parse_time
 * HH:MM 문자열을 파싱한다.
 */
export function parseTimePy(s: string): ParsedTime | null {
  return parseTime(s);
}

/**
 * calc_trip.py: format_time
 * datetime을 HH:MM 문자열로 반환한다.
 */
export function formatTimePy(parsed: ParsedTime): string {
  return formatTime(parsed);
}

/**
 * calc_trip.py: calc_backwards
 * 목표 도착 시각에서 출발 시각을 역산한다.
 *
 * travel_minutes: 이동 시간(분, 대기·도보 포함 가능)
 * prep_minutes: 준비 시간(분) — PRD에서는 공통 준비 시간 + 택시 호출 추가를 분리하므로,
 *   이 함수의 prep_minutes에는 공통 준비 시간만 넣는다.
 * buffer_minutes: 여유분(분)
 */
export function calcBackwards(
  arrivalTime: string,
  travelMinutes: number,
  prepMinutes = 0,
  bufferMinutes = 0,
): string | null {
  const arr = parseTime(arrivalTime);
  if (!arr) return null;

  const travel = toMinutes(travelMinutes);
  const prep = toMinutes(prepMinutes);
  const buffer = toMinutes(bufferMinutes);

  const departureTotalMinutes = arrToTotalMinutes(arr) - travel - prep - buffer;
  const departure = minutesToParsed(departureTotalMinutes);
  return formatTime(departure);
}

/**
 * calc_trip.py: calc_taxi_arrival
 * 현재 시각에서 택시 도착 예정 시각을 계산한다.
 *
 * vehicle_eta_minutes: 차량 이동 예상 시간(분, 출근길 정체 반영 가능)
 * call_pickup_minutes: 호출 대기·준비 시간(분). 기본값 5분.
 *
 * PRD에서는 이 call_pickup_minutes 대신 공통 준비 시간과 택시 호출 추가 시간을 분리하므로,
 * 이 함수는 보조 계산용으로만 사용하고, 실제 비교는 calcCompareOptions에서 수행한다.
 */
export function calcTaxiArrival(
  nowTime: string,
  vehicleEtaMinutes: number,
  callPickupMinutes = 5,
): string | null {
  const now = parseTime(nowTime);
  if (!now) return null;

  const vehicleEta = toMinutes(vehicleEtaMinutes);
  const callPickup = toMinutes(callPickupMinutes);

  const arriveTotalMinutes = arrToTotalMinutes(now) + vehicleEta + callPickup;
  const arrive = minutesToParsed(arriveTotalMinutes);
  return formatTime(arrive);
}

/**
 * calc_trip.py: compare_by_arrival
 * 두 안의 도착 시각 차이를 계산한다.
 *
 * public_arrival: 대중교통 예상 도착 시각 (HH:MM)
 * taxi_arrival: 택시 예상 도착 시각 (HH:MM, 준비시간 포함)
 */
export function compareByArrival(
  publicArrival: string,
  taxiArrival: string,
): {
  diffMinutes: number;
  faster: 'public' | 'taxi' | 'same';
  statement: string;
} | null {
  const pub = parseTime(publicArrival);
  const taxi = parseTime(taxiArrival);
  if (!pub || !taxi) return null;

  const pubMinutes = arrToTotalMinutes(pub);
  const taxiMinutes = arrToTotalMinutes(taxi);
  const diffMinutes = pubMinutes - taxiMinutes;

  let faster: 'public' | 'taxi' | 'same';
  let statement: string;

  if (diffMinutes > 0) {
    faster = 'taxi';
    statement = `택시가 약 ${Math.round(diffMinutes)}분 더 빠릅니다.`;
  } else if (diffMinutes < 0) {
    faster = 'public';
    statement = `대중교통이 약 ${Math.round(-diffMinutes)}분 더 빠릅니다.`;
  } else {
    faster = 'same';
    statement = '도착 시각 차이가 거의 없습니다.';
  }

  return {
    diffMinutes: Math.round(diffMinutes * 10) / 10,
    faster,
    statement,
  };
}

/**
 * calc_trip.py: is_late_relative
 * 실제 출발 시각이 전날 밤 제안한 출발 시각보다 늦었는지 판단한다.
 */
export function isLateRelative(proposedDeparture: string, actualDeparture: string): boolean | null {
  const prop = parseTime(proposedDeparture);
  const actual = parseTime(actualDeparture);
  if (!prop || !actual) return null;

  const propTotal = arrToTotalMinutes(prop);
  const actualTotal = arrToTotalMinutes(actual);
  return actualTotal > propTotal;
}

/**
 * calc_trip.py: choose_fastest
 * 여러 교통안 중 '도착 시각 기준 가장 빠른 안'을 고른다.
 */
export interface FastestOption {
  arrivalTime: string;
  kind: string;
  note: string;
}

export function chooseFastest(
  options: FastestOption[],
  preferDoorTime = true,
): { fastest: FastestOption; sortedByArrival: FastestOption[] } | null {
  if (options.length === 0) return null;

  const parsed = options.map((o) => {
    const p = parseTime(o.arrivalTime);
    return p ? { parsed: arrToTotalMinutes(p), option: o } : null;
  }).filter((p): p is { parsed: number; option: FastestOption } => p !== null);

  if (parsed.length === 0) return null;

  parsed.sort((a, b) => a.parsed - b.parsed);

  return {
    fastest: parsed[0].option,
    sortedByArrival: parsed.map((p) => p.option),
  };
}

// ---------------------------------------------------------------------------
// PRD 통합 계산: calcCompareOptions
// ---------------------------------------------------------------------------

/**
 * calc_trip.py 기반 계산 결과를 PRD의 준비 시간 구조에 맞춰 통합한다.
 *
 * PRD 준비 시간 구조:
 * - 공통 준비 시간(prepMinutes): 개인 준비 + 택시 호출 대기를 함께 고려한 초기 추정치 (기본 5분)
 * - 택시 호출 시간 추가(taxiCallAddOn + taxiCallAddMinutes): on이면 공통 준비에 추가 합산, off이면 공통 준비만 반영
 * - 대중교통도 공통 준비 시간 반영. 호출 대기는 없음.
 *
 * calcCompareOptions는 이 구조를 반영해 비교표·결론·행동·마지막 출발 시각 역산을 계산한다.
 *
 * 주의:
 * - transitDurationMinutes 등은 서버 API에서 이미 계산된 값을 넣는다.
 * - '추정'으로 계산한 값이면 그 사실을 isEstimate 플래그로 남긴다.
 */
export interface CalcCompareOptionsInput {
  nowTime: string; // 서버 시각 (HH:MM)
  targetArrival: string; // HH:MM
  sharedPrepMinutes: number; // 공통 준비 시간
  taxiCallAddOn: boolean;
  taxiCallAddMinutes: number;

  transit: {
    durationMinutes: number | null;
    transfers: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
    isEstimate?: boolean;
  };

  taxi: {
    vehicleEtaMinutes: number | null;
    taxiFare: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
    isEstimate?: boolean;
  };

  /** 호출 시각의 요일 (0=일요일, 1=월요일, ..., 6=토요일). 전날 밤 추천 평일/주말 판단에 사용. */
  weekday: number;
}

export interface CalcCompareOptionsOutput {
  nowTime: string;
  targetArrival: string;
  sharedPrepMinutes: number;
  taxiPrepTotalMinutes: number;
  transit: {
    durationMinutes: number | null;
    transfers: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
    isEstimate: boolean;
  };
  taxi: {
    vehicleEtaMinutes: number | null;
    taxiFare: number | null;
    distanceMeters: number | null;
    source: string;
    note: string;
    isEstimate: boolean;
  };
  comparison: {
    departureTimeUsed: string;
    public: {
      departureTime: string;
      totalMinutes: number;
      arrivalTime: string;
      transitMinutes: number;
      prepMinutes: number;
    };
    taxi: {
      departureTime: string;
      totalMinutes: number;
      arrivalTime: string;
      vehicleEtaMinutes: number;
      prepMinutes: number;
    };
    latest: {
      public: {
        latestDeparture: string;
        minutesUntilMustLeave: number;
      };
      taxi: {
        latestDeparture: string;
        minutesUntilMustLeave: number;
      };
    };
    faster: 'public' | 'taxi' | 'same';
    fasterMinutes: number;
    statement: string;
  };
  actions: string[];
  note: string;
}

export function calcCompareOptions(input: CalcCompareOptionsInput): CalcCompareOptionsOutput | null {
  const now = parseTime(input.nowTime);
  const target = parseTime(input.targetArrival);
  if (!now || !target) {
    return null;
  }

  const sharedPrep = toMinutes(input.sharedPrepMinutes);
  const taxiCallAdd = toMinutes(input.taxiCallAddOn ? input.taxiCallAddMinutes : 0);
  const taxiPrepTotal = sharedPrep + taxiCallAdd;

  const nowTotal = arrToTotalMinutes(now);
  const targetTotal = arrToTotalMinutes(target);

  // 대중교통
  const transitMinutes = input.transit.durationMinutes != null ? toMinutes(input.transit.durationMinutes) : null;
  const transitTransfers = input.transit.transfers;
  const transitDistance = input.transit.distanceMeters;

  // 택시
  const vehicleEta = input.taxi.vehicleEtaMinutes != null ? toMinutes(input.taxi.vehicleEtaMinutes) : null;

  // 공통: 출발 기준 시각은 서버 시각(now)로 한다.
  const departureTimeUsed = formatTime(now);

  // 대중교통 계산
  let publicDeparture: ParsedTime;
  let publicTotalMinutes: number;
  let publicTransitMinutes: number;
  let publicPrepMinutes: number;

  if (transitMinutes != null) {
    publicTransitMinutes = transitMinutes;
    publicDeparture = minutesToParsed(nowTotal);
    publicTotalMinutes = transitMinutes + sharedPrep;
    publicPrepMinutes = sharedPrep;
  } else {
    // 대중교통 실시간 정보 없음 → 계산 없이 downstream에 null 전달
    publicTransitMinutes = 0;
    publicDeparture = minutesToParsed(nowTotal);
    publicTotalMinutes = sharedPrep;
    publicPrepMinutes = sharedPrep;
  }

  publicDeparture = {
    hours: publicDeparture.hours,
    minutes: publicDeparture.minutes,
  };
  const publicArrival = minutesToParsed(nowTotal + publicTotalMinutes);
  const publicArrivalTime = formatTime(publicArrival);

  // 택시 계산
  let taxiDeparture: ParsedTime;
  let taxiTotalMinutes: number;
  let taxiVehicleEtaMinutes: number;
  let taxiPrepMinutes: number;

  if (vehicleEta != null) {
    taxiVehicleEtaMinutes = vehicleEta;
    taxiDeparture = minutesToParsed(nowTotal);
    taxiTotalMinutes = vehicleEta + taxiPrepTotal;
    taxiPrepMinutes = taxiPrepTotal;
  } else {
    // 택시 실시간 정보 없음 → 계산 없이 downstream에 null 전달
    taxiVehicleEtaMinutes = 0;
    taxiDeparture = minutesToParsed(nowTotal);
    taxiTotalMinutes = taxiPrepTotal;
    taxiPrepMinutes = taxiPrepTotal;
  }

  const taxiArrival = minutesToParsed(nowTotal + taxiTotalMinutes);
  const taxiArrivalTime = formatTime(taxiArrival);

  // 가장 빠른 안 비교
  const cmp = compareByArrival(publicArrivalTime, taxiArrivalTime);
  if (!cmp) {
    return null;
  }

  // 대중교통 '늦지 않는 마지막 출발 시각' 역산
  const publicMustLeaveMinutes = targetTotal - publicTotalMinutes;
  const publicLatestDeparture = minutesToParsed(publicMustLeaveMinutes);
  const publicMinutesUntilMustLeave = publicMustLeaveMinutes - nowTotal;

  // 택시 '늦지 않는 마지막 출발 시각' 역산
  const taxiMustLeaveMinutes = targetTotal - taxiTotalMinutes;
  const taxiLatestDeparture = minutesToParsed(taxiMustLeaveMinutes);
  const taxiMinutesUntilMustLeave = taxiMustLeaveMinutes - nowTotal;

  // 행동 문구
  const actions = buildActions(
    cmp.faster,
    cmp.diffMinutes,
    input.taxi.taxiFare,
    publicMinutesUntilMustLeave,
    taxiMinutesUntilMustLeave,
    input.targetArrival,
    input.weekday,
    input.transit.transfers,
    input.transit.distanceMeters,
    input.taxi.distanceMeters,
  );

  // 참고 문구
  const note = buildNote(
    cmp.faster,
    cmp.diffMinutes,
    input.transit.source,
    input.taxi.source,
    input.transit.isEstimate ?? false,
    input.taxi.isEstimate ?? false,
    input.sharedPrepMinutes,
    input.taxiCallAddOn,
    input.taxiCallAddMinutes,
  );

  return {
    nowTime: formatTime(now),
    targetArrival: formatTime(target),
    sharedPrepMinutes: input.sharedPrepMinutes,
    taxiPrepTotalMinutes: Math.round(taxiPrepTotal),
    transit: {
      durationMinutes: transitMinutes != null ? Math.round(transitMinutes) : null,
      transfers: transitTransfers,
      distanceMeters: transitDistance,
      source: input.transit.source,
      note: input.transit.note,
      isEstimate: input.transit.isEstimate ?? false,
    },
    taxi: {
      vehicleEtaMinutes: vehicleEta != null ? Math.round(vehicleEta) : null,
      taxiFare: input.taxi.taxiFare,
      distanceMeters: input.taxi.distanceMeters,
      source: input.taxi.source,
      note: input.taxi.note,
      isEstimate: input.taxi.isEstimate ?? false,
    },
    comparison: {
      departureTimeUsed,
      public: {
        departureTime: formatTime(publicDeparture),
        totalMinutes: Math.round(publicTotalMinutes),
        arrivalTime: publicArrivalTime,
        transitMinutes: Math.round(publicTransitMinutes),
        prepMinutes: Math.round(publicPrepMinutes),
      },
      taxi: {
        departureTime: formatTime(taxiDeparture),
        totalMinutes: Math.round(taxiTotalMinutes),
        arrivalTime: taxiArrivalTime,
        vehicleEtaMinutes: Math.round(taxiVehicleEtaMinutes),
        prepMinutes: Math.round(taxiPrepMinutes),
      },
      latest: {
        public: {
          latestDeparture: formatTime(publicLatestDeparture),
          minutesUntilMustLeave: Math.round(publicMinutesUntilMustLeave),
        },
        taxi: {
          latestDeparture: formatTime(taxiLatestDeparture),
          minutesUntilMustLeave: Math.round(taxiMinutesUntilMustLeave),
        },
      },
      faster: cmp.faster,
      fasterMinutes: Math.round(cmp.diffMinutes),
      statement: cmp.statement,
    },
    actions,
    note,
  };
}

// ---------------------------------------------------------------------------
// 행동 문구 생성 (PRD 기반)
// ---------------------------------------------------------------------------

function buildActions(
  faster: 'public' | 'taxi' | 'same',
  fasterMinutes: number,
  taxiFare: number | null,
  publicMinutesUntilMustLeave: number,
  taxiMinutesUntilMustLeave: number,
  targetArrival: string,
  weekday: number,
  transitTransfers: number | null,
  transitDistanceMeters: number | null,
  taxiDistanceMeters: number | null,
): string[] {
  const actions: string[] = [];

  actions.push(
    `지금 출발 기준 ${formatComparison(faster, fasterMinutes)}`,
  );

  // 지금 출발해도 되는지 여부 안내
  if (publicMinutesUntilMustLeave > 0) {
    actions.push(
      `대중교통 이용 시 약 ${publicMinutesUntilMustLeave}분 여유가 있어요. 조금만 늦게 출발해도 괜찮아요.`,
    );
  } else if (publicMinutesUntilMustLeave <= 0) {
    actions.push(
      `대중교통 이용 시 지금 바로 출발해야 해요. ${formatMinutesUntilNow(publicMinutesUntilMustLeave)} 출발이 필요해요.`,
    );
  }

  if (taxiMinutesUntilMustLeave > 0) {
    actions.push(
      `택시 이용 시 약 ${taxiMinutesUntilMustLeave}분 여유가 있어요. 준비 시간을 고려해 출발하면 돼요.`,
    );
  } else if (taxiMinutesUntilMustLeave <= 0) {
    actions.push(
      `택시 이용 시 지금 바로 출발해야 해요. ${formatMinutesUntilNow(taxiMinutesUntilMustLeave)} 출발이 필요해요.`,
    );
  }

  if (faster === 'taxi' && taxiFare != null) {
    actions.push(
      `택시가 약 ${Math.abs(fasterMinutes)}분 더 빠르고, 예상 택시 요금은 약 ${formatMoney(taxiFare)}원 정도예요.`,
    );
  }

  if (faster === 'public' || faster === 'same') {
    actions.push(
      `급하지 않으면 익숙한 대중교통으로 가는 것도 좋아요.`,
    );
  }

  // 대중교통 환승·도보 정보
  if (transitTransfers != null && transitTransfers > 0) {
    actions.push(
      `대중교통은 환승 약 ${transitTransfers}회 정도 포함돼요.`,
    );
  }

  // 거리 정보
  if (transitDistanceMeters != null && taxiDistanceMeters != null) {
    const transitKm = formatKm(transitDistanceMeters);
    const taxiKm = formatKm(taxiDistanceMeters);
    actions.push(
      `대중교통 기준 거리는 약 ${transitKm}, 택시 기준 거리는 약 ${taxiKm} 정도예요.`,
    );
  }

  // 출근 시간 안내
  actions.push(
    `목표 도착 시각은 ${targetArrival}이에요. 이 시간까지 도착하는 게 목표예요.`,
  );

  // 평일/주말 안내
  if (weekday === 0 || weekday === 6) {
    actions.push(
      `오늘은 주말이에요. 평소와 시간대가 다를 수 있으니 참고해주세요.`,
    );
  }

  return actions.slice(0, 5); // 최대 5개
}

function formatComparison(faster: 'public' | 'taxi' | 'same', minutes: number): string {
  if (faster === 'same') {
    return '도착 시각 차이가 거의 없어요.';
  }
  if (faster === 'taxi') {
    if (minutes === 0) {
      return '택시가 약 0분 더 빠릅니다.';
    }
    return `택시가 약 ${minutes}분 더 빨라요.`;
  }
  if (minutes === 0) {
    return '대중교통이 약 0분 더 빠릅니다.';
  }
  return `대중교통이 약 ${minutes}분 더 빨라요.`;
}

function formatMinutesUntilNow(minutesUntil: number): string {
  if (minutesUntil <= 0) {
    return '지금';
  }
  return `${Math.round(-minutesUntil)}분 후`;
}

function formatMoney(won: number): string {
  return won.toLocaleString('ko-KR');
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km < 1) {
    return `${meters.toFixed(0)}m`;
  }
  return `${km.toFixed(1)}km`;
}

// ---------------------------------------------------------------------------
// 참고 문구 생성 (PRD 기반)
// ---------------------------------------------------------------------------

function buildNote(
  faster: 'public' | 'taxi' | 'same',
  fasterMinutes: number,
  transitSource: string,
  taxiSource: string,
  transitIsEstimate: boolean,
  taxiIsEstimate: boolean,
  sharedPrepMinutes: number,
  taxiCallAddOn: boolean,
  taxiCallAddMinutes: number,
): string {
  const parts: string[] = [];

  // 비교 요약
  if (faster === 'same') {
    parts.push(`지금 출발 기준 도착 시각 차이가 거의 없어요.`);
  } else if (faster === 'taxi') {
    parts.push(`지금 출발 기준 택시가 약 ${Math.abs(fasterMinutes)}분 더 빨라요.`);
  } else {
    parts.push(`지금 출발 기준 대중교통이 약 ${Math.abs(fasterMinutes)}분 더 빨라요.`);
  }

  // 출처 표시
  if (transitSource === 'estimate' && transitIsEstimate) {
    parts.push(`대중교통 정보는 현재 실시간 연결이 안 돼서 평균/패턴 기반 추정치로 계산했어요.`);
  }
  if (taxiSource === 'estimate' && taxiIsEstimate) {
    parts.push(`택시 정보는 현재 실시간 연결이 안 돼서 평균/패턴 기반 추정치로 계산했어요.`);
  }

  // 준비 시간 안내
  if (taxiCallAddOn) {
    parts.push(
      `택시 준비 시간으로는 공통 준비 ${sharedPrepMinutes}분 + 택시 호출 추가 ${taxiCallAddMinutes}분을 더해서 계산했어요. 호출 대기 중 개인 준비가 일부 겹칠 수 있어요.`,
    );
  } else {
    parts.push(
      `택시 준비 시간으로는 공통 준비 ${sharedPrepMinutes}분을 기준으로 계산했어요.`,
    );
  }

  // 불확실성 안내
  if (transitIsEstimate || taxiIsEstimate) {
    parts.push(
      `실시간 교통 정보가 연결돼 있지 않아서, 현재 기준 평균/패턴으로 추정한 시간이에요. 실제로는 교통 여건에 따라 달라질 수 있어요.`,
    );
  }

  // 판단 위임
  parts.push(`최종 판단은 직접 해주세요. 필요하면 택시 앱 연결도 도와드릴게요.`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// 전날 밤 추천 (calc_trip.py 기반)
// ---------------------------------------------------------------------------

export interface NightBeforeInput {
  targetArrival: string; // HH:MM
  sharedPrepMinutes: number;
  taxiCallAddOn: boolean;
  taxiCallAddMinutes: number;
  transitDurationMinutes?: number; // 사용자 기준값(있으면 우선 사용)
  transitTransfers?: number;
  transitDistanceMeters?: number;
  taxiVehicleEtaMinutes?: number; // 사용자 기준값(있으면 우선 사용)
  taxiFare?: number;
  isRaining: boolean;
  weekday: number;
  preferTransport: 'subway' | 'bus' | 'any';
  /** 전날 밤 선호 출발 시각 A(타이틀). 있으면 타이트/여유 대신 우선 후보로 사용한다. */
  preferredTimeA?: string;
  /** 전날 밤 선호 출발 시각 B(여유). 있으면 함께 사용한다. */
  preferredTimeB?: string;
}

export interface NightBeforeOutput {
  targetArrival: string;
  isRaining: boolean;
  tight: {
    departureTime: string;
    transportNote: string;
    arrivalNote: string;
  };
  loose: {
    departureTime: string;
    transportNote: string;
    arrivalNote: string;
  };
  note: string;
}

export function calcNightBefore(input: NightBeforeInput): NightBeforeOutput | null {
  const target = parseTime(input.targetArrival);
  if (!target) return null;

  const targetTotal = arrToTotalMinutes(target);

  // 대중교통 소요시간: 사용자 기준값 우선, 없으면 null (집에서 미리 입력해둔 값이 있을 때만 사용)
  const transitMinutes =
    input.transitDurationMinutes != null
      ? toMinutes(input.transitDurationMinutes)
      : null;

  // 택시 소요시간: 사용자 기준값 우선, 없으면 null
  const vehicleEta =
    input.taxiVehicleEtaMinutes != null
      ? toMinutes(input.taxiVehicleEtaMinutes)
      : null;

  const sharedPrep = toMinutes(input.sharedPrepMinutes);
  const taxiCallAdd = toMinutes(input.taxiCallAddOn ? input.taxiCallAddMinutes : 0);
  const taxiPrepTotal = sharedPrep + taxiCallAdd;

  // 선호 시간대 A/B가 있으면 그걸 출발 시각 후보로 우선 사용한다.
  // 없으면 기존 타이트/여유(15~25분 차이)로 계산한다.
  const usePreferred = input.preferredTimeA != null;

  // 전날 밤 추천은 사용자가 미리 입력해둔 이동시간 기준값이 있을 때만 계산한다.
  // 둘 중 하나라도 없으면 계산이 성립하지 않으므로 여기서 종료한다.
  if (transitMinutes == null) return null;
  if (vehicleEta == null) return null;

  let tightDepartureTime: string;
  let looseDepartureTime: string;
  let tightPublicArrivalTime: string;
  let tightTaxiArrivalTime: string;
  let loosePublicArrivalTime: string;
  let looseTaxiArrivalTime: string;

  if (usePreferred) {
    const tightA = input.preferredTimeA!;
    const tightParsed = parseTime(tightA);
    if (!tightParsed) return null;
    tightDepartureTime = tightA;

    // 타이트 기준 도착 시각 계산 (대중교통)
    const tightTransitTotal = transitMinutes + sharedPrep;
    const tightPublicArrival = minutesToParsed(arrToTotalMinutes(tightParsed) + tightTransitTotal);
    tightPublicArrivalTime = formatTime(tightPublicArrival);

    // 타이트 기준 택시 도착 시각
    const tightTaxiTotal = vehicleEta + taxiPrepTotal;
    const tightTaxiArrival = minutesToParsed(arrToTotalMinutes(tightParsed) + tightTaxiTotal);
    tightTaxiArrivalTime = formatTime(tightTaxiArrival);

    if (input.preferredTimeB != null) {
      const looseB = input.preferredTimeB!;
      const looseParsed = parseTime(looseB);
      if (!looseParsed) return null;
      looseDepartureTime = looseB;

      const looseTransitTotal = transitMinutes + sharedPrep;
      const loosePublicArrival = minutesToParsed(arrToTotalMinutes(looseParsed) + looseTransitTotal);
      loosePublicArrivalTime = formatTime(loosePublicArrival);

      const looseTaxiTotal = vehicleEta + taxiPrepTotal;
      const looseTaxiArrival = minutesToParsed(arrToTotalMinutes(looseParsed) + looseTaxiTotal);
      looseTaxiArrivalTime = formatTime(looseTaxiArrival);
    } else {
      // B만 없으면 타이트에서 buffer만큼 뒤로 밀어서 여유안 생성
      const bufferMinutes = 20;
      const looseParsed = minutesToParsed(arrToTotalMinutes(tightParsed) - bufferMinutes);
      looseDepartureTime = formatTime(looseParsed);

      const looseTransitTotal = transitMinutes + sharedPrep;
      const loosePublicArrival = minutesToParsed(arrToTotalMinutes(looseParsed) + looseTransitTotal);
      loosePublicArrivalTime = formatTime(loosePublicArrival);

      const looseTaxiTotal = vehicleEta + taxiPrepTotal;
      const looseTaxiArrival = minutesToParsed(arrToTotalMinutes(looseParsed) + looseTaxiTotal);
      looseTaxiArrivalTime = formatTime(looseTaxiArrival);
    }
  } else {
    // 기존 방식: 타이트 + 여유(20분 차이)
    const tightTravelMinutes = transitMinutes + sharedPrep;
    const tightDeparture = minutesToParsed(targetTotal - tightTravelMinutes);
    tightDepartureTime = formatTime(tightDeparture);

    const tightTaxiTotal = vehicleEta + taxiPrepTotal;
    const tightTaxiArrival = minutesToParsed(targetTotal - tightTaxiTotal);
    tightTaxiArrivalTime = formatTime(tightTaxiArrival);

    const bufferMinutes = 20;
    const looseTravelMinutes = transitMinutes + sharedPrep + bufferMinutes;
    const looseDeparture = minutesToParsed(targetTotal - looseTravelMinutes);
    looseDepartureTime = formatTime(looseDeparture);

    const looseTaxiTotal = vehicleEta + taxiPrepTotal;
    const looseTaxiArrival = minutesToParsed(targetTotal - looseTaxiTotal);
    looseTaxiArrivalTime = formatTime(looseTaxiArrival);

    const tightPublicArrival = minutesToParsed(targetTotal - tightTravelMinutes + transitMinutes + sharedPrep);
    tightPublicArrivalTime = formatTime(tightPublicArrival);

    const loosePublicArrival = minutesToParsed(targetTotal - looseTravelMinutes + transitMinutes + sharedPrep);
    loosePublicArrivalTime = formatTime(loosePublicArrival);
  }

  // 참고 문구
  const tightTransportNote = buildNightTransportNote(
    input.preferTransport,
    transitMinutes,
    sharedPrep,
    input.transitTransfers,
    input.taxiCallAddOn,
    input.taxiCallAddMinutes,
    vehicleEta,
    taxiPrepTotal,
  );

  const tightArrivalNote = buildNightArrivalNote(
    tightPublicArrivalTime,
    tightTaxiArrivalTime,
    tightDepartureTime,
    input.isRaining,
  );

  const looseTransportNote = buildNightTransportNote(
    input.preferTransport,
    transitMinutes,
    sharedPrep,
    input.transitTransfers,
    input.taxiCallAddOn,
    input.taxiCallAddMinutes,
    vehicleEta,
    taxiPrepTotal,
  );

  const looseArrivalNote = buildNightArrivalNote(
    loosePublicArrivalTime,
    looseTaxiArrivalTime,
    looseDepartureTime,
    input.isRaining,
  );

  // 선호 시간대 사용 여부 표기
  const note = buildNightNote(
    input.targetArrival,
    tightDepartureTime,
    looseDepartureTime,
    input.isRaining,
    input.weekday,
    usePreferred,
    input.preferredTimeA,
    input.preferredTimeB,
  );

  return {
    targetArrival: formatTime(target),
    isRaining: input.isRaining,
    tight: {
      departureTime: tightDepartureTime,
      transportNote: tightTransportNote,
      arrivalNote: tightArrivalNote,
    },
    loose: {
      departureTime: looseDepartureTime,
      transportNote: looseTransportNote,
      arrivalNote: looseArrivalNote,
    },
    note,
  };
}

function buildNightTransportNote(
  preferTransport: 'subway' | 'bus' | 'any',
  transitMinutes: number,
  sharedPrep: number,
  transitTransfers: number | undefined,
  taxiCallAddOn: boolean,
  taxiCallAddMinutes: number,
  vehicleEta: number,
  taxiPrepTotal: number,
): string {
  const parts: string[] = [];

  if (preferTransport === 'subway') {
    parts.push(`지하철 위주로 보면 이동 약 ${transitMinutes}분 + 준비 ${sharedPrep}분 정도예요.`);
  } else if (preferTransport === 'bus') {
    parts.push(`버스 위주로 보면 이동 약 ${transitMinutes}분 + 준비 ${sharedPrep}분 정도예요.`);
  } else {
    parts.push(`대중교통 기준으로 보면 이동 약 ${transitMinutes}분 + 준비 ${sharedPrep}분 정도예요.`);
  }

  if (transitTransfers != null && transitTransfers > 0) {
    parts.push(`환승은 약 ${transitTransfers}회 정도 포함돼요.`);
  }

  if (taxiCallAddOn) {
    parts.push(
      `택시 기준으로 보면 차량 약 ${vehicleEta}분 + 준비 ${taxiPrepTotal}분(호출 추가 ${taxiCallAddMinutes}분 포함) 정도예요. 호출 대기 중 개인 준비가 일부 겹칠 수 있어요.`,
    );
  } else {
    parts.push(
      `택시 기준으로 보면 차량 약 ${vehicleEta}분 + 준비 ${taxiPrepTotal}분 정도예요.`,
    );
  }

  return parts.join(' ');
}

function buildNightArrivalNote(
  publicArrivalTime: string,
  taxiArrivalTime: string,
  departureTime: string,
  isRaining: boolean,
): string {
  const parts: string[] = [];

  parts.push(`이 시각에 출발하면 대중교통 도착은 약 ${publicArrivalTime}, 택시 도착은 약 ${taxiArrivalTime} 정도예요.`);

  if (isRaining) {
    parts.push(`오늘 아침에 비가 올 수 있어서 우산을 챙기시는 게 좋아요.`);
  } else {
    parts.push(`오늘 아침 비 걱정은 크지 않아요.`);
  }

  parts.push(`출발 시각은 ${departureTime}이에요.`);

  return parts.join(' ');
}

function buildNightNote(
  targetArrival: string,
  tightDepartureTime: string,
  looseDepartureTime: string,
  isRaining: boolean,
  weekday: number,
  usePreferred: boolean,
  preferredTimeA?: string,
  preferredTimeB?: string,
): string {
  const parts: string[] = [];

  parts.push(`내일 ${targetArrival}까지 출근이면, 이런 출발 시각 후보가 있어요.`);

  if (usePreferred) {
    const tightLabel = preferredTimeA != null ? `(${preferredTimeA} 출발)` : '';
    const looseLabel = preferredTimeB != null ? `(${preferredTimeB} 출발)` : '';
    parts.push(`- ${tightDepartureTime} 출발(타이트) ${tightLabel} — 목표 도착 시각에 거의 맞게 나가는 쪽이에요.`);
    parts.push(`- ${looseDepartureTime} 출발(여유) ${looseLabel} — 준비가 급하지 않고 조금 더 일찍 나갈 수 있는 쪽이에요.`);
    if (preferredTimeA != null || preferredTimeB != null) {
      parts.push(`이 출발 시각은 전날 밤 프로필에서 직접 선택한 시간대를 기준으로 했어요.`);
    }
  } else {
    parts.push(`- ${tightDepartureTime} 출발(타이트) — 목표 도착 시각에 거의 맞게 나가는 쪽이에요.`);
    parts.push(`- ${looseDepartureTime} 출발(여유) — 준비가 급하지 않고 조금 더 일찍 나갈 수 있는 쪽이에요.`);
  }

  if (isRaining) {
    parts.push(`오늘 아침에 비가 올 수 있어서 우산을 챙기시는 게 좋아요.`);
  }

  if (weekday === 0 || weekday === 6) {
    parts.push(`오늘은 주말이에요. 평소와 시간대가 다를 수 있으니 참고해주세요.`);
  }

  parts.push(`이 정보는 참고안이에요. 정확한 노선·도착 정보는 지도/대중교통 앱에서 확인해보세요.`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// 내부 헬퍼 (분 단위 계산 정규화)
// ---------------------------------------------------------------------------

function toMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

function arrToTotalMinutes(parsed: ParsedTime): number {
  return parsed.hours * 60 + parsed.minutes;
}

function minutesToParsed(totalMinutes: number): ParsedTime {
  const normalized = totalMinutes % (24 * 60);
  const total = normalized < 0 ? normalized + 24 * 60 : normalized;
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return { hours, minutes };
}
