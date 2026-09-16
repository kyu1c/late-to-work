'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@heroui/styles';
import {
  Button,
  Input,
  Card,
  Checkbox,
  Label,
  Table,
  Alert,
} from '@heroui/react';
import { useTheme } from 'next-themes';
import { parseTime } from '@internationalized/date';
import { Header } from './components/Header';
import { ProfileSummaryCard } from './components/ProfileCard';
import { OnboardingCard } from './components/OnboardingCard';
import { NightBeforeCard } from './components/NightBeforeCard';
import { DepartureControl } from './components/DepartureControl';
import { RecommendResultCard } from './components/RecommendResultCard';
import { NowStatusCard } from './components/NowStatusCard';
import { transitChain } from '@/lib/transitChain';
import { taxiChain } from '@/lib/taxiChain';
import { kmaUltraShortSnapshot } from '@/lib/api/kma';
import { NaviDirectionsParams } from '@/lib/api/navi';
import type { Profile, AddressSearchResult, RecommendResponse, NightBeforeResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// 타입 (lib/types와 동일 — 여기서는 화면 전용으로 재선언)
// ---------------------------------------------------------------------------

type Transport = 'subway' | 'bus' | 'any';

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

function loadNightBefore(): { result: NightBeforeResponse | null; date: string | null } {
  try {
    const raw = localStorage.getItem(NIGHT_BEFORE_KEY);
    const dateRaw = localStorage.getItem(NIGHT_BEFORE_DATE_KEY);
    if (!raw || !dateRaw) return { result: null, date: null };
    const result = JSON.parse(raw) as NightBeforeResponse;
    return { result, date: dateRaw };
  } catch {
    return { result: null, date: null };
  }
}

function saveNightBefore(result: NightBeforeResponse, date: string) {
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

// HH:MM[:SS] 또는 "오전/오후 HH:MM" 문자열을 분 단위 숫자로 변환
function parseAmPmToMinutes(t: string): number {
  let m = t.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    const isPm = m[1] === '오후';
    const totalHour = isPm ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    return totalHour * 60 + minute;
  }
  m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    return hour * 60 + minute;
  }
  return 0;
}

// HH:MM 문자열을 분 단위 숫자로 변환
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

async function fetchRecommend(body: Record<string, unknown>): Promise<{ ok: boolean; result?: RecommendResponse; error?: string }> {
  try {
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '추천 API 호출 중 오류가 발생했습니다.',
    };
  }
}

async function fetchNightBefore(body: Record<string, unknown>): Promise<{ ok: boolean; result?: NightBeforeResponse; error?: string }> {
  try {
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '밤 추천 API 호출 중 오류가 발생했습니다.',
    };
  }
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

type OnboardStep = 'welcome' | 'home' | 'work' | 'time' | 'prefs' | 'done';

