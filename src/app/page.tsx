// src/app/page.tsx
//
// late-to-work 메인 화면.
// - 프로필 있음/없음 상태에 따른 분기
// - 온보딩(첫 방문 시): 집/출근지 검색·선택, 목표 도착 시각, 선호 교통수단
// - 바로 추천 버튼 + 출발 시각 조절(칩 버튼 + 직접 입력)
// - 비교표 + 한 줄 결론 + 행동
// - 전날 밤 추천 미리 노출
// - 고급 프로필 세팅(준비 시간, 택시 호출 시간 추가 on/off)
// - 카카오T 앱 열기
//
// 원칙:
//  - 클라이언트 소스·응답에 키 값 노출 0. 좌표는 서버 내부용, UI에는 이름+주소만.
//  - 서버 시각 기준 계산(recommend API는 서버 시각 사용).
//  - 실시간 정보 없을 때 평균/패턴 폴백(API 라우트에서 처리), 화면은 결과만 표시.

'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './page.module.css';
import { cn } from '@heroui/styles';
import {
  Button,
  Input,
  Alert,
  Card,
  Chip,
  Checkbox,
  Badge,
  Fieldset,
  Label,
  Description,
  ErrorMessage,
  FieldError,
  Skeleton,
  ListBox,
  ListBoxItem,
  TimeField,
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopover,
  Tabs,
  NumberField,
  Separator,
  Breadcrumbs,
  BreadcrumbsRoot,
  BreadcrumbsItem,
  ProgressBar,
  ProgressBarRoot,
  ProgressBarFill,
  TypographyRoot,
} from '@heroui/react';
import { useTheme } from 'next-themes';
import { parseTime } from '@internationalized/date';

// ---------------------------------------------------------------------------
// 타입 (lib/types와 동일 — 여기서는 화면 전용으로 재선언하지 않고 필요한 것만)
// ---------------------------------------------------------------------------

type Transport = 'subway' | 'bus' | 'any';

interface Profile {
  homeName: string;
  homeAddress: string;
  homeX?: number;
  homeY?: number;
  workName: string;
  workAddress: string;
  workX?: number;
  workY?: number;
  targetArrival: string;
  preferredTransport: Transport;
  usualTransitMinutes?: number;
  preferredTimeA?: string;
  preferredTimeB?: string;
  prepMinutes: number;
  taxiCallAddOn: boolean;
  taxiCallAddMinutes: number;
  lastCachedNight?: string;
  lastNightTightDeparture?: string;
  lastNightLooseDeparture?: string;
}

interface AddressSearchResult {
  name: string;
  address: string;
  x?: number;
  y?: number;
}

interface RecommendResult {
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
  weather?: {
    isRaining: boolean;
    note: string;
  };
  note: string;
  /** 미래 운행 정보: 3개 후보 출발 시각 기준 차량 ETA (P1-6) */
  taxiFuture?: {
    departureTimes: string[];
    vehicleEtaMinutes: (number | null)[];
    taxiFare: (number | null)[];
  };
}

interface NightBeforeResult {
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

// ---------------------------------------------------------------------------
// localStorage 키
// ---------------------------------------------------------------------------

const PROFILE_KEY = 'late-to-work-profile';
const NIGHT_BEFORE_KEY = 'late-to-work-night-before';
const NIGHT_BEFORE_DATE_KEY = 'late-to-work-night-before-date';

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Profile;
    if (!data.homeName || !data.workName || !data.targetArrival) return null;
    return data;
  } catch {
    return null;
  }
}

function saveProfile(p: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

function loadNightBefore(): { result: NightBeforeResult | null; date: string | null } {
  try {
    const raw = localStorage.getItem(NIGHT_BEFORE_KEY);
    const dateRaw = localStorage.getItem(NIGHT_BEFORE_DATE_KEY);
    if (!raw || !dateRaw) return { result: null, date: null };
    const result = JSON.parse(raw) as NightBeforeResult;
    return { result, date: dateRaw };
  } catch {
    return { result: null, date: null };
  }
}

function saveNightBefore(result: NightBeforeResult, date: string) {
  localStorage.setItem(NIGHT_BEFORE_KEY, JSON.stringify(result));
  localStorage.setItem(NIGHT_BEFORE_DATE_KEY, date);
}

function clearNightBefore() {
  localStorage.removeItem(NIGHT_BEFORE_KEY);
  localStorage.removeItem(NIGHT_BEFORE_DATE_KEY);
}

function isNightBeforeStale(dateStr: string): boolean {
  if (!dateStr) return true;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  return dateStr !== todayStr;
}

function formatMoney(won: number): string {
  return won.toLocaleString('ko-KR');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// HH:MM 문자열을 분 단위 숫자로 변환 (예: "08:30" → 510)
function hhmmToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h ?? 0) || !Number.isFinite(m ?? 0)) return 0;
  return (h ?? 0) * 60 + (m ?? 0);
}

