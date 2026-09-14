// src/lib/config.ts

// 서버 전용 설정. 키 값은 절대 로깅·응답·문서에 출력하지 않고 존재 여부만 확인한다.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function hasEnv(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== '';
}

// PRD 표 2 기준 환경변수 이름. 값 대신 이름만 참조한다.
export const EnvKeys = {
  KAKAO_REST_API_KEY: 'KAKAO_REST_API_KEY',
  TMAP_APP_KEY: 'TMAP_APP_KEY',
  ODSAY_API_KEY: 'ODSAY_API_KEY',
  TAGO_BUS_KEY: 'TAGO_BUS_KEY',
  TAGO_SUBWAY_KEY: 'TAGO_SUBWAY_KEY',
  KMA_WEATHER_KEY: 'KMA_WEATHER_KEY',
  UPSTAGE_API_KEY: 'UPSTAGE_API_KEY',
} as const;

/** 키 존재 요약 (값은 포함하지 않음) — 로그·체크용 */
export function envSummary(): Record<string, boolean> {
  return Object.fromEntries(
    Object.values(EnvKeys).map((key) => [key, hasEnv(key)]),
  ) as Record<string, boolean>;
}
