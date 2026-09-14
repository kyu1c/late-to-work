// src/lib/api/kma.ts
//
// 기상청(KMA) 초단기예보 API (서버용) — 날씨 확인
// - getUltraSrtFcst: 초단기예보 조회 (예보시점부터 6시간 이내)
//
// 원칙:
//  - KMA_WEATHER_KEY는 공공데이터포털 발급 키로 URL-encoded 형태일 수 있음.
//  - process.env에서 읽은 뒤 unquote 한 번만 적용하고, 요청 파라미터는 urlencode로 구성.
//  - 키 값은 절대 로깅·응답·문서에 노출하지 않는다.
//  - 성공 시 강수 여부 등만 추출해 클라이언트에 전달.
//  - 실패 시 폴백 필요 여부를 함께 반환한다.
//
// 참조: 기상청41_단기예보 조회서비스_오픈API활용가이드 (20260701)
//       - API명: VilageFcstInfoService_2.0 (단기예보 조회서비스)
//       - 상세기능: getUltraSrtFcst (초단기예보조회)
//       - 엔드포인트: http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst
//       - base_time: 매시각 30분 단위 발표 (0600, 0630, 0700, ...)
//         실시간 호출 시 현재시각 45분 이후여야 해당 발표시각 사용 가능
//       - nx=61, ny=126 (서울 권역), resultCode 00/0 성공
//       - 응답 필드: category(T1H, RN1, PTY, SKY, ...) + fcstValue(예보값)

import { getJson, classifyFailure } from './http';
import { hasEnv, EnvKeys } from '../config';

const KMA_WEATHER_KEY_ENV = EnvKeys.KMA_WEATHER_KEY;

