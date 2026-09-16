'use client';

import {
  Tabs,
  ListBox,
  ListBoxItemIndicator,
  Label,
  Description,
  Input,
  Button,
  Fieldset,
  Alert,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopover,
  SelectIndicator,
  TimeField,
  NumberField,
  Separator,
  Card,
} from '@heroui/react';
import { cn } from '@heroui/styles';
import { parseTime } from '@internationalized/date';

// page.tsx와 동일한 타입 재선언 (순환 참조 회피)
type Transport = 'subway' | 'bus' | 'any';
type OnboardStep = 'home' | 'work' | 'time' | 'prefs';

interface AddressSearchResult {
  name: string;
  address: string;
  x?: number;
  y?: number;
}

interface OnboardingCardProps {
  onboardStep: OnboardStep;
  setOnboardStep: (step: OnboardStep) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: AddressSearchResult[];
  setSearchResults: (v: AddressSearchResult[]) => void;
  searchError: string | null;
  setSearchError: (v: string | null) => void;
  searching: boolean;
  selectedHome: AddressSearchResult | null;
  setSelectedHome: (v: AddressSearchResult | null) => void;
  selectedWork: AddressSearchResult | null;
  setSelectedWork: (v: AddressSearchResult | null) => void;
  homeCoords: { x: number; y: number } | null;
  setHomeCoords: (v: { x: number; y: number } | null) => void;
  workCoords: { x: number; y: number } | null;
  setWorkCoords: (v: { x: number; y: number } | null) => void;
  targetArrival: string;
  setTargetArrival: (v: string) => void;
  preferredTransport: Transport;
  setPreferredTransport: (v: Transport) => void;
  usualTransitMinutes: number | '';
  setUsualTransitMinutes: (v: number | '') => void;
  usualHours: number | '';
  setUsualHours: (v: number | '') => void;
  usualMinutes: number | '';
  setUsualMinutes: (v: number | '') => void;
  doSearch: (query: string, preferAddress?: boolean, setter?: (r: AddressSearchResult | null) => void, coordSetter?: (c: { x: number; y: number } | null) => void) => void;
  cancelOnboarding: () => void;
  saveProfileHandler: () => void;
  recommendResult: { transit: { durationMinutes: number | null; source: string } } | null;
  className?: string;
}

