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
  const [usualTransitMinutes, setUsualTransitMinutes] = useState<string>('');
  const [preferredTimeA, setPreferredTimeA] = useState<string>('');
  const [preferredTimeB, setPreferredTimeB] = useState<string>('');
  const [prepMinutes, setPrepMinutes] = useState(5);
  const [taxiCallAddOn, setTaxiCallAddOn] = useState(false);
  const [taxiCallAddMinutes, setTaxiCallAddMinutes] = useState(0);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [departureInput, setDepartureInput] = useState('');
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
      setUsualTransitMinutes(String(p.usualTransitMinutes ?? ''));
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
      homeX: selectedHome.x,
      homeY: selectedHome.y,
      workName: selectedWork.name,
      workAddress: selectedWork.address,
      workX: selectedWork.x,
      workY: selectedWork.y,
      targetArrival,
      preferredTransport,
      usualTransitMinutes: usualTransitMinutes ? parseInt(usualTransitMinutes, 10) : undefined,
      preferredTimeA,
      preferredTimeB,
      prepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
    };
    saveProfile(p);
    setProfile(p);
    setOnboardStep('done');
    showMessage('프로필이 저장되었습니다.');
  }, [selectedHome, selectedWork, targetArrival, preferredTransport, usualTransitMinutes, preferredTimeA, preferredTimeB, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, showMessage]);

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

  // -----------------------------------------------------------------------
  // 렌더링
  // -----------------------------------------------------------------------

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 style={{ fontSize: '28px', maxWidth: '100%', marginBottom: '8px' }}>
            늦잠 잔 출근 아침의 5초 가치판단
          </h1>
          <p style={{ fontSize: '15px', maxWidth: '100%', marginBottom: '16px' }}>
            지금 출발하면 대중교통과 택시 중 뭐가 더 나을지, 준비 시간까지 반영해 비교해드려요.
          </p>

          {/* 프로필 요약 */}
          {profile && (
            <div className={styles.profileSummary}>
              <div>
                <strong>{profile.homeName}</strong> → <strong>{profile.workName}</strong>
                <br />
                <span className={styles.muted}>{profile.homeAddress} → {profile.workAddress}</span>
              </div>
              <div className={styles.profileMeta}>
                <span>목표 도착: {profile.targetArrival}</span>
                <span className={styles.dot}>·</span>
                <span>선호: {profile.preferredTransport}</span>
                <button className={styles.linkButton} onClick={clearProfileHandler}>초기화</button>
              </div>
            </div>
          )}

          {/* 밤새 추천 미리 노출 */}
          {showNightBefore && nightBeforeResult && (
            <div className={styles.nightBeforeCard}>
              <div className={styles.nightBeforeHeader}>
                <span>어제 밤 기준 내일 출발 추천</span>
                {profile && (
                  <button className={styles.linkButton} onClick={(e) => refreshNightBefore(false)} disabled={recommendLoading}>
                    {recommendLoading ? '새로고침 중…' : '새로고침'}
                  </button>
                )}
              </div>
              <div>
                <div>
                  <span className={styles.nightBeforeLabel}>타이트:</span>{' '}
                  <strong>{nightBeforeResult.tight.departureTime}</strong> 출발
                </div>
              </div>
              <div className={styles.nightBeforeNote}>{nightBeforeResult.tight.transportNote}</div>
              <div className={styles.nightBeforeNote}>{nightBeforeResult.tight.arrivalNote}</div>
              <div className={styles.nightBeforeDivider}></div>
              <div>
                <span className={styles.nightBeforeLabel}>여유:</span>{' '}
                <strong>{nightBeforeResult.loose.departureTime}</strong> 출발
              </div>
              <div className={styles.nightBeforeNote}>{nightBeforeResult.loose.transportNote}</div>
              <div className={styles.nightBeforeNote}>{nightBeforeResult.loose.arrivalNote}</div>
              <div className={styles.nightBeforeBottom}>{nightBeforeResult.note}</div>
            </div>
          )}

          {/* 온보딩 환영 */}
          {!profile && onboardStep === 'welcome' && (
            <div className={styles.welcomeCard}>
              <p>처음 방문이신가요?</p>
              <button className={styles.primaryButton} onClick={goToOnboarding}>
                프로필 입력하기
              </button>
              <p className={styles.muted} style={{ marginTop: '12px' }}>
                집과 출근지 위치, 목표 도착 시각을 입력하면 바로 비교 추천을 받을 수 있어요.
              </p>
            </div>
          )}

          {/* 온보딩 단계 */}
          {onboardStep !== 'welcome' && onboardStep !== 'done' && profile === null && (
            <div className={styles.onboardingCard}>
              <div className={styles.onboardingSteps}>
                {['집 위치', '출근지 위치', '목표 도착 시각', '선호 교통수단'].map((label, i) => (
                  <div key={label} className={`${styles.onboardingStep} ${i <= ['home', 'work', 'time', 'prefs'].indexOf(onboardStep) ? styles.onboardingStepActive : ''}`}>
                    {label}
                  </div>
                ))}
              </div>

              {onboardStep === 'home' && (
                <div className={styles.onboardingSection}>
                  <label className={styles.fieldLabel}>집 위치 (검색 후 선택)</label>
                  <div className={styles.searchRow}>
                    <input
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
                    <button className={styles.searchButton} onClick={() => doSearch(searchQuery, false, setSelectedHome, setHomeCoords)} disabled={searching || !searchQuery.trim()}>
                      {searching ? '검색 중…' : '검색'}
                    </button>
                  </div>
                  {searchError && <div className={styles.errorText}>{searchError}</div>}
                  {searchResults.length > 0 && (
                    <ul className={styles.searchResults}>
                      {searchResults.map((r, i) => (
                        <li key={i} className={styles.searchResultItem}>
                          <button className={styles.searchResultButton} onClick={() => {
                            setSelectedHome(r);
                            setHomeCoords(null);
                            setSearchResults([]);
                            setSearchError(null);
                          }}>
                            <strong>{r.name}</strong>
                            <br />
                            <span className={styles.muted}>{r.address}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedHome && (
                    <div className={styles.selectedItem}>
                      선택된 집: <strong>{selectedHome.name}</strong> ({selectedHome.address})
                    </div>
                  )}
                  <button className={styles.nextButton} onClick={() => setOnboardStep('work')} disabled={!selectedHome}>
                    다음: 출근지 위치
                  </button>
                </div>
              )}

              {onboardStep === 'work' && (
                <div className={styles.onboardingSection}>
                  <label className={styles.fieldLabel}>출근지 위치 (검색 후 선택)</label>
                  <div className={styles.searchRow}>
                    <input
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
                    <button className={styles.searchButton} onClick={() => doSearch(searchQuery, false, setSelectedWork, setWorkCoords)} disabled={searching || !searchQuery.trim()}>
                      {searching ? '검색 중…' : '검색'}
                    </button>
                  </div>
                  {searchError && <div className={styles.errorText}>{searchError}</div>}
                  {searchResults.length > 0 && (
                    <ul className={styles.searchResults}>
                      {searchResults.map((r, i) => (
                        <li key={i} className={styles.searchResultItem}>
                          <button className={styles.searchResultButton} onClick={() => {
                            setSelectedWork(r);
                            setWorkCoords(null);
                            setSearchResults([]);
                            setSearchError(null);
                          }}>
                            <strong>{r.name}</strong>
                            <br />
                            <span className={styles.muted}>{r.address}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedWork && (
                    <div className={styles.selectedItem}>
                      선택된 출근지: <strong>{selectedWork.name}</strong> ({selectedWork.address})
                    </div>
                  )}
                  <div className={styles.onboardingNav}>
                    <button className={styles.backButton} onClick={() => setOnboardStep('home')}>뒤로</button>
                    <button className={styles.nextButton} onClick={() => setOnboardStep('time')} disabled={!selectedWork}>
                      다음: 목표 도착 시각
                    </button>
                  </div>
                </div>
              )}

              {onboardStep === 'time' && (
                <div className={styles.onboardingSection}>
                  <label className={styles.fieldLabel}>목표 도착 시각 (HH:MM)</label>
                  <input
                    className={styles.timeInput}
                    type="time"
                    value={targetArrival}
                    onChange={(e) => setTargetArrival(e.target.value)}
                    min="00:00"
                    max="23:59"
                  />
                  <div className={styles.onboardingNav}>
                    <button className={styles.backButton} onClick={() => setOnboardStep('work')}>뒤로</button>
                    <button className={styles.nextButton} onClick={() => setOnboardStep('prefs')}>
                      다음: 선호 교통수단
                    </button>
                  </div>
                </div>
              )}

              {onboardStep === 'prefs' && (
                <div className={styles.onboardingSection}>
                  <label className={styles.fieldLabel}>평소 선호 교통수단</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radio}>
                      <input type="radio" name="pref" value="subway" checked={preferredTransport === 'subway'} onChange={(e) => setPreferredTransport(e.target.value as Transport)} />
                      지하철 위주
                    </label>
                    <label className={styles.radio}>
                      <input type="radio" name="pref" value="bus" checked={preferredTransport === 'bus'} onChange={(e) => setPreferredTransport(e.target.value as Transport)} />
                      버스 위주
                    </label>
                    <label className={styles.radio}>
                      <input type="radio" name="pref" value="any" checked={preferredTransport === 'any'} onChange={(e) => setPreferredTransport(e.target.value as Transport)} />
                      상관없음
                    </label>
                  </div>
                  <label className={styles.fieldLabel}>
                    평소 평균 이동 소요 시간 (분, 선택)
                    <input
                      className={styles.numberInput}
                      type="number"
                      min="1"
                      max="300"
                      value={usualTransitMinutes}
                      onBlur={(e) => setUsualTransitMinutes(e.target.value)}
                      placeholder="예: 30"
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    전날 밤 선호 출발 시각 A (타이트, HH:MM, 선택)
                    <input
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
                    <input
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
                    <button className={styles.backButton} onClick={() => setOnboardStep('time')}>뒤로</button>
                    <button className={styles.primaryButton} onClick={saveProfileHandler}>프로필 저장</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 프로필 완료 후: 바로 추천 영역 */}
          {profile && onboardStep === 'done' && (
            <div className={styles.recommendArea}>
              <div className={styles.recommendControls}>
                <button className={styles.primaryButton} onClick={runRecommend} disabled={recommendLoading}>
                  {recommendLoading ? '계산 중…' : '지금 출발 계산'}
                </button>
                <div className={styles.departureTimeRow}>
                  <span className={styles.label}>출발 시각:</span>
                  <div className={styles.chipRow}>
                    <button className={styles.chip} onClick={() => setDepartureInput((d) => '')}>
                      지금
                    </button>
                    <button className={styles.chip} onClick={() => {
                      if (!departureInput) {
                        const now = new Date();
                        setDepartureInput(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
                      }
                    }}>
                      현재 시각 입력
                    </button>
                  </div>
                  {departureInput && (
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={departureInput}
                      onChange={(e) => setDepartureInput(e.target.value)}
                      min="00:00"
                      max="23:59"
                    />
                  )}
                </div>
                <div className={styles.departureTimeHint}>
                  출발 시각을 바꾸면 비교표가 다시 계산돼요.
                </div>
              </div>

              {/* 비교표 */}
              {recommendResult && (
                <div className={styles.compareCard}>
                  <div className={styles.compareHeader}>
                    <span>현재 시각 기준: {recommendResult.nowTime}</span>
                    <span className={styles.muted}>목표 도착: {recommendResult.targetArrival}</span>
                  </div>

                  {/* 날씨 정보 */}
                  {recommendResult.weather && (
                    <div className={`${styles.weatherAlert} ${recommendResult.weather.isRaining ? styles.weatherAlertRain : styles.weatherAlertClear}`}>
                      <span className={styles.weatherIcon}>
                        {recommendResult.weather.isRaining ? '☔' : '☀️'}
                      </span>
                      <span>{recommendResult.weather.note}</span>
                    </div>
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
                        <button className={styles.taxiLinkButton} onClick={() => {
                          window.location.href = 'kakaot://';
                        }}>
                          카카오T 앱 열기
                        </button>
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

                  {/* 미래 운행 정보: 3개 후보 출발 시각 기준 차량 ETA (P1-6) */}
                  {recommendResult.taxiFuture && recommendResult.taxiFuture.departureTimes.length > 0 && (() => {
                    const tf = recommendResult.taxiFuture!;
                    return (
                      <div className={styles.futureCard}>
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
                      </div>
                    );
                  })()}
                </div>
              )}

              {recommendError && (
                <div className={styles.errorText}>{recommendError}</div>
              )}

              {!recommendResult && !recommendLoading && !recommendError && (
                <div className={styles.hint}>
                  위 버튼을 누르면 현재 시각 기준으로 교통비·준비 시간을 반영한 비교표가 나와요.
                </div>
              )}

              {/* 전날 밤 추천 새로고침 (이미 위에 표시된 경우) */}
              {!showNightBefore && profile && (
                <div className={styles.nightBeforeTrigger}>
                  <button className={styles.secondaryButton} onClick={(e) => refreshNightBefore(false)} disabled={recommendLoading}>
                    {recommendLoading ? '새로고침 중…' : '전날 밤 추천 새로고침'}
                  </button>
                  <span className={styles.muted}>오후 4시 이후 접속 시 자동으로 전날 밤 추천이 표시돼요.</span>
                </div>
              )}
            </div>
          )}

          {/* 고급 설정 */}
          {profile && onboardStep === 'done' && (
            <div className={styles.advancedCard}>
              <button className={styles.advancedToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? '고급 설정 접기' : '고급 설정 펼치기'}
              </button>
              {showAdvanced && (
                <div className={styles.advancedForm}>
                  <label className={styles.fieldLabel}>
                    공통 준비 시간 (분, 기본 5분)
                    <input
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
                      <input
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
                  <button className={styles.secondaryButton} onClick={() => {
                    saveProfile({ ...profile, prepMinutes, taxiCallAddOn, taxiCallAddMinutes });
                    setProfile({ ...profile, prepMinutes, taxiCallAddOn, taxiCallAddMinutes });
                    showMessage('고급 설정이 저장되었습니다.');
                  }}>
                    설정 저장
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 메시지 */}
          {message && (
            <div className={styles.message}>{message}</div>
          )}
        </div>
      </main>
    </div>
  );
}