export default function Home() {
  const { resolvedTheme } = useTheme();
  const [activeTheme] = useState<'dark' | 'light'>(resolvedTheme === 'dark' ? 'dark' : 'light');

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
  const [departureInput, setDepartureInput] = useState('');
  const [departureAdjusted, setDepartureAdjusted] = useState(false);
  const [recommendResult, setRecommendResult] = useState<RecommendResponse | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [nightBeforeResult, setNightBeforeResult] = useState<NightBeforeResponse | null>(null);
  const [showNightBefore, setShowNightBefore] = useState(false);
  const [transitPreview, setTransitPreview] = useState<{ durationMinutes: number | null; source: string } | null>(null);
  const [transitPreviewLoading, setTransitPreviewLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 프로필 로드
  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (p) {
      setOnboardStep('done');
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

  // 메시지 자동 사라짐
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }, []);

  // 주소 검색
  // OnboardingCard와 시그니처 통일: 모든 파라미터 선택적, 내부에서는 제공된 것만 사용
  const doSearch = useCallback(async (query: string, preferAddress?: boolean, setter?: (r: AddressSearchResult | null) => void, coordSetter?: (c: { x: number; y: number } | null) => void) => {
    if (!query.trim()) {
      setter?.(null);
      coordSetter?.(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const res = await searchAddress(query, preferAddress ?? false);
    setSearching(false);
    if (!res.ok) {
      setSearchError(res.error ?? '검색에 실패했습니다.');
      setSearchResults([]);
      return;
    }
    setSearchResults(res.results);
    if (res.results.length > 0) {
      const first = res.results[0];
      setter?.(first);
      if (first.x != null && first.y != null) {
        coordSetter?.({ x: first.x, y: first.y });
      } else {
        coordSetter?.(null);
      }
    } else {
      setter?.(null);
      coordSetter?.(null);
    }
  }, []);

  // coords 재검색 헬퍼 (프로필에 이름만 있고 coords가 없을 때)
  const resolveCoords = useCallback(async (name: string, preferAddress = true): Promise<{ x: number; y: number } | null> => {
    if (!name) return null;
    const res = await searchAddress(name, preferAddress);
    if (res.ok && res.results.length > 0 && res.results[0].x != null && res.results[0].y != null) {
      return { x: res.results[0].x, y: res.results[0].y };
    }
    return null;
  }, []);

  // coords 확정 시 대중교통 소요시간 미리 계산 (OnboardingCard 이동소요예상 표시용)
  useEffect(() => {
    if (!homeCoords || !workCoords) {
      setTransitPreview(null);
      setTransitPreviewLoading(false);
      return;
    }
    setTransitPreviewLoading(true);
    (async () => {
      const result = await transitChain(homeCoords.x, homeCoords.y, workCoords.x, workCoords.y);
      setTransitPreview({
        durationMinutes: result.durationMinutes,
        source: result.source,
      });
      setTransitPreviewLoading(false);
    })();
  }, [homeCoords, workCoords]);

  // 추천 실행
  const runRecommend = useCallback(async () => {
    if (!profile) {
      setRecommendError('프로필이 없습니다. 프로필을 먼저 완료해주세요.');
      setMessage('프로필이 없습니다. 프로필을 먼저 완료해주세요.');
      return;
    }

    // coords가 없으면 프로필에 저장된 주소로 재검색
    let effectiveHomeCoords = homeCoords;
    let effectiveWorkCoords = workCoords;

    if (!homeCoords && profile.homeName) {
      const coords = await resolveCoords(profile.homeName, true);
      if (coords) effectiveHomeCoords = coords;
    }
    if (!workCoords && profile.workName) {
      const coords = await resolveCoords(profile.workName, true);
      if (coords) effectiveWorkCoords = coords;
    }

    if (!effectiveHomeCoords || !effectiveWorkCoords) {
      setRecommendError('집과 출근지 위치가 필요합니다. 프로필 수정에서 위치를 다시 선택해주세요.');
      setMessage('집과 출근지 위치를 확인할 수 없습니다. 프로필을 수정해주세요.');
      return;
    }
    if (!targetArrival || !targetArrival.trim()) {
      setRecommendError('목표 도착 시각이 필요합니다. 프로필을 수정해주세요.');
      setMessage('목표 도착 시각이 필요합니다. 프로필을 수정해주세요.');
      return;
    }
    setMessage('추천을 계산하고 있어요…');
    setRecommendLoading(true);
    setRecommendError(null);
    setRecommendResult(null);

    const body: Record<string, unknown> = {
      startX: effectiveHomeCoords.x,
      startY: effectiveHomeCoords.y,
      endX: effectiveWorkCoords.x,
      endY: effectiveWorkCoords.y,
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
  }, [profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, departureInput, resolveCoords]);

  // 프로필 완료(done) 상태 진입 시 자동 추천 실행
  // runRecommend 내부에서 coords 재검색까지 처리하므로 단순히 호출만 함
  useEffect(() => {
    if (onboardStep === 'done' && profile) {
      runRecommend();
    }
  }, [onboardStep, profile, runRecommend]);

  // runRecommend 성공 후 밤 추천도 함께 생성
  const runRecommendAndRefresh = useCallback(async () => {
    // 1. 실시간 추천 실행
    if (!profile) {
      setRecommendError('프로필이 없습니다. 프로필을 먼저 완료해주세요.');
      return;
    }
    let effectiveHomeCoords = homeCoords;
    let effectiveWorkCoords = workCoords;
    if (!homeCoords && profile.homeName) {
      const coords = await resolveCoords(profile.homeName, true);
      if (coords) effectiveHomeCoords = coords;
    }
    if (!workCoords && profile.workName) {
      const coords = await resolveCoords(profile.workName, true);
      if (coords) effectiveWorkCoords = coords;
    }
    if (!effectiveHomeCoords || !effectiveWorkCoords) {
      setRecommendError('집과 출근지 위치가 필요합니다. 프로필 수정에서 위치를 다시 선택해주세요.');
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
      startX: effectiveHomeCoords.x,
      startY: effectiveHomeCoords.y,
      endX: effectiveWorkCoords.x,
      endY: effectiveWorkCoords.y,
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

    // 2. 실시간 추천 성공 시 밤 추천도 함께 생성
    if (res.result && res.result.transit.durationMinutes != null && res.result.taxi.vehicleEtaMinutes != null) {
      // coords 재사용 (이미 위에서 가져옴)
      setRecommendLoading(true);
      const nbBody: Record<string, unknown> = {
        startX: effectiveHomeCoords.x,
        startY: effectiveHomeCoords.y,
        endX: effectiveWorkCoords.x,
        endY: effectiveWorkCoords.y,
        targetArrival,
        sharedPrepMinutes: prepMinutes,
        taxiCallAddOn,
        taxiCallAddMinutes,
        transitDurationMinutes: res.result.transit.durationMinutes ?? typeof usualTransitMinutes === 'number' ? usualTransitMinutes : undefined,
        transitTransfers: res.result.transit.transfers,
        transitDistanceMeters: res.result.transit.distanceMeters,
        taxiVehicleEtaMinutes: res.result.taxi.vehicleEtaMinutes,
        taxiFare: res.result.taxi.taxiFare,
        isRaining: res.result.weather?.isRaining ?? false,
        weekday: new Date().getDay(),
        preferTransport: profile.preferredTransport,
      };
      const nbRes = await fetchNightBefore(nbBody);
      setRecommendLoading(false);
      if (nbRes.ok) {
        const nb = nbRes.result!;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        saveNightBefore(nb, `${yyyy}-${mm}-${dd}`);
        setNightBeforeResult(nb);
        setShowNightBefore(true);
      }
    }
  }, [profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, departureInput, resolveCoords, setRecommendResult, setNightBeforeResult, setShowNightBefore, setRecommendError, setRecommendLoading]);

  // 전날 밤 추천 새로고침
  const refreshNightBefore = useCallback(async (silent = false) => {
    if (!profile || !profile.homeName || !profile.workName) {
      if (!silent) showMessage('집과 출근지 위치 정보가 필요합니다.');
      return;
    }
    // coords가 없으면 프로필 이름으로 재검색
    let homeCoordsNow = homeCoords;
    let workCoordsNow = workCoords;
    if (!homeCoordsNow) {
      homeCoordsNow = await resolveCoords(profile.homeName, true);
    }
    if (!workCoordsNow) {
      workCoordsNow = await resolveCoords(profile.workName, true);
    }
    if (!homeCoordsNow || !workCoordsNow) {
      if (!silent) showMessage('위치 정보를 다시 가져오는 데 실패했습니다. 프로필 수정에서 위치를 다시 선택해주세요.');
      return;
    }

    setRecommendLoading(true);
    // recommendResult가 없어도 coords만으로 transitChain/taxiChain을 직접 호출하여 값 생성
    let transitDurationMinutes = recommendResult?.transit.durationMinutes;
    let transitTransfers = recommendResult?.transit.transfers;
    let transitDistanceMeters = recommendResult?.transit.distanceMeters;
    let taxiVehicleEtaMinutes = recommendResult?.taxi.vehicleEtaMinutes;
    let taxiFare = recommendResult?.taxi.taxiFare;
    let isRaining = recommendResult?.weather?.isRaining ?? false;
    if (!recommendResult || recommendResult.transit.durationMinutes == null || recommendResult.taxi.vehicleEtaMinutes == null) {
      // transitChain 직접 호출
      const transitRes = await transitChain(homeCoordsNow.x, homeCoordsNow.y, workCoordsNow.x, workCoordsNow.y);
      transitDurationMinutes = transitRes.durationMinutes;
      transitTransfers = transitRes.transfers;
      transitDistanceMeters = transitRes.distanceMeters;
      // taxiChain 직접 호출
      const taxiParams: NaviDirectionsParams = {
        originLon: homeCoordsNow.x,
        originLat: homeCoordsNow.y,
        destLon: workCoordsNow.x,
        destLat: workCoordsNow.y,
      };
      const taxiRes = await taxiChain(taxiParams);
      taxiVehicleEtaMinutes = taxiRes.vehicleEtaMinutes;
      taxiFare = taxiRes.taxiFare;
      // 날씨 정보: KMA 초단기예보는 서버 전용 API이므로 여기서는 false로 기본값 사용
      // (night-before API 라우트에서 필요시 KMA 호출을 추가할 수 있음)
      isRaining = false;
    }
    const body: Record<string, unknown> = {
      startX: homeCoordsNow.x,
      startY: homeCoordsNow.y,
      endX: workCoordsNow.x,
      endY: workCoordsNow.y,
      targetArrival,
      sharedPrepMinutes: prepMinutes,
      taxiCallAddOn,
      taxiCallAddMinutes,
      transitDurationMinutes,
      transitTransfers,
      transitDistanceMeters,
      taxiVehicleEtaMinutes,
      taxiFare,
      isRaining,
      weekday: new Date().getDay(),
      preferTransport: profile.preferredTransport,
    };
    const res = await fetchNightBefore(body);
    setRecommendLoading(false);
    if (!res.ok) {
      if (!silent) showMessage('전날 밤 추천을 새로고침할 수 없습니다.');
      return;
    }
    // recommendResult 유무와 관계없이, 위에서 transitChain/taxiChain을 직접 호출하여 값을 생성했으므로
    // 응답 성공 시 바로 저장
    const nb = res.result!;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    saveNightBefore(nb, `${yyyy}-${mm}-${dd}`);
    setNightBeforeResult(nb);
    setShowNightBefore(true);
    if (!silent) showMessage('전날 밤 추천이 새로고침되었습니다.');
  }, [profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, recommendResult, showMessage, resolveCoords]);

  // 전날 밤 추천 자동 상태 관리
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
    setRecommendError(null);
    setOnboardStep('done');
    showMessage('프로필이 저장되었습니다. 추천 결과를 계산하고 있어요...');
    runRecommend();
  }, [selectedHome, selectedWork, targetArrival, preferredTransport, usualTransitMinutes, preferredTimeA, preferredTimeB, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, showMessage, runRecommend]);

  // 프로필 저장 완료 후 자동 추천 실행
  useEffect(() => {
    if (onboardStep === 'done' && profile) {
      runRecommend();
    }
  }, [onboardStep, profile, runRecommend]);

  // 'prefs' 단계에서 transitPreview가 없으면 대중교통 소요시간 재계산 (OnboardingCard 이동소요예상 표시용)
  useEffect(() => {
    if (onboardStep !== 'prefs') return;
    if (!homeCoords || !workCoords) return;
    if (transitPreview != null) return;
    setTransitPreviewLoading(true);
    (async () => {
      const result = await transitChain(homeCoords.x, homeCoords.y, workCoords.x, workCoords.y);
      setTransitPreview({
        durationMinutes: result.durationMinutes,
        source: result.source,
      });
      setTransitPreviewLoading(false);
    })();
  }, [onboardStep, homeCoords, workCoords, transitPreview]);

  // 실시간 추천 결과가 새로 생기면 밤 추천도 생성 시도
  useEffect(() => {
    if (!recommendResult) return;
    if (nightBeforeResult) return;

    const runNightBefore = async () => {
      if (!profile || !profile.homeName || !profile.workName) return;

      let homeCoordsNow = homeCoords;
      let workCoordsNow = workCoords;
      if (!homeCoordsNow) {
        homeCoordsNow = await resolveCoords(profile.homeName, true);
      }
      if (!workCoordsNow) {
        workCoordsNow = await resolveCoords(profile.workName, true);
      }
      if (!homeCoordsNow || !workCoordsNow) return;

      const transitDurationMinutes = recommendResult.transit.durationMinutes ?? typeof usualTransitMinutes === 'number' ? usualTransitMinutes : undefined;
      const transitTransfers = recommendResult.transit.transfers;
      const transitDistanceMeters = recommendResult.transit.distanceMeters;
      const taxiVehicleEtaMinutes = recommendResult.taxi.vehicleEtaMinutes;
      const taxiFare = recommendResult.taxi.taxiFare;
      const isRaining = recommendResult.weather?.isRaining ?? false;

      const nbBody: Record<string, unknown> = {
        startX: homeCoordsNow.x,
        startY: homeCoordsNow.y,
        endX: workCoordsNow.x,
        endY: workCoordsNow.y,
        targetArrival,
        sharedPrepMinutes: prepMinutes,
        taxiCallAddOn,
        taxiCallAddMinutes,
        transitDurationMinutes,
        transitTransfers,
        transitDistanceMeters,
        taxiVehicleEtaMinutes,
        taxiFare,
        isRaining,
        weekday: new Date().getDay(),
        preferTransport: profile.preferredTransport,
      };

      const nbRes = await fetchNightBefore(nbBody);
      if (nbRes.ok && nbRes.result) {
        const nb = nbRes.result;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        saveNightBefore(nb, `${yyyy}-${mm}-${dd}`);
        setNightBeforeResult(nb);
        setShowNightBefore(true);
      }
    };

    runNightBefore();
  }, [recommendResult, nightBeforeResult, profile, homeCoords, workCoords, targetArrival, prepMinutes, taxiCallAddOn, taxiCallAddMinutes, resolveCoords, fetchNightBefore, saveNightBefore, setNightBeforeResult, setShowNightBefore]);

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

  // 취소: 온보딩만 종료하고 프로필 상태 유지 → welcome 화면으로
  // 프로필이 있으면 저장된 정보 화면이 보이도록 (welcome 블록은 profile 없을 때만 표시)
  const cancelOnboarding = useCallback(() => {
    setOnboardStep('welcome');
    setSearchResults([]);
    setSearchError(null);
    setSearchQuery('');
    // 프로필이 있으면 메인 화면(저장된 정보)이 보이도록 onboardStep을 done으로 설정
    if (profile) {
      setOnboardStep('done');
    }
  }, [profile]);

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

  const now = new Date();
  const nowTimeString = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 현재 시각 기준 상태 판단 (아침 재추천 영역 상단 안내용)
  const nowMinutesForStatus = parseAmPmToMinutes(nowTimeString);
  const targetMinutesForStatus = parseAmPmToMinutes(targetArrival);
  const statusDiffMinutes = targetMinutesForStatus - nowMinutesForStatus;

  let morningStatus: 'normal' | 'late-should-adjust' | 'after-workhours';
  if (statusDiffMinutes < 0) {
    morningStatus = 'after-workhours';
  } else if (statusDiffMinutes <= 60) {
    morningStatus = 'late-should-adjust';
  } else {
    morningStatus = 'normal';
  }

  return (
    <div className="min-h-screen bg-background">
      <main className={cn('container', 'mx-auto', 'max-w-md', 'px-4', 'py-6')}>
        {/* Header */}
        <Header />

        {/* ================================================================
 랜딩 페이지: 상단 소개 영역 (신규)
 ================================================================ */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-2">늦잠 잔 출근 아침의 5초 가치판단</h1>
          <p className="text-sm text-muted-foreground mt-2">
            지금 출발하면 대중교통과 택시 중 뭐가 더 나을지, 준비 시간까지 반영해 비교해드려요.
          </p>
        </div>

        {/* ================================================================
 저장된 정보 영역 (프로필 있음)
 ================================================================ */}
        {profile && (
          <div className="mb-5">
            <ProfileSummaryCard profile={profile} onEdit={editProfileHandler} onClear={clearProfileHandler} />
            {/* coordsWarning — coords가 없을 때만 */}
            {(!homeCoords || !workCoords) && (
              <div className="flex items-center gap-2 bg-secondary/50 p-3 rounded-lg mt-3 text-sm">
                <span>위치 정보가 불완전해요. 프로필을 수정해서 집·출근지 좌표를 다시 선택해주세요.</span>
                <Button variant="ghost" size="sm" onPress={editProfileHandler}>
                  프로필 수정하기
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================
 온보딩 환영 (프로필 없음 + welcome 단계)
 — HeroUI Card의 Header/Content/Footer 슬롯 활용
 ================================================================ */}
        {!profile && onboardStep === 'welcome' && (
          <Card className="w-full">
            <Card.Header className="mb-4">
              <Card.Title className="text-xl font-semibold">처음 방문이신가요?</Card.Title>
            </Card.Header>
            <Card.Content >
              <p className="text-sm text-muted-foreground">
                집과 출근지 위치, 목표 도착 시각을 입력하면 바로 비교 추천을 받을 수 있어요.
              </p>
              <div className="flex justify-center mt-4">
                <Button
                  variant="primary"
                  onPress={goToOnboarding}
                  className="w-full"
                >
                  프로필 설정하기
                </Button>
              </div>
            </Card.Content>
            <Card.Footer className="pt-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  isDisabled
                  className="w-full"
                >
                  바로 검색하기
                </Button>
                <p className="text-xs text-muted-foreground">
                  프로필을 먼저 입력해주세요
                </p>
              </div>
            </Card.Footer>
          </Card>
        )}

        {/* ================================================================
 온보딩 (OnboardingCard에 완전 위임)
 ================================================================ */}
        {onboardStep !== 'welcome' && onboardStep !== 'done' && (
          <OnboardingCard
            onboardStep={onboardStep as 'home' | 'work' | 'time' | 'prefs'}
            setOnboardStep={setOnboardStep}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            searchError={searchError}
            setSearchError={setSearchError}
            searching={searching}
            selectedHome={selectedHome}
            setSelectedHome={setSelectedHome}
            selectedWork={selectedWork}
            setSelectedWork={setSelectedWork}
            homeCoords={homeCoords}
            setHomeCoords={setHomeCoords}
            workCoords={workCoords}
            setWorkCoords={setWorkCoords}
            targetArrival={targetArrival}
            setTargetArrival={setTargetArrival}
            preferredTransport={preferredTransport}
            setPreferredTransport={setPreferredTransport}
            usualTransitMinutes={usualTransitMinutes}
            setUsualTransitMinutes={setUsualTransitMinutes}
            doSearch={doSearch}
            cancelOnboarding={cancelOnboarding}
            saveProfileHandler={saveProfileHandler}
            recommendResult={recommendResult}
            transitPreview={transitPreview}
            transitPreviewLoading={transitPreviewLoading}
          />
        )}

        {/* ================================================================
 프로필 완료 후: 전날 밤 추천 + 아침 재추천
 ================================================================ */}
        {profile && onboardStep === 'done' && (
          <>
            {/* 현재 시간 기준 안내 — 목표 도착 시각 대비 현재 시각 상태 */}
            <div className="mb-5">
              {recommendResult ? (
                <NowStatusCard
                  nowTimeString={nowTimeString}
                  targetArrival={targetArrival}
                  recommendResult={recommendResult}
                />
              ) : (
                <div className="flex flex-col gap-3 p-4 bg-surface-secondary rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Label className="font-medium">현재 시각</Label>
                    <span className="text-foreground">{nowTimeString}</span>
                    <span className="text-muted-foreground">→</span>
                    <Label className="font-medium">목표 도착</Label>
                    <span className="text-foreground">{targetArrival}</span>
                    <span className="text-muted-foreground">(잔여 {parseAmPmToMinutes(targetArrival) - parseAmPmToMinutes(nowTimeString)}분)</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    저장 후 추천을 계산하는 중이에요. 잠시만 기다려 주세요.
                  </p>
                </div>
              )}
            </div>

            {/* 전날 밤 추천 영역 */}
            {showNightBefore && nightBeforeResult && (
              <div className="mb-5">
                <NightBeforeCard
                  nightBeforeResult={nightBeforeResult}
                  loading={recommendLoading}
                  onRefresh={() => refreshNightBefore(false)}
                />
              </div>
            )}

            {/* 아침 재추천 영역 */}
            <div className="mb-5">
              {/* ── 상단: 현재 시각 / 목표 도착 / 잔여 시간 (공통, 항상 표시) ── */}
              <div className="p-4 bg-surface-secondary rounded-lg mb-4">
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">현재 시각</Label>
                    <span className="text-foreground">{nowTimeString}</span>
                    <span className="text-muted-foreground">→</span>
                    <Label className="font-medium">목표 도착</Label>
                    <span className="text-foreground">{targetArrival}</span>
                    <span className="text-muted-foreground">(잔여 {statusDiffMinutes}분)</span>
                  </div>
                </div>
              </div>

              {/* ── 상태별 안내 + 내용 ── */}
              {morningStatus === 'after-workhours' && (
                <Card className="w-full">
                  <Card.Content className="flex flex-col gap-3 p-4 text-center">
                    <div className="text-lg font-semibold text-destructive">출근 시간을 조정해 주세요</div>
                    <p className="text-sm text-muted-foreground">
                      현재 시각({nowTimeString})은 목표 도착({targetArrival})보다 {Math.abs(statusDiffMinutes)}분 지났어요.
                      출근 시간을 늦추거나 일정을 조정해주세요.
                    </p>
                  </Card.Content>
                </Card>
              )}

              {morningStatus === 'late-should-adjust' && (
                <>
                  {/* 출근 시간 이후 안내 + 택시 vs 대중교통 비교 */}
                  <Card className="w-full">
                    <Card.Content className="flex flex-col gap-4 p-4">
                      <Alert status="warning" className="w-full">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>출근 시간 이후입니다</Alert.Title>
                          <Alert.Description>
                            현재 시각({nowTimeString}) 기준 목표 도착({targetArrival})까지 약 {statusDiffMinutes}분 남았어요.
                            출근 시간 이후라 평소처럼 출발하기엔 촉박할 수 있어요.
                            그래도 출근이 필요하다면 아래 정보를 참고하세요.
                          </Alert.Description>
                        </Alert.Content>
                      </Alert>

                      {/* 택시 vs 대중교통 비교 (recommendResult 있을 때만) */}
                      {recommendResult && (
                        <>
                          {/* 택시가 대중교통보다 빠른 시간 */}
                          {recommendResult.comparison.faster === 'taxi' && recommendResult.comparison.fasterMinutes > 0 && (
                            <div className="p-3 bg-surface-secondary rounded-md">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">택시가 더 빠른 시간</span>
                              <p className="text-lg font-semibold mt-1">약 {recommendResult.comparison.fasterMinutes}분</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                택시 {recommendResult.comparison.taxi.totalMinutes}분 vs 대중교통 {recommendResult.comparison.public.totalMinutes}분
                              </p>
                            </div>
                          )}

                          {/* 택시 총 소요 시간 + 도착 예상 */}
                          {recommendResult.taxi && recommendResult.taxi.vehicleEtaMinutes != null && (
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="p-3 bg-surface-secondary rounded-md">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 총 소요 시간</span>
                                <p className="text-lg font-semibold mt-1">약 {recommendResult.comparison.taxi.totalMinutes}분</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  (이동 {recommendResult.taxi.vehicleEtaMinutes}분 + 준비 {recommendResult.comparison.taxi.prepMinutes}분)
                                </p>
                              </div>
                              <div className="p-3 bg-surface-secondary rounded-md">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 이용 시 도착 예상</span>
                                <p className="text-lg font-semibold mt-1">{recommendResult.comparison.taxi.arrivalTime}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  목표 도착 {targetArrival} 대비 {parseAmPmToMinutes(targetArrival) - parseAmPmToMinutes(recommendResult.comparison.taxi.arrivalTime) > 0 ? '더 일찍' : '늦게'} 도착
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 택시 예상 요금 */}
                          {recommendResult.taxi?.taxiFare != null && (
                            <div className="p-3 bg-surface-secondary rounded-md text-sm">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 예상 요금</span>
                              <p className="text-lg font-semibold mt-1">약 {recommendResult.taxi.taxiFare.toLocaleString('ko-KR')}원</p>
                            </div>
                          )}

                          {/* 대중교통 vs 택시 비교 표 */}
                          <div className="border-t border-border pt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Label className="font-medium text-sm">대중교통 vs 택시 비교</Label>
                            </div>
                            <div className="text-sm">
                              <div className="flex justify-between py-1 border-b border-border">
                                <span>교통편</span>
                                <span>출발 시각</span>
                                <span>총 소요</span>
                                <span>도착 예상</span>
                                <span>출처</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span>대중교통</span>
                                <span>{toAmPm(recommendResult.comparison.public.departureTime)}</span>
                                <span>약 {recommendResult.comparison.public.totalMinutes}분</span>
                                <span>{toAmPm(recommendResult.comparison.public.arrivalTime)}</span>
                                <span>{formatSource(recommendResult.transit.source, recommendResult.transit.note).label}</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span>택시</span>
                                <span>{toAmPm(recommendResult.comparison.taxi.departureTime)}</span>
                                <span>약 {recommendResult.comparison.taxi.totalMinutes}분</span>
                                <span>{toAmPm(recommendResult.comparison.taxi.arrivalTime)}</span>
                                <span>{formatSource(recommendResult.taxi.source, recommendResult.taxi.note).label}</span>
                              </div>
                            </div>
                          </div>

                          {/* 출발 시한 안내 */}
                          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-border">
                            <div className="p-3 bg-surface-secondary rounded-md">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">대중교통</span>
                              <p className="text-lg font-semibold mt-1">
                                {formatLatestDeparture(recommendResult.comparison.latest.public.latestDeparture, 5, nowMinutesForStatus)}
                              </p>
                            </div>
                            <div className="p-3 bg-surface-secondary rounded-md">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">택시</span>
                              <p className="text-lg font-semibold mt-1">
                                {formatLatestDeparture(recommendResult.comparison.latest.taxi.latestDeparture, 5, nowMinutesForStatus)}
                              </p>
                            </div>
                          </div>
                        </>
                      )}

                      {/* 결과 없을 때 */}
                      {!recommendResult && !recommendLoading && (
                        <p className="text-sm text-muted-foreground text-center">
                          아직 추천 결과가 없어요. 잠시 후 다시 확인해 주세요.
                        </p>
                      )}
                    </Card.Content>
                  </Card>

                  {/* 출발 시각 조정용 DepartureControl */}
                  <Card className="w-full mt-4">
                    <Card.Content className="flex flex-col gap-4">
                      <DepartureControl
                        nowTime={now}
                        departureInput={departureInput}
                        departureAdjusted={departureAdjusted}
                        recommendLoading={recommendLoading}
                        canRun={!profile || !homeCoords || !workCoords ? false : true}
                        onSetDepartureInput={setDepartureInput}
                        onSetDepartureAdjusted={setDepartureAdjusted}
                        onRunRecommend={runRecommend}
                      />
                      {recommendResult && (
                        <div className="text-sm text-muted-foreground text-center">
                          출발 시각을 바꾸셨다면 '새로운 출발 시간으로 계산' 버튼을 눌러 다시 확인하세요.
                        </div>
                      )}
                    </Card.Content>
                  </Card>
                </>
              )}

              {morningStatus === 'normal' && (
                <Card className="w-full">
                  <Card.Content className="flex flex-col gap-4">
                    {recommendLoading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        지금 출발 기준을 계산하고 있어요…
                      </div>
                    ) : (
                      <>
                        <DepartureControl
                          nowTime={now}
                          departureInput={departureInput}
                          departureAdjusted={departureAdjusted}
                          recommendLoading={recommendLoading}
                          canRun={!profile || !homeCoords || !workCoords ? false : true}
                          onSetDepartureInput={setDepartureInput}
                          onSetDepartureAdjusted={setDepartureAdjusted}
                          onRunRecommend={runRecommend}
                        />
                        <div>
                          <RecommendResultCard
                            recommendResult={recommendResult}
                            recommendError={recommendError}
                            recommendLoading={recommendLoading}
                            resultEmpty={!recommendResult && !recommendError && !recommendLoading}
                            onEditProfile={editProfileHandler}
                          />
                        </div>
                        {!recommendResult && !recommendError && !recommendLoading && (
                          <p className="text-sm text-muted-foreground text-center">
                            출발 시각을 입력한 뒤 '지금 출발 계산' 버튼을 눌러주세요.
                          </p>
                        )}
                      </>
                    )}
                  </Card.Content>
                </Card>
              )}
            </div>

            {/* 고급 설정 */}
            <div >
              <Button variant="ghost" className="w-full" onPress={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? '고급 설정 접기' : '고급 설정 펼치기'}
              </Button>
              {showAdvanced && (
                <div className="p-4 bg-secondary/30 border border-border rounded-lg space-y-3">
                  <Label>공통 준비 시간 (분, 기본 5분)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    value={prepMinutes}
                    onChange={(e) => setPrepMinutes(parseInt(e.target.value, 10) || 0)}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={taxiCallAddOn}
                      onChange={(val) => setTaxiCallAddOn(val)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        택시 호출 시간 추가
                      </Checkbox.Content>
                    </Checkbox>
                  </div>
                  <p className="text-sm text-muted-foreground" style={{ marginTop: 'var(--space-1)' }}>
                    준비 시간은 개인 준비와 택시 호출 대기를 함께 고려한 초기 추정치예요. 고급 설정에서 조정할 수 있어요.
                  </p>
                  <Button variant="outline" className="flex-1" onPress={() => {
                    saveProfile({ ...profile, prepMinutes, taxiCallAddOn, taxiCallAddMinutes });
                    setProfile((prev) => prev ? { ...prev, prepMinutes, taxiCallAddOn, taxiCallAddMinutes } : null);
                    showMessage('고급 설정이 저장되었습니다.');
                  }}>
                    설정 저장
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* 메시지 */}
        {message && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background/90 backdrop-blur rounded-lg px-4 py-3 shadow-md text-sm border border-border">{message}</div>
        )}

        {/* ================================================================
 API 정보 박스 — 표 형태 (하단 고정, 다크모드 대응)
 ================================================================ */}
        <div className="mt-6 border-t border-border pt-4">
          <h2 className="text-lg font-semibold mb-3">현재 서비스에서 사용 중인 API</h2>
          <Table aria-label="사용 중인 API" className="w-full">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[480px]">
                <Table.Header>
                  <Table.Column isRowHeader>API</Table.Column>
                  <Table.Column>용도</Table.Column>
                  <Table.Column>출처</Table.Column>
                </Table.Header>
                <Table.Body>
                  <Table.Row>
                    <Table.Cell className="font-medium">카카오맵 REST API</Table.Cell>
                    <Table.Cell>집·회사 주소/장소 검색</Table.Cell>
                    <Table.Cell>카카오</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell className="font-medium">카카오모빌리티 Navi API</Table.Cell>
                    <Table.Cell>차량(택시) 경로·ETA·요금</Table.Cell>
                    <Table.Cell>카카오모빌리티</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell className="font-medium">ODsay 대중교통 길찾기</Table.Cell>
                    <Table.Cell>대중교통 소요시간·환승·거리</Table.Cell>
                    <Table.Cell>ODsay</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell className="font-medium">Tmap REST API</Table.Cell>
                    <Table.Cell>차량 경로 보조·대중교통 경로 백업</Table.Cell>
                    <Table.Cell>SK텔레콤 티맵</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell className="font-medium">TAGO</Table.Cell>
                    <Table.Cell>버스·지하철 정보 백업</Table.Cell>
                    <Table.Cell>한국대중교통정보(TAGO)</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell className="font-medium">기상청 초단기예보(KMA)</Table.Cell>
                    <Table.Cell>현재 날씨·강수 여부</Table.Cell>
                    <Table.Cell>기상청</Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            각 서비스는 개별 이용약관·라이선스를 따르며, 무료로 제공되는 범위 내에서 사용합니다.<br />
            기본 추천은 카카오맵·Navi·ODsay로 계산하고, 실패하거나 결과가 없을 때 Tmap·TAGO가 순서대로 백업으로 동작합니다.
          </p>
        </div>
      </main>
    </div>
  );
}