export function OnboardingCard({
  onboardStep,
  setOnboardStep,
  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
  searchError,
  setSearchError,
  searching,
  selectedHome,
  setSelectedHome,
  selectedWork,
  setSelectedWork,
  homeCoords,
  setHomeCoords,
  workCoords,
  setWorkCoords,
  targetArrival,
  setTargetArrival,
  preferredTransport,
  setPreferredTransport,
  usualTransitMinutes,
  setUsualTransitMinutes,
  usualHours,
  setUsualHours,
  usualMinutes,
  setUsualMinutes,
  doSearch,
  cancelOnboarding,
  saveProfileHandler,
  recommendResult,
  className,
}: OnboardingCardProps) {
  // 이동 소요 예상 계산: recommendResult의 transit.durationMinutes 우선, 없으면 usualTransitMinutes
  const transitEstimate = (() => {
    if (recommendResult && recommendResult.transit.durationMinutes != null && recommendResult.transit.durationMinutes > 0) {
      return { value: recommendResult.transit.durationMinutes, source: recommendResult.transit.source };
    }
    if (typeof usualTransitMinutes === 'number' && usualTransitMinutes > 0) {
      return { value: usualTransitMinutes, source: '입력한 평소 소요 시간' };
    }
    return null;
  })();

  const stepLabels = ['집 위치', '출근지 위치', '목표 도착 시각', '선호 교통수단'] as const;
  const stepKeys = ['home', 'work', 'time', 'prefs'] as const;

  return (
    <Card className={cn(className ?? undefined, 'w-full mt-4')}>
      <Card.Header>
        <Card.Title>{stepLabels[stepKeys.indexOf(onboardStep)]}</Card.Title>
        <Tabs orientation="horizontal" className="mt-2">
          <Tabs.ListContainer>
            <Tabs.List>
              {stepLabels.map((label, i) => {
                const stepKey = stepKeys[i] as OnboardStep;
                const isActive = onboardStep === stepKey;
                const isDone = stepKeys.indexOf(onboardStep) > i;
                return (
                  <Tabs.Tab
                    key={label}
                    className={cn(
                      isActive && undefined,
                      isDone && 'opacity-55',
                    )}
                  >
                    {label}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        {/* ============ Step 1: 집 위치 ============ */}
        {onboardStep === 'home' && (
          <div>
            <Fieldset>
              <Fieldset.Legend>집 위치 (검색 후 선택)</Fieldset.Legend>
              <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
              {/* 선택된 집 표시 영역 — 항상 노출, 기본 "(선택되지 않음)" */}
              <div className="flex flex-col gap-1 p-3 border border-border border-dashed rounded-md bg-surface-secondary min-h-[60px] mb-3">
                {selectedHome ? (
                  <>
                    <span className="font-semibold text-foreground">{selectedHome.name}</span>
                    <span className="text-sm text-muted-foreground">{selectedHome.address}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">(선택되지 않음)</span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  className="flex-1 min-w-0"
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
                  className="flex-shrink-0"
                  onPress={() => doSearch(searchQuery, false, setSelectedHome, setHomeCoords)}
                  isDisabled={searching || !searchQuery.trim()}
                >
                  {searching ? '검색 중…' : '검색'}
                </Button>
              </div>
              {searchError && (
                <Alert status="danger" className="mt-2">
                  {searchError}
                </Alert>
              )}
              {searching ? (
                <div className="flex flex-col gap-2 p-3 0">
                  <Skeleton className="h-5 w-full rounded-md" />
                  <Skeleton className="h-5 w-full rounded-md mt-2" />
                </div>
              ) : searchResults.length > 0 ? (
                <ListBox
                  aria-label="집 위치 검색 결과"
                  selectionMode="single"
                  selectedKeys={selectedHome ? new Set([selectedHome.name + '|' + selectedHome.address]) : new Set()}
                  onSelectionChange={(keys) => {
                    const keyArray = [...keys];
                    if (keyArray.length > 0) {
                      const key = keyArray[0] as string;
                      const r = searchResults.find(
                        (r) => (r.name + '|' + r.address) === key,
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
                    <ListBox.Item
                      key={r.name + '|' + r.address}
                      id={r.name + '|' + r.address}
                      textValue={r.name}
                      aria-label={r.name}
                    >
                      <Label>{r.name}</Label>
                      <Description>{r.address}</Description>
                      <ListBoxItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              ) : null}
            </Fieldset>

            <div className="flex justify-between items-center gap-3 mt-4 pt-3 border-t border-border">
              <Button
                variant="ghost"
                className="flex-none"
                onPress={cancelOnboarding}
              >
                메인 화면으로
              </Button>
              <Button
                className="flex-1"
                variant="primary"
                onPress={() => { setSearchQuery(''); setOnboardStep('work'); }}
                isDisabled={!selectedHome}
              >
                다음: 출근지 위치
              </Button>
            </div>
          </div>
        )}

        {/* ============ Step 2: 출근지 위치 ============ */}
        {onboardStep === 'work' && (
          <div>
            {/* 집 위치 — 읽기 전용으로 표시 */}
            <div className="opacity-70 pb-3 border-b border-border border-dashed mb-2">
              <Fieldset>
                <Fieldset.Legend>집 위치 (설정 완료)</Fieldset.Legend>
                <Description>집 위치가 설정되었어요. 수정하려면 이전 단계로 돌아가세요.</Description>
                <div className="flex flex-col gap-1 p-3 border border-border border-dashed rounded-md bg-surface-secondary min-h-[60px] mb-3">
                  {selectedHome ? (
                    <>
                      <span className="font-semibold text-foreground">{selectedHome.name}</span>
                      <span className="text-sm text-muted-foreground">{selectedHome.address}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">(선택되지 않음)</span>
                  )}
                </div>
              </Fieldset>
            </div>

            <Fieldset>
              <Fieldset.Legend>출근지 위치 (검색 후 선택)</Fieldset.Legend>
              <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
              <div className="flex flex-col gap-1 p-3 border border-border border-dashed rounded-md bg-surface-secondary min-h-[60px] mb-3">
                {selectedWork ? (
                  <>
                    <span className="font-semibold text-foreground">{selectedWork.name}</span>
                    <span className="text-sm text-muted-foreground">{selectedWork.address}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">(선택되지 않음)</span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  className="flex-1 min-w-0"
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
                  className="flex-shrink-0"
                  onPress={() => doSearch(searchQuery, false, setSelectedWork, setWorkCoords)}
                  isDisabled={searching || !searchQuery.trim()}
                >
                  {searching ? '검색 중…' : '검색'}
                </Button>
              </div>
              {searchError && (
                <Alert status="danger" className="mt-2">
                  {searchError}
                </Alert>
              )}
              {searching ? (
                <div className="flex flex-col gap-2 p-3 0">
                  <Skeleton className="h-5 w-full rounded-md" />
                  <Skeleton className="h-5 w-full rounded-md mt-2" />
                </div>
              ) : searchResults.length > 0 ? (
                <ListBox
                  aria-label="출근지 위치 검색 결과"
                  selectionMode="single"
                  selectedKeys={selectedWork ? new Set([selectedWork.name + '|' + selectedWork.address]) : new Set()}
                  onSelectionChange={(keys) => {
                    const keyArray = [...keys];
                    if (keyArray.length > 0) {
                      const key = keyArray[0] as string;
                      const r = searchResults.find(
                        (r) => (r.name + '|' + r.address) === key,
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
                    <ListBox.Item
                      key={r.name + '|' + r.address}
                      id={r.name + '|' + r.address}
                      textValue={r.name}
                      aria-label={r.name}
                    >
                      <Label>{r.name}</Label>
                      <Description>{r.address}</Description>
                      <ListBoxItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              ) : null}
            </Fieldset>

            <div className="flex justify-between items-center gap-3 mt-4 pt-3 border-t border-border">
              <Button
                variant="ghost"
                className="flex-none"
                onPress={cancelOnboarding}
              >
                메인 화면으로
              </Button>
              <Button
                className="flex-1"
                variant="primary"
                onPress={() => { setSearchQuery(''); setOnboardStep('time'); }}
                isDisabled={!selectedHome || !selectedWork}
              >
                다음: 목표 도착 시각
              </Button>
            </div>
          </div>
        )}

        {/* ============ Step 3: 목표 도착 시각 ============ */}
        {onboardStep === 'time' && (
          <div>
            <Fieldset>
              <Fieldset.Legend>목표 도착 시각</Fieldset.Legend>
              <Description>도착해야 하는 시각을 입력하면 그에 맞춰 출발 시간을 계산해요.</Description>
              <TimeField
                className="w-full"
                name="targetArrival"
                value={targetArrival ? parseTime(targetArrival) : null}
                onChange={(timeValue) => {
                  setTargetArrival(timeValue ? timeValue.toString() : targetArrival);
                }}
                placeholderValue={parseTime('09:00')}
              >
                <TimeField.Group>
                  <TimeField.Input>
                    {(segment) => <TimeField.Segment segment={segment} />}
                  </TimeField.Input>
                </TimeField.Group>
              </TimeField>
            </Fieldset>

            <div className="flex justify-between items-center gap-3 mt-4 pt-3 border-t border-border">
              <Button variant="outline" className="flex-none" onPress={() => setOnboardStep('work')}>뒤로</Button>
              <Button variant="primary" className="flex-1" onPress={() => setOnboardStep('prefs')}>
                다음: 선호 교통수단
              </Button>
            </div>
          </div>
        )}

        {/* ============ Step 4: 선호 교통수단 ============ */}
        {onboardStep === 'prefs' && (
          <div>
            <Fieldset>
              <Fieldset.Legend>선호 교통수단</Fieldset.Legend>
              <Description>평소 주로 이용하는 교통수단을 선택하세요.</Description>
              <Select
                value={preferredTransport}
                onChange={(val) => setPreferredTransport(val as Transport)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{preferredTransport ? ({ subway: '지하철 위주', bus: '버스 위주', any: '상관없음' } as const)[preferredTransport] : '선택하세요'}</SelectValue>
                  <SelectIndicator />
                </SelectTrigger>
                <SelectPopover>
                  <ListBox selectionMode="single" aria-label="선호 교통수단 선택"
                    selectedKeys={preferredTransport ? [preferredTransport] : []}>
                    <ListBox.Item id="subway">지하철 위주</ListBox.Item>
                    <ListBox.Item id="bus">버스 위주</ListBox.Item>
                    <ListBox.Item id="any">상관없음</ListBox.Item>
                  </ListBox>
                </SelectPopover>
              </Select>
            </Fieldset>

            {/* 이동 소요 예상 + 평소 평균 소요 시간 */}
            <Separator className="my-3" />

            <Fieldset>
              <Fieldset.Legend>이동 소요 예상 / 평소 평균 소요 시간</Fieldset.Legend>
              <Description>이동 소요 예상은 대중교통 검색 결과 기준이에요. 평소 평균 소요 시간은 시·분 따로 입력할 수 있어요.</Description>
              <div className="flex flex-col gap-1 p-3 bg-surface-secondary rounded-md mt-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">이동 소요 예상</span>
                {transitEstimate ? (
                  <span className="text-lg font-semibold text-foreground">
                    약 {transitEstimate.value}분 (대중교통, {transitEstimate.source})
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">
                    아직 검색 결과가 없어요. 아래 평소 소요 시간을 입력하면 여기에 반영돼요.
                  </span>
                )}
              </div>
              <Label className="block text-sm font-medium text-foreground mt-3 mb-1">평소 평균 이동 소요 시간 — 시 (선택)</Label>
              <NumberField
                name="usualHours"
                value={usualHours === '' ? undefined : usualHours}
                onChange={(value) => setUsualHours(value ?? '')}
                minValue={0}
                maxValue={23}
              >
                <NumberField.Group>
                  <NumberField.Input placeholder="예: 0" />
                </NumberField.Group>
              </NumberField>
              <Label className="block text-sm font-medium text-foreground mt-3 mb-1">평소 평균 이동 소요 시간 — 분 (선택)</Label>
              <NumberField
                name="usualMinutes"
                value={usualMinutes === '' ? undefined : usualMinutes}
                onChange={(value) => setUsualMinutes(value ?? '')}
                minValue={0}
                maxValue={59}
              >
                <NumberField.Group>
                  <NumberField.Input placeholder="예: 30" />
                </NumberField.Group>
              </NumberField>
            </Fieldset>

            <div className="flex justify-between items-center gap-3 mt-4 pt-3 border-t border-border">
              <Button variant="outline" className="flex-none" onPress={() => setOnboardStep('time')}>뒤로</Button>
              <Button variant="primary" className="flex-1" onPress={saveProfileHandler}>프로필 저장</Button>
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