function unquoteOnce(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface KmaWeatherSnapshot {
  isRaining: boolean;        // 강수 여부 (PTY 강수형태코드 > 0 기준)
  note: string;              // 사용자용 한 줄 요약
}

/**
 * 기상청 초단기예보를 조회한다.
 * - nx=61, ny=126은 서울 권역 기준.
 * - base_time: 매시각 30분 단위 발표(0600, 0630, 0700, ...).
 *   실시간 호출 시 현재시각이 발표시각+45분 이후여야 해당 발표시각 사용 가능.
 *   그보다 이르면 이전 30분 발표시각을 사용.
 * - resultCode 00 또는 0 모두 성공.
 * - 강수 여부는 PTY(강수형태코드) > 0 기준 (0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기).
 * - T1H(기온)도 함께 추출해 참고 문구에 반영.
 */
export async function kmaUltraShortSnapshot(
  nx: number = 61,
  ny: number = 126,
): Promise<{ ok: boolean; data?: KmaWeatherSnapshot; error?: string; fallback: boolean }> {
  if (!hasEnv(KMA_WEATHER_KEY_ENV)) {
    return {
      ok: false,
      error: 'KMA_WEATHER_KEY가 없습니다 (키 미설정/미입력)',
      fallback: true,
    };
  }

  const rawKey = process.env[KMA_WEATHER_KEY_ENV] ?? '';
  const serviceKey = unquoteOnce(rawKey);

  // base_time 계산: 매시각 30분 단위 발표시각(0000, 0030, 0100, 0130, ...) 중
  // KMA 가이드 기준: 현재시각이 발표시각+45분 이후여야 해당 발표시각 데이터 사용 가능.
  // 단순화 규칙:
  //  - 현재 KST 시각이 45분 미만이면 → 1시간 전 시계의 30분 발표시각 사용
  //    (예: 15:05 → 14:30, 00:05 → 23:30(전날))
  //  - 현재 KST 시각이 45분 이상이면 → 현재 시계의 30분 발표시각 사용
  //    (예: 15:45 → 15:30, 15:30 → 15:30)
  // - 날짜가 바뀌는 경우(00:xx → 23:30)도 base_date를 함께 갱신한다.
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstDate = kstNow.toISOString().slice(0, 10).replace(/-/g, '');
  const kstHour = kstNow.getHours();
  const kstMinute = kstNow.getMinutes();

  let baseHour: number;
  let baseMinute: number;
  let base_date = kstDate;

  if (kstMinute < 45) {
    // 45분 미만 → 1시간 전 시계의 30분
    if (kstHour === 0) {
      baseHour = 23;
      baseMinute = 30;
      // 날짜: 어제
      const yesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
      base_date = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
    } else {
      baseHour = kstHour - 1;
      baseMinute = 30;
    }
  } else {
    // 45분 이상 → 현재 시계의 30분
    baseHour = kstHour;
    baseMinute = 30;
  }

  // KMA 초단기예보는 당일 특정 시각 이후 발표부터 데이터가 채워질 수 있으므로,
  // 요청 결과가 NO_DATA이면 base_time을 한 단계 이전(30분 전)으로 최대 24회 재시도한다.
  const maxRetry = 24;
  let retryBaseHour = baseHour;
  let retryBaseMinute = baseMinute;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    const params = new URLSearchParams();
    params.set('serviceKey', serviceKey);
    params.set('base_date', base_date);
    params.set('base_time', `${String(retryBaseHour).padStart(2, '0')}${String(retryBaseMinute).padStart(2, '0')}`);
    params.set('nx', String(nx));
    params.set('ny', String(ny));
    params.set('dataType', 'JSON');
    params.set('numOfRows', '20');
    params.set('pageNo', '1');

    const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?${params.toString()}`;

    const result = await getJson<unknown>(url, undefined, 10000);
    if (!result.ok) {
      const classification = classifyFailure(result);
      return {
        ok: false,
        error: `KMA 초단기예보 실패: ${result.error}`,
        fallback: classification.kind === 'authFailure' ? false : true,
      };
    }

    const data = result.data;
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'KMA: 응답 파싱 실패', fallback: true };
    }

    const d = data as Record<string, unknown>;
    const resp = d.response;
    if (!resp || typeof resp !== 'object') {
      return { ok: false, error: 'KMA: response 없음', fallback: true };
    }

    const header = (resp as Record<string, unknown>).header;
    const resultCode =
      header && typeof header === 'object'
        ? (header as Record<string, unknown>).resultCode
        : null;
    const resultMsg =
      header && typeof header === 'object'
        ? (header as Record<string, unknown>).resultMsg
        : '';

    (async () => {
      try {
        const fs = await import('fs');
        fs.appendFileSync(
          '/tmp/kma_loop_debug.log',
          `[${new Date().toISOString()}] 시도 ${attempt}: resultCode=${resultCode} (${resultMsg})\n`
        );
      } catch {}
    })();

    if (resultCode !== '00' && resultCode !== '0') {
      // NO_DATA이면 이전 발표시각으로 재시도
      if (resultCode === '03' && attempt < maxRetry) {
        lastError = `KMA resultCode=${resultCode} (${resultMsg})`;
        // base_time을 30분 전으로 이동
        if (retryBaseMinute === 30) {
          retryBaseMinute = 0;
        } else {
          retryBaseMinute = 30;
          retryBaseHour = (retryBaseHour - 1 + 24) % 24;
        }
        continue;
      }
      return {
        ok: false,
        error: `KMA resultCode=${resultCode} (${resultMsg})`,
        fallback: true,
      };
    }

    // 성공: 응답 파싱 계속
    const body = (resp as Record<string, unknown>).body;
    if (!body || typeof body !== 'object') {
      return { ok: false, error: 'KMA: body 없음', fallback: true };
    }

    const items = (body as Record<string, unknown>).items;
    const itemList: Record<string, unknown>[] = [];
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && typeof it === 'object') itemList.push(it as Record<string, unknown>);
      }
    } else if (items && typeof items === 'object') {
      const arr = (items as Record<string, unknown>).item;
      if (Array.isArray(arr)) {
        for (const it of arr) {
          if (it && typeof it === 'object') itemList.push(it as Record<string, unknown>);
        }
      }
    }

    // 예보값 추출: category → fcstValue (예보값)
    const fcstMap: Record<string, string | number | null> = {};
    for (const item of itemList) {
      const cat = item.category;
      let value: string | number | null = null;
      if (typeof item.fcstValue === 'string' || typeof item.fcstValue === 'number') {
        value = item.fcstValue as string | number;
      } else if (typeof item.value === 'string' || typeof item.value === 'number') {
        value = item.value as string | number;
      }
      if (typeof cat === 'string') {
        fcstMap[cat] = value;
      }
    }

    const pty = fcstMap['PTY'];
    const rn1 = fcstMap['RN1'];
    const t1h = fcstMap['T1H'];

    const ptyNum = (() => {
      if (typeof pty === 'number') return pty;
      if (typeof pty === 'string') {
        const n = Number(pty);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })();
    const rn1Num = (() => {
      if (typeof rn1 === 'number') return rn1;
      if (typeof rn1 === 'string') {
        const n = Number(rn1);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })();

    // 강수 여부: PTY > 0 (강수형태코드 존재)
    const isRaining = ptyNum !== null && ptyNum > 0;

    let note = '날씨 정보 정상 수신';
    if (isRaining) {
      const ptyLabels: Record<number, string> = {
        1: '비', 2: '비/눈', 3: '눈', 4: '소나기',
      };
      const ptyLabel = ptyNum !== null && ptyLabels[ptyNum] ? ptyLabels[ptyNum] : '강수';
      note = `현재 ${ptyLabel} 예보됨 (1시간 강수량 범주 ${rn1Num !== null ? rn1Num : '?'}mm)`;
    } else {
      if (t1h !== null && typeof t1h === 'number') {
        note = `현재 기온 약 ${Math.round(t1h)}℃ (강수 없음)`;
      } else {
        note = '현재 강수 없음';
      }
    }

    return {
      ok: true,
      data: {
        isRaining,
        note,
      },
      fallback: false,
    };
  }

  // 모든 재시도 실패
  return {
    ok: false,
    error: `KMA 초단기예보 NO_DATA (재시도 ${maxRetry}회 실패): ${lastError || '알 수 없음'}`,
    fallback: true,
  };
}