// 분 단위 숫자를 HH:MM 문자열로 변환
function minutesToHhmm(m: number): string {
  const total = Math.round(m) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${pad2(h)}:${pad2(min)}`;
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

async function searchAddress(query: string, preferAddress = false): Promise<{ ok: boolean; results: AddressSearchResult[]; error?: string }> {
  const res = await fetch('/api/address-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, preferAddress }),
  });
  const data = await res.json();
  if (!data.ok) {
    return { ok: false, results: [], error: data.error };
  }
  return { ok: true, results: data.results };
}

async function fetchRecommend(body: Record<string, unknown>): Promise<{ ok: boolean; result?: RecommendResult; error?: string }> {
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    return { ok: false, error: data.error };
  }
  return { ok: true, result: data.result };
}

async function fetchNightBefore(body: Record<string, unknown>): Promise<{ ok: boolean; result?: NightBeforeResult; error?: string }> {
  const res = await fetch('/api/night-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    return { ok: false, error: data.error };
  }
  return { ok: true, result: data.result };
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

type OnboardStep = 'welcome' | 'home' | 'work' | 'time' | 'prefs' | 'done';

export default function Home() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light' | undefined>(undefined);

  useEffect(() => {
    if (resolvedTheme !== undefined) {
      setActiveTheme(resolvedTheme === 'dark' ? 'dark' : 'light');
    }
  }, [resolvedTheme]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboardStep, setOnboardStep] = useState<OnboardStep>('welcome');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedHome, setSelectedHome] = useState<AddressSearchResult | null>(null);
  const [selectedWork, setSelectedWork] = useState<AddressSearchResult | null>(null);
  const [homeCoords, setHomeCoords] = useState<{ x: number; y: number } | null>(null);
  const [workCoords, setWorkCoords] = useState<{ x: number; y: number } | null>(null);
  const [targetArrival, setTargetArrival] = useState('09:00');
  const [preferredTransport, setPreferredTransport] = useState<Transport>('any');
  const [usualTransitMinutes, setUsualTransitMinutes] = useState<number | ''>('');
  const [preferredTimeA, setPreferredTimeA] = useState<string>('');
  const [preferredTimeB, setPreferredTimeB] = useState<string>('');
  const [prepMinutes, setPrepMinutes] = useState(5);
  const [taxiCallAddOn, setTaxiCallAddOn] = useState(false);
  const [taxiCallAddMinutes, setTaxiCallAddMinutes] = useState(0);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [departureInput, setDepartureInput] = useState('');
  const [departureAdjusted, setDepartureAdjusted] = useState(false);
  const [recommendResult, setRecommendResult] = useState<RecommendResult | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [nightBeforeResult, setNightBeforeResult] = useState<NightBeforeResult | null>(null);
  const [showNightBefore, setShowNightBefore] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 프로필 로드
  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (p) {
      setTargetArrival(p.targetArrival);
      setPreferredTransport(p.preferredTransport);
      setUsualTransitMinutes(p.usualTransitMinutes ?? '');
      setPreferredTimeA(p.preferredTimeA ?? '');
      setPreferredTimeB(p.preferredTimeB ?? '');
      setPrepMinutes(p.prepMinutes);
      setTaxiCallAddOn(p.taxiCallAddOn);
      setTaxiCallAddMinutes(p.taxiCallAddMinutes ?? 0);
      setSelectedHome({ name: p.homeName, address: p.homeAddress });
      setSelectedWork({ name: p.workName, address: p.workAddress });
      if (p.homeX != null && p.homeY != null) setHomeCoords({ x: p.homeX, y: p.homeY });
      if (p.workX != null && p.workY != null) setWorkCoords({ x: p.workX, y: p.workY });
    }
  }, []);

  // 전날 밤 추천 로드 (오후 4시 이후 신선한 경우만)
  useEffect(() => {
    if (!profile) return;
    const { result, date } = loadNightBefore();
    if (result && date && !isNightBeforeStale(date)) {
      setNightBeforeResult(result);
      setShowNightBefore(true);
    } else {
      setShowNightBefore(false);
    }
  }, [profile]);

  // 메시지 자동 사라짐
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }, []);

  // 주소 검색
  const doSearch = useCallback(async (query: string, preferAddress = false, setter: (r: AddressSearchResult | null) => void, coordSetter: (c: { x: number; y: number } | null) => void) => {
    if (!query.trim()) {
      setter(null);
      coordSetter(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const res = await searchAddress(query, preferAddress);
    setSearching(false);
    if (!res.ok) {
      setSearchError(res.error ?? '검색에 실패했습니다.');
      setSearchResults([]);
      return;
    }
    setSearchResults(res.results);
    if (res.results.length > 0) {
      const first = res.results[0];
      setter(first);
      if (first.x != null && first.y != null) {
        coordSetter({ x: first.x, y: first.y });
      } else {
        coordSetter(null);
      }
    } else {
      setter(null);
      coordSetter(null);
    }
  }, []);

  // 추천 실행
  const runRecommend = useCallback(async () => {
    if (!profile || !homeCoords || !workCoords) {
      setRecommendError('집과 출근지 위치가 필요합니다. 프로필을 먼저 완료해주세요.');
      return;
    }
    if (!targetArrival || !targetArrival.trim()) {
      setRecommendError('목표 도착 시각이 필요합니다. 프로필을 수정해주세요.');
      return;
    }
    setRecommendLoading(true);
    setRecommendError(null);
    setRecommendResult(null);

    const body: Record<string, unknown> = {
      startX: homeCoords.x,
      startY: homeCoords.y,
      endX: workCoords.x,
      endY: workCoords.y,
      targetArrival,
      sharedPrepMinutes: prepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
    };
    if (departureInput.trim()) {
      body.departureTime = departureInput.trim();
    }

    const res = await fetchRecommend(body);
    setRecommendLoading(false);
    if (!res.ok) {
      setRecommendError(res.error ?? '추천을 계산할 수 없습니다.');
      return;
    }
    setRecommendResult(res.result!);
  }, [profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, departureInput]);

  // 전날 밤 추천 새로고침 (조용히 실행하려면 silent=true)
  const refreshNightBefore = useCallback(async (silent = false) => {
    if (!profile || !homeCoords || !workCoords) {
      if (!silent) showMessage('집과 출근지 위치가 필요합니다.');
      return;
    }
    setRecommendLoading(true);
    const body: Record<string, unknown> = {
      targetArrival,
      sharedPrepMinutes: prepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
      transitDurationMinutes: recommendResult?.transit.durationMinutes,
      transitTransfers: recommendResult?.transit.transfers,
      transitDistanceMeters: recommendResult?.transit.distanceMeters,
      taxiVehicleEtaMinutes: recommendResult?.taxi.vehicleEtaMinutes,
      taxiFare: recommendResult?.taxi.taxiFare,
      isRaining: recommendResult?.weather?.isRaining ?? false,
      weekday: new Date().getDay(),
      preferTransport: profile.preferredTransport,
    };
    const res = await fetchNightBefore(body);
    setRecommendLoading(false);
    if (!res.ok) {
      if (!silent) showMessage('전날 밤 추천을 새로고침할 수 없습니다.');
      return;
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    saveNightBefore(res.result!, `${yyyy}-${mm}-${dd}`);
    setNightBeforeResult(res.result!);
    setShowNightBefore(true);
    if (!silent) showMessage('전날 밤 추천이 새로고침되었습니다.');
  }, [profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, recommendResult, showMessage]);

  // 전날 밤 추천 자동 상태 관리
  // - 오후 4시 이전: 마지막 저장된 밤 추천이 오늘 날짜면 그대로 표시
  // - 오후 4시 이후: 날짜가 달라졌으면(stale) 자동으로 다시 계산해 표시
  useEffect(() => {
    if (!profile) return;
    const { result, date } = loadNightBefore();
    const now = new Date();
    const hour = now.getHours();
    const isAfternoon = hour >= 16;
    const fresh = result && date && !isNightBeforeStale(date);

    if (fresh) {
      setNightBeforeResult(result);
      setShowNightBefore(true);
    } else if (isAfternoon) {
      // 오후 4시 이후이고 신선하지 않으면 자동 리프레시
      refreshNightBefore(true);
    } else {
      setShowNightBefore(false);
    }
  }, [profile, refreshNightBefore]);

  // 프로필 저장
  const saveProfileHandler = useCallback(() => {
    if (!selectedHome || !selectedWork || !targetArrival) {
      showMessage('프로필 정보가 부족합니다.');
      return;
    }
    // selectedHome/selectedWork에는 address-search API가 x,y를 포함해 반환하므로,
    // 프로필 저장 시점에 좌표를 그대로 반영한다(내부 계산용).
    const p: Profile = {
      homeName: selectedHome.name,
      homeAddress: selectedHome.address,
      homeX: homeCoords?.x,
      homeY: homeCoords?.y,
      workName: selectedWork.name,
      workAddress: selectedWork.address,
      workX: workCoords?.x,
      workY: workCoords?.y,
      targetArrival,
      preferredTransport,
      usualTransitMinutes: typeof usualTransitMinutes === 'number' ? usualTransitMinutes : undefined,
      preferredTimeA,
      preferredTimeB,
      prepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
    };
    saveProfile(p);
    setProfile(p);
    setOnboardStep('done');
    if (homeCoords && workCoords) {
      showMessage('프로필이 저장되었습니다. 지금 출발 기준을 계산하고 있어요...');
      requestAnimationFrame(() => {
        runRecommend();
      });
    } else {
      showMessage('프로필이 저장되었습니다.');
    }
  }, [selectedHome, selectedWork, targetArrival, preferredTransport, usualTransitMinutes, preferredTimeA, preferredTimeB, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, showMessage, homeCoords, workCoords, runRecommend]);

  const clearProfileHandler = useCallback(() => {
    clearProfile();
    clearNightBefore();
    setProfile(null);
    setOnboardStep('welcome');
    setSelectedHome(null);
    setSelectedWork(null);
    setHomeCoords(null);
    setWorkCoords(null);
    setRecommendResult(null);
    setNightBeforeResult(null);
    setShowNightBefore(false);
    setSearchResults([]);
    setSearchError(null);
    showMessage('프로필이 초기화되었습니다.');
  }, [showMessage]);

  const goToOnboarding = useCallback(() => {
    setOnboardStep('home');
    setSearchResults([]);
    setSearchError(null);
    setSearchQuery('');
    setSelectedHome(null);
    setSelectedWork(null);
    setHomeCoords(null);
    setWorkCoords(null);
  }, []);

  const editProfileHandler = useCallback(() => {
    setOnboardStep('home');
    setSearchResults([]);
    setSearchError(null);
    setSearchQuery('');
    setTargetArrival(profile?.targetArrival ?? '09:00');
    setPreferredTransport(profile?.preferredTransport ?? 'any');
    setUsualTransitMinutes(profile?.usualTransitMinutes ?? '');
    setPreferredTimeA(profile?.preferredTimeA ?? '');
    setPreferredTimeB(profile?.preferredTimeB ?? '');
    setPrepMinutes(profile?.prepMinutes ?? 5);
    setTaxiCallAddOn(profile?.taxiCallAddOn ?? false);
    setTaxiCallAddMinutes(profile?.taxiCallAddMinutes ?? 0);
    setSelectedHome(profile ? { name: profile.homeName, address: profile.homeAddress } : null);
    setSelectedWork(profile ? { name: profile.workName, address: profile.workAddress } : null);
    if (profile?.homeX != null && profile?.homeY != null) setHomeCoords({ x: profile.homeX, y: profile.homeY });
    if (profile?.workX != null && profile?.workY != null) setWorkCoords({ x: profile.workX, y: profile.workY });
  }, [profile]);

  // 전날 선호 출발 시각 A/B 자동 prefill
  // 목표 도착 시각과 이동 소요 추정치(대략)를 기준으로 타이트/여유 출발 시각을 채운다.
  useEffect(() => {
    if (!targetArrival) return;
    const arrivalMin = hhmmToMinutes(targetArrival);
    const transitMin = (() => {
      if (recommendResult && recommendResult.transit.durationMinutes != null && recommendResult.transit.durationMinutes > 0) return recommendResult.transit.durationMinutes;
      const u = typeof usualTransitMinutes === 'number' ? usualTransitMinutes : null;
      if (u != null && u > 0) return u;
      return 30;
    })();
    const totalMin = transitMin + prepMinutes;
    const tight = arrivalMin - totalMin;
    const loose = arrivalMin - totalMin - 10;
    if (!preferredTimeA) setPreferredTimeA(minutesToHhmm(tight));
    if (!preferredTimeB) setPreferredTimeB(minutesToHhmm(loose));
  }, [targetArrival, recommendResult?.transit.durationMinutes, usualTransitMinutes, prepMinutes]);

  // -----------------------------------------------------------------------
  // 렌더링
  // -----------------------------------------------------------------------

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.themeToggle}>
          <Button
            className={cn(
              "h-11 w-11 rounded-full min-w-0",
              activeTheme === "dark"
                ? "bg-[var(--surface-secondary)] text-[var(--accent)]"
                : "bg-[var(--surface-secondary)] text-[var(--foreground)]",
            )}
            variant="ghost"
            onPress={() =>
              setTheme(activeTheme === "dark" ? "light" : "dark")
            }
            aria-label="다크모드 전환"
            size="sm"
          >
            {activeTheme === "light" ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                <span>라이트</span>
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>다크</span>
              </>
            )}
          </Button>
        </div>

        <div className={styles.intro}>
          <h1 className={styles.introTitle}>늦잠 잔 출근 아침의 5초 가치판단</h1>
          <p className={styles.introSubtitle}>
            지금 출발하면 대중교통과 택시 중 뭐가 더 나을지, 준비 시간까지 반영해 비교해드려요.
          </p>
        </div>

        {/* 프로필 요약 */}
        {profile && (
        <Card className={styles.profileCard}>
          <Card.Header className={styles.profileCardHeader}>
            <Card.Title className={styles.profileCardTitle}>저장된 정보</Card.Title>
            <Button
              className={styles.profileEditButton}
              variant="ghost"
              size="sm"
              onPress={editProfileHandler}
            >
              수정
            </Button>
          </Card.Header>
          <Card.Content className={styles.profileCardContent}>
            <div className={styles.profileRow}>
              <div>
                <span className={styles.profileStrong}>{profile.homeName}</span>
                <span className={styles.profileArrow}> → </span>
                <span className={styles.profileStrong}>{profile.workName}</span>
              </div>
              <Button
                className={styles.profileClear}
                variant="ghost"
                size="sm"
                onPress={clearProfileHandler}
              >
                초기화
              </Button>
            </div>
            <p className={styles.profileAddress}>
              {profile.homeAddress} → {profile.workAddress}
            </p>
            <div className={styles.profileMeta}>
              <Chip size="sm" variant="soft" color="default">
                목표 도착: {profile.targetArrival}
              </Chip>
              <Chip size="sm" variant="soft" color="default">
                선호: {profile.preferredTransport}
              </Chip>
            </div>
          </Card.Content>
        </Card>
        )}

        {profile && (!homeCoords || !workCoords) && (
          <div className={styles.coordsWarning}>
            <span>위치 정보가 불완전해요.</span>
            <Button variant="ghost" size="sm" className={styles.coordsWarningEditBtn} onPress={editProfileHandler}>
              프로필 수정하기
            </Button>
          </div>
        )}

          {/* 밤새 추천 미리 노출 */}
          {showNightBefore && nightBeforeResult && (
            <Card className={styles.nightBeforeCard}>
              <Card.Header>
                <Card.Title className={styles.nightBeforeHeader}>
                  어제 밤 기준 내일 출발 추천
                </Card.Title>
                {profile && (
                  <Button
                    className={styles.linkButton}
                    variant="ghost"
                    onPress={() => refreshNightBefore(false)}
                    isDisabled={recommendLoading}
                  >
                    {recommendLoading ? '새로고침 중…' : '새로고침'}
                  </Button>
                )}
              </Card.Header>
              <Card.Content>
                <div>
                  <div>
                    <span className={styles.nightBeforeLabel}>타이트:</span>{' '}
                    <strong>{nightBeforeResult.tight.departureTime}</strong> 출발
                  </div>
                </div>
                <div className={styles.nightBeforeNote}>{nightBeforeResult.tight.transportNote}</div>
                <div className={styles.nightBeforeNote}>{nightBeforeResult.tight.arrivalNote}</div>
                <Separator className={styles.nightBeforeDivider} />
                <div>
                  <span className={styles.nightBeforeLabel}>여유:</span>{' '}
                  <strong>{nightBeforeResult.loose.departureTime}</strong> 출발
                </div>
                <div className={styles.nightBeforeNote}>{nightBeforeResult.loose.transportNote}</div>
                <div className={styles.nightBeforeNote}>{nightBeforeResult.loose.arrivalNote}</div>
                <div className={styles.nightBeforeBottom}>{nightBeforeResult.note}</div>
              </Card.Content>
            </Card>
          )}

          {/* 온보딩 환영 */}
          {!profile && onboardStep === 'welcome' && (
            <Card className={styles.welcomeCard}>
              <div className={styles.welcomeContent}>
                <p className={styles.welcomeQuestion}>처음 방문이신가요?</p>
                <Button variant="primary" onPress={goToOnboarding}>
                    프로필 설정하기
                  </Button>
                <p className={styles.welcomeDesc}>
                  집과 출근지 위치, 목표 도착 시각을 입력하면 바로 비교 추천을 받을 수 있어요.
                </p>
              </div>
            </Card>
          )}

          {/* 온보딩 단계 */}
          {onboardStep !== 'welcome' && onboardStep !== 'done' && (
            <Card className={styles.onboardingCard}>
              <div className={styles.onboardingSteps}>
                <Tabs orientation="horizontal" className={styles.onboardingTabs}>
                  <Tabs.List className={styles.onboardingTabList}>
                    {['집 위치', '출근지 위치', '목표 도착 시각', '선호 교통수단'].map((label, i) => {
                      const stepKey = ['home', 'work', 'time', 'prefs'][i] as OnboardStep;
                      const isActive = onboardStep === stepKey;
                      const isDone = ['home', 'work', 'time', 'prefs'].indexOf(onboardStep) > i;
                      return (
                        <Tabs.Tab
                          key={label}
                          className={cn(
                            styles.onboardingTab,
                            isActive && styles.onboardingTabActive,
                            isDone && styles.onboardingTabDone,
                          )}
                        >
                          {label}
                        </Tabs.Tab>
                      );
                    })}
                  </Tabs.List>
                </Tabs>
              </div>

              {onboardStep === 'home' && (
                <div className={styles.onboardingSection}>
                  <Fieldset>
                    <Fieldset.Legend>집 위치 (검색 후 선택)</Fieldset.Legend>
                    <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
                    <div className={styles.searchRow}>
                      <Input
                        className={styles.searchInput}
                        placeholder="예: 보라매역, 회사 이름, 도로명 주소"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            doSearch(searchQuery, false, setSelectedHome, setHomeCoords);
                          }
                        }}
                      />
                      <Button
                        variant="primary"
                        className={styles.searchButton}
                        onPress={() => doSearch(searchQuery, false, setSelectedHome, setHomeCoords)}
                        isDisabled={searching || !searchQuery.trim()}
                      >
                        {searching ? '검색 중…' : '검색'}
                      </Button>
                    </div>
                    {searchError && (
                      <FieldError>{searchError}</FieldError>
                    )}
                    {searching ? (
                      <div className={styles.searchSkeleton}>
                        <Skeleton className={styles.skel} />
                        <Skeleton className={cn(styles.skel, styles.result)} />
                      </div>
                    ) : searchResults.length > 0 ? (
                      <ListBox
                        aria-label="집 위치 검색 결과"
                        selectionMode="single"
                        selectedKeys={selectedHome ? new Set([`${selectedHome.name}|${selectedHome.address}`]) : new Set()}
                        onSelectionChange={(keys) => {
                          const keyArray = [...keys];
                          if (keyArray.length > 0) {
                            const key = keyArray[0] as string;
                            const r = searchResults.find(
                              (r) => `${r.name}|${r.address}` === key,
                            );
                            if (r) {
                              setSelectedHome(r);
                              if (r.x != null && r.y != null) setHomeCoords({ x: r.x, y: r.y });
                              setSearchResults([]);
                              setSearchError(null);
                            }
                          }
                        }}
                      >
                        {searchResults.map((r) => (
                          <ListBoxItem
                            key={r.name + '|' + r.address}
                            id={r.name + '|' + r.address}
                            textValue={r.name}
                            aria-label={r.name}
                          >
                            <Label>{r.name}</Label>
                            <Description>{r.address}</Description>
                          </ListBoxItem>
                        ))}
                      </ListBox>
                    ) : null}
                    {selectedHome && (
                      <div className={styles.homeAddressDisplay}>
                        <span>선택된 집</span>
                        <strong>{selectedHome.name}</strong>
                        <span className={styles.fieldHelp}>{selectedHome.address}</span>
                      </div>
                    )}
                  </Fieldset>
                  <div className={styles.onboardingNav}>
                    <Button variant="ghost" className={styles.cancelButton} onPress={() => {
                      setOnboardStep('done');
                      setSearchResults([]);
                      setSearchError(null);
                      setSearchQuery('');
                    }}>
                      취소
                    </Button>
                    <Button
                      className={styles.nextButton}
                      variant="primary"
                      onPress={() => { setSearchQuery(''); setOnboardStep('work'); }}
                      isDisabled={!selectedHome}
                    >
                      다음: 출근지 위치
                    </Button>
                  </div>
                </div>
              )}

              {onboardStep === 'work' && (
                <div className={styles.onboardingSection}>
                  {selectedHome && (
                    <div className={styles.homeAddressDisplay}>
                      <span>집 주소</span>
                      <strong>{selectedHome.name}</strong>
                      <span className={styles.fieldHelp}>{selectedHome.address}</span>
                    </div>
                  )}
                  <Fieldset>
                    <Fieldset.Legend>출근지 위치 (검색 후 선택)</Fieldset.Legend>
                    <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
                    <div className={styles.searchRow}>
                      <Input
                        className={styles.searchInput}
                        placeholder="예: 강남역, 회사 이름, 도로명 주소"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            doSearch(searchQuery, false, setSelectedWork, setWorkCoords);
                          }
                        }}
                      />
                      <Button
                        variant="primary"
                        className={styles.searchButton}
                        onPress={() => doSearch(searchQuery, false, setSelectedHome, setHomeCoords)}
                        isDisabled={searching || !searchQuery.trim()}
                      >
                        {searching ? '검색 중…' : '검색'}
                      </Button>
                    </div>
                    {searchError && (
                      <FieldError>{searchError}</FieldError>
                    )}
                    {searching ? (
                      <div className={styles.searchSkeleton}>
                        <Skeleton className={styles.skel} />
                        <Skeleton className={cn(styles.skel, styles.result)} />
                      </div>
                    ) : searchResults.length > 0 ? (
                      <ListBox
                        aria-label="출근지 위치 검색 결과"
                        selectionMode="single"
                        selectedKeys={selectedWork ? new Set([`${selectedWork.name}|${selectedWork.address}`]) : new Set()}
                        onSelectionChange={(keys) => {
                          const keyArray = [...keys];
                          if (keyArray.length > 0) {
                            const key = keyArray[0] as string;
                            const r = searchResults.find(
                              (r) => `${r.name}|${r.address}` === key,
                            );
                            if (r) {
                              setSelectedWork(r);
                              if (r.x != null && r.y != null) setWorkCoords({ x: r.x, y: r.y });
                              setSearchResults([]);
                              setSearchError(null);
                            }
                          }
                        }}
                      >
                        {searchResults.map((r) => (
                          <ListBoxItem
                            key={r.name + '|' + r.address}
                            id={r.name + '|' + r.address}
                            textValue={r.name}
                            aria-label={r.name}
                          >
                            <Label>{r.name}</Label>
                            <Description>{r.address}</Description>
                          </ListBoxItem>
                        ))}
                      </ListBox>
                    ) : null}
                    {selectedWork && (
                      <div className={styles.homeAddressDisplay}>
                        <span>선택된 출근지</span>
                        <strong>{selectedWork.name}</strong>
                        <span className={styles.fieldHelp}>{selectedWork.address}</span>
                      </div>
                    )}
                  </Fieldset>
                  <div className={styles.onboardingNav}>
                    <Button variant="outline" className={styles.backButton} onPress={() => setOnboardStep('home')}>뒤로</Button>
                    <Button variant="primary" className={styles.nextButton} onPress={() => { setSearchQuery(''); setOnboardStep('time'); }} isDisabled={!selectedWork}>
                      다음: 목표 도착 시각
                    </Button>
                  </div>
                </div>
              )}

              {onboardStep === 'time' && (
                <div className={styles.onboardingSection}>
                  <TimeField
                    className={styles.timeField}
                    name="targetArrival"
                    value={targetArrival ? parseTime(targetArrival) : null}
                    onChange={(timeValue) => {
                      setTargetArrival(timeValue ? timeValue.toString() : '');
                    }}
                    placeholderValue={parseTime('09:00')}
                  >
                    <Label>목표 도착 시각</Label>
                    <TimeField.Group>
                      <TimeField.Input>
                        {(segment) => <TimeField.Segment segment={segment} />}
                      </TimeField.Input>
                    </TimeField.Group>
                    <Description>도착해야 하는 시각을 입력하면 그에 맞춰 출발 시간을 계산해요.</Description>
                  </TimeField>
                  <div className={styles.onboardingNav}>
                    <Button variant="outline" className={styles.backButton} onPress={() => setOnboardStep('work')}>뒤로</Button>
                    <Button variant="primary" className={styles.nextButton} onPress={() => setOnboardStep('prefs')}>
                      다음: 선호 교통수단
                    </Button>
                  </div>
                </div>
              )}

              {onboardStep === 'prefs' && (
                <div className={styles.onboardingSection}>
                  <Fieldset>
                    <Fieldset.Legend>평소 선호 교통수단</Fieldset.Legend>
                    <Select
                      value={preferredTransport}
                      onChange={(val) => setPreferredTransport(val as Transport)}
                    >
                      <SelectTrigger className={styles.selectTrigger}>
                        <SelectValue>{preferredTransport ? ({ subway: '지하철 위주', bus: '버스 위주', any: '상관없음' } as const)[preferredTransport] : '선택하세요'}</SelectValue>
                      </SelectTrigger>
                      <SelectPopover>
                        <div className={styles.selectItem} data-value="subway">지하철 위주</div>
                        <div className={styles.selectItem} data-value="bus">버스 위주</div>
                        <div className={styles.selectItem} data-value="any">상관없음</div>
                      </SelectPopover>
                    </Select>
                  </Fieldset>
                  <div className={styles.moveEstimate}>
                    <span className={styles.moveEstimateLabel}>이동 소요 예상</span>
                    {recommendResult && recommendResult.transit.durationMinutes != null && recommendResult.transit.durationMinutes > 0 ? (
                      <span className={styles.moveEstimateValue}>약 {recommendResult.transit.durationMinutes}분 (대중교통, {recommendResult.transit.source})</span>
                    ) : usualTransitMinutes ? (
                      <span className={styles.moveEstimateValue}>약 {typeof usualTransitMinutes === 'number' ? usualTransitMinutes : 0}분 (입력한 평소 소요 시간 기준)</span>
                    ) : (
                      <span className={styles.moveEstimateHelp}>입력한 평소 소요 시간이 있으면 여기에 반영돼요.</span>
                    )}
                  </div>
                  <label className={styles.fieldLabel}>
                    평소 평균 이동 소요 시간 (분, 선택)
                    <NumberField
                      className={styles.numberInput}
                      name="usualTransitMinutes"
                      value={usualTransitMinutes === '' ? undefined : usualTransitMinutes}
                      onChange={(value) => setUsualTransitMinutes(value ?? '')}
                      minValue={1}
                      maxValue={300}
                    >
                      <NumberField.Input placeholder="예: 30" />
                      <NumberField.IncrementButton>+</NumberField.IncrementButton>
                      <NumberField.DecrementButton>−</NumberField.DecrementButton>
                    </NumberField>
                  </label>
                  <label className={styles.fieldLabel}>
                    전날 밤 선호 출발 시각 A (타이트, HH:MM, 선택)
                    <Input
                      className={styles.timeInput}
                      type="time"
                      value={preferredTimeA}
                      onChange={(e) => setPreferredTimeA(e.target.value)}
                      min="00:00"
                      max="23:59"
                      placeholder="예: 08:20"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    전날 밤 선호 출발 시각 B (여유, HH:MM, 선택)
                    <Input
                      className={styles.timeInput}
                      type="time"
                      value={preferredTimeB}
                      onChange={(e) => setPreferredTimeB(e.target.value)}
                      min="00:00"
                      max="23:59"
                      placeholder="예: 08:40"
                    />
                  </label>
                  <div className={styles.onboardingNav}>
                    <Button variant="outline" className={styles.backButton} onPress={() => setOnboardStep('time')}>뒤로</Button>
                    <Button variant="primary" className={styles.primaryButton} onPress={saveProfileHandler}>프로필 저장</Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 프로필 완료 후: 비교표 + 밤 추천 영역 */}
          {profile && onboardStep === 'done' && (
            <div className={styles.recommendArea}>
              {/* 비교표 */}
              {recommendResult && (
                <div className={styles.compareCard}>
                  <div className={styles.compareHeader}>
                    <span>현재 시각 기준: {recommendResult.nowTime}</span>
                    <span className={styles.muted}>목표 도착: {recommendResult.targetArrival}</span>
                  </div>
                  <div className={styles.dataDisclaimer}>
                    실시간 교통·날씨 정보가 없으면 평균·패턴 기반 추정치로 안내해요.
                  </div>

                  {/* 날씨 정보 */}
                  {recommendResult.weather && (
                    <Alert
                      status={recommendResult.weather.isRaining ? 'danger' : 'success'}
                      className={styles.weatherAlert}
                    >
                      <Alert.Description>
                        <span className={styles.weatherIcon}>
                          {recommendResult.weather.isRaining ? '☔' : '☀️'}
                        </span>
                        <span>{recommendResult.weather.note}</span>
                      </Alert.Description>
                    </Alert>
                  )}

                  <div className={styles.compareTable}>
                    {/* 대중교통 행 */}
                    <div className={styles.compareRow}>
                      <div className={styles.compareCell}>
                        <span className={styles.compareLabel}>대중교통</span>
                        <span className={styles.compareSource}>{recommendResult.transit.source}</span>
                      </div>
                      <div className={styles.compareCell}>
                        <div>출발 기준: {recommendResult.comparison.public.departureTime}</div>
                        <div>이동 {recommendResult.comparison.public.transitMinutes}분 + 준비 {recommendResult.comparison.public.prepMinutes}분</div>
                        <div>도착 예상: {recommendResult.comparison.public.arrivalTime}</div>
                      </div>
                      <div className={styles.compareCell}>
                        {recommendResult.transit.transfers != null && recommendResult.transit.transfers > 0 && (
                          <div>환승: 약 {recommendResult.transit.transfers}회</div>
                        )}
                        {recommendResult.transit.distanceMeters != null && (
                          <div>거리: {recommendResult.transit.distanceMeters.toFixed(0)}m</div>
                        )}
                        <div className={styles.muted}>{recommendResult.transit.note}</div>
                      </div>
                    </div>

                    {/* 택시 행 */}
                    <div className={styles.compareRow}>
                      <div className={styles.compareCell}>
                        <span className={styles.compareLabel}>택시</span>
                        <span className={styles.compareSource}>{recommendResult.taxi.source}</span>
                      </div>
                      <div className={styles.compareCell}>
                        <div>출발 기준: {recommendResult.comparison.taxi.departureTime}</div>
                        <div>차량 {recommendResult.comparison.taxi.vehicleEtaMinutes}분 + 준비 {recommendResult.comparison.taxi.prepMinutes}분</div>
                        <div>도착 예상: {recommendResult.comparison.taxi.arrivalTime}</div>
                      </div>
                      <div className={styles.compareCell}>
                        {recommendResult.taxi.taxiFare != null && (
                          <div>예상 요금: {formatMoney(recommendResult.taxi.taxiFare)}원</div>
                        )}
                        {recommendResult.taxi.distanceMeters != null && (
                          <div>거리: {recommendResult.taxi.distanceMeters.toFixed(0)}m</div>
                        )}
                        <div className={styles.muted}>{recommendResult.taxi.note}</div>
                        <Button className={styles.taxiLinkButton} onPress={() => { window.location.href = 'kakaot://'; }}>
                          카카오T 앱 열기
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 한 줄 결론 */}
                  <div className={styles.conclusion}>
                    <strong>{recommendResult.comparison.statement}</strong>
                  </div>

                  {/* 행동 */}
                  <div className={styles.actions}>
                    {recommendResult.actions.map((a, i) => (
                      <div key={i} className={styles.actionItem}>{a}</div>
                    ))}
                  </div>

                  {/* 참고 */}
                  <div className={styles.note}>{recommendResult.note}</div>
                  <p className={styles.muted} style={{ marginTop: '6px' }}>
                    준비 시간은 개인 준비와 택시 호출 대기를 함께 고려한 초기 추정치예요. 고급 설정에서 조정할 수 있어요.
                  </p>

                  {/* 미래 운행 정보: 3개 후보 출발 시각 기준 차량 ETA (P1-6) */}
                  {recommendResult.taxiFuture && recommendResult.taxiFuture.departureTimes.length > 0 && (() => {
                    const tf = recommendResult.taxiFuture!;
                    return (
                      <Card className={styles.futureCard}>
                        <div className={styles.futureHeader}>
                          <span>후보 출발 시각별 차량 예상 소요시간</span>
                          <span className={styles.muted}>(미래 운행 정보 기준)</span>
                        </div>
                        <div className={styles.futureTable}>
                          {tf.departureTimes.map((dep, i) => (
                            <div key={i} className={styles.futureRow}>
                              <div className={styles.futureCell}>
                                <strong>{dep}</strong> 출발
                              </div>
                              <div className={styles.futureCell}>
                                {tf.vehicleEtaMinutes[i] != null ? (
                                  <span>약 {tf.vehicleEtaMinutes[i]}분</span>
                                ) : (
                                  <span>확인 불가</span>
                                )}
                              </div>
                              <div className={styles.futureCell}>
                                {tf.taxiFare[i] != null ? (
                                  <span>{formatMoney(tf.taxiFare[i])}원</span>
                                ) : (
                                  <span>확인 불가</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={styles.futureNote}>
                          출발 시각을 몇 가지로 나눠서 각각에 대해 차가 얼마나 걸릴지 미리 본 결과예요.
                          늦지 않는 마지막 출발 시각을 가늠하는 데 참고할 수 있어요.
                        </div>
                        <div className={styles.dataDisclaimer}>
                          실시간 교통·날씨 정보가 없으면 평균·패턴 기반 추정치로 안내해요.
                        </div>
                      </Card>
                    );
                  })()}
                </div>
              )}

              {recommendError && (
                <div className={styles.errorText}>
                  {recommendError}
                  {recommendError.includes('위치') || recommendError.includes('출발') || recommendError.includes('수정') ? (
                    <Button
                      className={styles.errorEditButton}
                      variant="outline"
                      size="sm"
                      onPress={editProfileHandler}
                    >
                      프로필 수정하기
                    </Button>
                  ) : null}
                </div>
              )}

              {!recommendResult && !recommendLoading && !recommendError && (
                <div className={styles.hint}>
                  위 버튼을 누르면 현재 시각 기준으로 교통비·준비 시간을 반영한 비교표가 나와요.
                </div>
              )}

              {/* 전날 밤 추천 새로고침 (이미 위에 표시된 경우) */}
              {!showNightBefore && profile && (
                <div className={styles.nightBeforeTrigger}>
                  <Button variant="outline" className={styles.secondaryButton} onPress={() => refreshNightBefore(false)} isDisabled={recommendLoading}>
                    {recommendLoading ? '새로고침 중…' : '전날 밤 추천 새로고침'}
                  </Button>
                  <span className={styles.muted}>오후 4시 이후 접속 시 자동으로 전날 밤 추천이 표시돼요.</span>
                </div>
              )}
            </div>
          )}

          {/* 고급 설정 */}
          {profile && onboardStep === 'done' && (
            <div className={styles.advancedCard}>
              <Button variant="ghost" className={styles.advancedToggle} onPress={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? '고급 설정 접기' : '고급 설정 펼치기'}
              </Button>
              {showAdvanced && (
                <div className={styles.advancedForm}>
                  <label className={styles.fieldLabel}>
                    공통 준비 시간 (분, 기본 5분)
                    <Input
                      className={styles.numberInput}
                      type="number"
                      min="0"
                      max="120"
                      value={prepMinutes}
                      onChange={(e) => setPrepMinutes(parseInt(e.target.value, 10) || 0)}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    <div className={styles.checkRow}>
                      <span>택시 호출 시간 추가</span>
                      <input
                        type="checkbox"
                        checked={taxiCallAddOn}
                        onChange={(e) => setTaxiCallAddOn(e.target.checked)}
                      />
                    </div>
                    {taxiCallAddOn && (
                      <Input
                        className={styles.numberInput}
                        type="number"
                        min="0"
                        max="60"
                        value={taxiCallAddMinutes}
                        onChange={(e) => setTaxiCallAddMinutes(parseInt(e.target.value, 10) || 0)}
                        placeholder="추가 시간(분)"
                      />
                    )}
                  </label>
                  <p className={styles.muted} style={{ marginTop: '8px' }}>
                    준비 시간은 개인 준비와 택시 호출 대기를 함께 고려한 초기 추정치예요. 고급 설정에서 조정할 수 있어요.
                  </p>
                  <Button variant="outline" className={styles.secondaryButton} onPress={() => {
                    saveProfile({ ...profile, prepMinutes, taxiCallAddOn, taxiCallAddMinutes });
                    setProfile((prev) => prev ? { ...prev, prepMinutes, taxiCallAddOn, taxiCallAddMinutes } : null);
                    showMessage('고급 설정이 저장되었습니다.');
                  }}>
                    설정 저장
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 메시지 */}
          {message && (
            <div className={styles.message}>{message}</div>
          )}

          {/* 바로 추천 영역 (항상 노출, 페이지 하단) */}
          <div className={styles.recommendButtonArea}>
            <Button
              className={styles.recommendPrimaryButton}
              variant="primary"
              onPress={runRecommend}
              isDisabled={!profile || !homeCoords || !workCoords || recommendLoading}
            >
              {recommendLoading
                ? '계산 중…'
                : departureAdjusted
                  ? '출발 시각 조정됨 — 계산'
                  : profile
                    ? '지금 출발 계산'
                    : '프로필을 먼저 입력해주세요'}
            </Button>

            {profile && (
              <div className={styles.departureTimeRow}>
                <span className={styles.label}>출발 시각:</span>
                <div className={styles.departureNowTime}>
                  현재 시각: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
                <div className={styles.chipRow}>
                  <Button
                    variant="ghost"
                    className={styles.chip}
                    onPress={() => {
                      setDepartureInput((d) => '');
                      setDepartureAdjusted(false);
                    }}
                    isDisabled={recommendLoading}
                  >
                    지금
                  </Button>
                  <Button
                    variant="ghost"
                    className={styles.chip}
                    onPress={() => {
                      if (!departureInput) {
                        const now = new Date();
                        setDepartureInput(
                          `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
                        );
                        setDepartureAdjusted(true);
                      }
                    }}
                    isDisabled={recommendLoading}
                  >
                    현재 시각 입력
                  </Button>
                  <span className={styles.chipDivider}>|</span>
                  <Button
                    variant="ghost"
                    className={styles.chip}
                    onPress={() => {
                      const base = departureInput
                        ? hhmmToMinutes(departureInput)
                        : (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
                      setDepartureInput(minutesToHhmm(base + 5));
                      setDepartureAdjusted(true);
                    }}
                    isDisabled={recommendLoading}
                  >
                    +5분
                  </Button>
                  <Button
                    variant="ghost"
                    className={styles.chip}
                    onPress={() => {
                      const base = departureInput
                        ? hhmmToMinutes(departureInput)
                        : (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
                      setDepartureInput(minutesToHhmm(base + 10));
                      setDepartureAdjusted(true);
                    }}
                    isDisabled={recommendLoading}
                  >
                    +10분
                  </Button>
                  <Button
                    variant="ghost"
                    className={styles.chip}
                    onPress={() => {
                      const base = departureInput
                        ? hhmmToMinutes(departureInput)
                        : (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
                      setDepartureInput(minutesToHhmm(base - 5));
                      setDepartureAdjusted(true);
                    }}
                    isDisabled={recommendLoading}
                  >
                    -5분
                  </Button>
                </div>
                {departureInput && (
                  <Input
                    className={styles.timeInput}
                    type="time"
                    value={departureInput}
                    onChange={(e) => setDepartureInput(e.target.value)}
                    min="00:00"
                    max="23:59"
                    disabled={recommendLoading}
                  />
                )}
                <p className={styles.departureTimeHint}>
                  출발 시각을 바꾸면 비교표가 다시 계산돼요.
                </p>
              </div>
            )}
          </div>

          {/* 사용 중인 API/라이선스 정보 */}
          <div className={styles.apiInfo}>
            <p className={styles.apiInfoTitle}>현재 서비스에서 사용 중인 API</p>
            <ul className={styles.apiInfoList}>
              <li>주소/장소 검색 — Kakao REST API (카카오맵 주소검색·키워드검색)</li>
              <li>차량 경로·택시 ETA·요금 — 카카오모빌리티 Navi API (`/v1/directions`, `/v1/future/directions`)</li>
              <li>대중교통 소요시간 — ODsay 대중교통 길찾기 (1차) · 카카오맵 REST 대중교통 경로 존재 확인(최후단)</li>
              <li>현재 날씨(강수 여부) — KMA 초단기예보 (기상청, nx=61 ny=126)</li>
            </ul>
            <p className={styles.apiInfoNote}>
              각 서비스는 개별 이용약관·라이선스를 따르며, 무료로 제공되는 범위 내에서 사용합니다.<br />
              Tmap·TAGO(버스·지하철)는 코드상 준비되어 있으나, 현재 추천 흐름에선 직접 사용하지 않습니다.
            </p>
          </div>
        </main>
      </div>
    );
  }
