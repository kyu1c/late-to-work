'use client';

import { useState } from 'react';
import { Tabs, ListBox, Label, Description, Input, Button, Fieldset, Alert, Skeleton, Select, SelectTrigger, SelectValue, SelectPopover, TimeField, NumberField, Separator, Card } from '@heroui/react';
import { cn } from '@heroui/styles';
import { parseTime } from '@internationalized/date';
import styles from './OnboardingCard.module.css';

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
  return (
    <Card className={className ?? styles.onboardingCard}>
      <div className={styles.onboardingSteps}>
        <Tabs orientation="horizontal" className={styles.onboardingTabs}>
          <Tabs.ListContainer>
            <Tabs.List className={styles.onboardingTabList}>
              {(['집 위치', '출근지 위치', '목표 도착 시각', '선호 교통수단'] as const).map((label, i) => {
                const stepKey = ['home', 'work', 'time', 'prefs'][i] as OnboardStep;
                const isActive = onboardStep === stepKey;
                const isDone = ['home', 'work', 'time', 'prefs'].indexOf(onboardStep) > i;
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
      </div>

      {onboardStep === 'home' && (
        <div className={styles.onboardingGrid2col}>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>집 위치 (검색 후 선택)</Fieldset.Legend>
              <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
              <div className={styles.selectedAddressBox}>
                {selectedHome ? (
                  <>
                    <span className={styles.selectedAddressBoxName}>{selectedHome.name}</span>
                    <span className={styles.selectedAddressBoxAddr}>{selectedHome.address}</span>
                  </>
                ) : (
                  <span className={styles.selectedAddressBoxDefault}>(선택되지 않음)</span>
                )}
              </div>
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
                <Alert status="danger" className={styles.fieldError}>
                  {searchError}
                </Alert>
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
                    </ListBox.Item>
                  ))}
                </ListBox>
              ) : null}
            </Fieldset>
          </div>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>출근지 위치 (검색 후 선택)</Fieldset.Legend>
              <Description>입력 후 검색을 누르면 결과가 아래에 떠요. 원하는 장소를 선택하세요.</Description>
              <div className={styles.selectedAddressBox}>
                {selectedWork ? (
                  <>
                    <span className={styles.selectedAddressBoxName}>{selectedWork.name}</span>
                    <span className={styles.selectedAddressBoxAddr}>{selectedWork.address}</span>
                  </>
                ) : (
                  <span className={styles.selectedAddressBoxDefault}>(선택되지 않음)</span>
                )}
              </div>
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
                  onPress={() => doSearch(searchQuery, false, setSelectedWork, setWorkCoords)}
                  isDisabled={searching || !searchQuery.trim()}
                >
                  {searching ? '검색 중…' : '검색'}
                </Button>
              </div>
              {searchError && (
                <Alert status="danger" className={styles.fieldError}>
                  {searchError}
                </Alert>
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
                    </ListBox.Item>
                  ))}
                </ListBox>
              ) : null}
            </Fieldset>
          </div>
          <div className={styles.onboardingNav}>
            <Button
              variant="ghost"
              className={styles.cancelButtonMain}
              onPress={cancelOnboarding}
            >
              메인 화면으로
            </Button>
            <Button
              className={styles.nextButton}
              variant="primary"
              onPress={() => { setSearchQuery(''); setOnboardStep('work'); }}
              isDisabled={!selectedHome || !selectedWork}
            >
              다음: 목표 도착 시각
            </Button>
          </div>
        </div>
      )}

      {onboardStep === 'time' && (
        <div className={styles.onboardingGrid2col}>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>목표 도착 시각</Fieldset.Legend>
              <Description>도착해야 하는 시각을 입력하면 그에 맞춰 출발 시간을 계산해요.</Description>
              <TimeField
                className={styles.timeField}
                name="targetArrival"
                value={targetArrival ? parseTime(targetArrival) : null}
                onChange={(timeValue) => {
                  setTargetArrival(timeValue ? timeValue.toString() : '');
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
          </div>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>선호 교통수단</Fieldset.Legend>
              <Description>평소 주로 이용하는 교통수단을 선택하세요.</Description>
              <Select
                value={preferredTransport}
                onChange={(val) => setPreferredTransport(val as Transport)}
              >
                <SelectTrigger className={styles.selectTrigger}>
                  <SelectValue>{preferredTransport ? ({ subway: '지하철 위주', bus: '버스 위주', any: '상관없음' } as const)[preferredTransport] : '선택하세요'}</SelectValue>
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
          </div>
          <div className={styles.onboardingNav}>
            <Button variant="outline" className={styles.backButton} onPress={() => setOnboardStep('work')}>뒤로</Button>
            <Button variant="primary" className={styles.nextButton} onPress={() => setOnboardStep('prefs')}>
              다음: 선호 교통수단
            </Button>
          </div>
        </div>
      )}

      {onboardStep === 'prefs' && (
        <div className={styles.onboardingGrid2col}>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>평소 선호 교통수단</Fieldset.Legend>
              <Description>평소 주로 이용하는 교통수단을 선택하세요.</Description>
              <Select
                value={preferredTransport}
                onChange={(val) => setPreferredTransport(val as Transport)}
              >
                <SelectTrigger className={styles.selectTrigger}>
                  <SelectValue>{preferredTransport ? ({ subway: '지하철 위주', bus: '버스 위주', any: '상관없음' } as const)[preferredTransport] : '선택하세요'}</SelectValue>
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
          </div>
          <div className={styles.onboardingField}>
            <Fieldset>
              <Fieldset.Legend>이동 소요 예상 / 평소 평균 소요 시간</Fieldset.Legend>
              <Description>이동 소요 예상은 대중교통 검색 결과 기준이에요. 평소 평균 소요 시간은 시·분 따로 입력할 수 있어요.</Description>
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
              <Label>평소 평균 이동 소요 시간 — 시 (선택)</Label>
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
              <Label>평소 평균 이동 소요 시간 — 분 (선택)</Label>
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
          </div>
          <div className={styles.onboardingNav}>
            <Button variant="outline" className={styles.backButton} onPress={() => setOnboardStep('time')}>뒤로</Button>
            <Button variant="primary" className={styles.primaryButton} onPress={saveProfileHandler}>프로필 저장</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
