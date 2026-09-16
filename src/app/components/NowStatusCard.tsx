'use client';

import { Card, CardHeader, CardTitle, CardContent, Label, Description, Alert, Table } from '@heroui/react';
import { cn } from '@heroui/styles';

type NowStatus = 'normal' | 'late-should-adjust' | 'after-workhours';

function parseAmPmToMinutes(ampmStr: string): number {
  // "오전 3:30" / "오후 11:05" / "22:00:00" / "22:00" 형태 파싱
  let m = ampmStr.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    const isPm = m[1] === '오후';
    const totalHour = isPm ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    return totalHour * 60 + minute;
  }
  m = ampmStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    return hour * 60 + minute;
  }
  return 0;
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? '오후' : '오전';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${period} ${hour12}:${String(m).padStart(2, '0')}`;
}

function formatLatestDeparture(departureTime: string, bufferMinutes: number, nowMinutes: number): string {
  const depMinutes = parseAmPmToMinutes(departureTime);
  const mustLeave = depMinutes - bufferMinutes;
  const remaining = mustLeave - nowMinutes;
  const timeStr = formatMinutesToTime(mustLeave);
  if (remaining <= 0) {
    return `${timeStr}까지 출발 (이미 늦음 / 지금 출발해야 함)`;
  }
  return `${timeStr}까지 출발 (${remaining}분 여유)`;
}

import type { RecommendResponse } from '@/lib/types';

interface NowStatusCardProps {
  nowTimeString: string;
  targetArrival: string;
  recommendResult: RecommendResponse | null;
  onEditProfile?: () => void;
  className?: string;
}

export function NowStatusCard({
  nowTimeString,
  targetArrival,
  recommendResult,
  className,
}: NowStatusCardProps) {
  const nowMinutes = parseAmPmToMinutes(nowTimeString);
  const targetMinutes = parseAmPmToMinutes(targetArrival);
  const diffMinutes = targetMinutes - nowMinutes;

  let status: NowStatus;
  if (diffMinutes < 0) {
    status = 'after-workhours';
  } else if (diffMinutes <= 60) {
    status = 'late-should-adjust';
  } else {
    status = 'normal';
  }

  const transit = recommendResult?.transit ?? null;
  const taxi = recommendResult?.taxi ?? null;
  const comparison = recommendResult?.comparison ?? null;
  const taxiFuture = recommendResult?.taxiFuture ?? null;

  return (
    <Card className={cn(className ?? undefined, 'w-full')}>
      <CardHeader className="mb-3">
        <CardTitle>현재 시간 기준 안내</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* ==== 1. 현재 시각 / 목표 도착 / 잔여 시간 ==== */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Label className="font-medium">현재 시각</Label>
            <span className="text-foreground">{nowTimeString}</span>
            <span className="text-muted-foreground">→</span>
            <Label className="font-medium">목표 도착</Label>
            <span className="text-foreground">{targetArrival}</span>
            <span className="text-muted-foreground">(잔여 {diffMinutes}분)</span>
          </div>
        </div>

        {/* ==== 상태에 따른 안내 ==== */}
        {status === 'normal' && (
          <Description>
            출근 시간이 아직 남았어요. 준비 시간을 고려해 여유 있게 출발하세요.
          </Description>
        )}

        {status === 'late-should-adjust' && (
          <Alert status="warning" className="w-full">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>출근 시간을 조정해 주세요</Alert.Title>
              <Alert.Description>
                현재 시각({nowTimeString}) 기준 목표 도착({targetArrival})까지 약 {diffMinutes}분 남았습니다.
                출근 시간을 늦추거나, 택시를 이용해야 제시간에 도착할 수 있어요.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {status === 'after-workhours' && (
          <Alert status="warning" className="w-full">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>출근 시간 이후입니다</Alert.Title>
              <Alert.Description>
                현재 시각({nowTimeString})은 목표 도착({targetArrival})이 지났어요.
                그래도 출근이 필요하다면 아래 정보를 참고하세요.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {/* ==== 2. 출근 전 가정: 대중교통 지각 여부 ==== */}
        {status !== 'after-workhours' && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Label className="font-medium text-sm">대중교통 지각 여부</Label>
            </div>
            {transit && transit.durationMinutes != null && comparison && (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-md ',
                comparison.public.totalMinutes > diffMinutes
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
              )}>
                {comparison.public.totalMinutes > diffMinutes ? (
                  <>
                    <Alert.Indicator />
                    <span className="font-medium">지각 위험</span>
                    <span className="text-sm"> — 대중교통 이용 시 약 {comparison.public.totalMinutes}분 걸려 목표 도착({targetArrival})까지 {diffMinutes}분밖에 남지 않았어요.</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">✓</span>
                    <span className="font-medium">안전</span>
                    <span className="text-sm"> — 대중교통 이용 시 약 {comparison.public.totalMinutes}분, 남은 시간({diffMinutes}분) 안에 도착 가능해요.</span>
                  </>
                )}
              </div>
            )}
            {(!transit || transit.durationMinutes == null) && (
              <Description className="text-sm text-muted-foreground">
                대중교통 실시간 정보를 확인할 수 없어 지각 여부를 판단하기 어려워요.
              </Description>
            )}
          </div>
        )}

        {/* ==== 3. 대중교통 위험 시 택시 비교 정보 ==== */}
        {transit && transit.durationMinutes != null && comparison &&
          comparison.public.totalMinutes > diffMinutes && taxi && taxi.vehicleEtaMinutes != null && (
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium text-sm">택시 이용 시 비교</Label>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-surface-secondary rounded-md">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 총 소요 시간</span>
                  <p className="text-lg font-semibold mt-1">약 {comparison.taxi.totalMinutes}분</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ({taxi.vehicleEtaMinutes}분 이동 + 준비 {comparison.taxi.prepMinutes}분)
                  </p>
                </div>
                <div className="p-3 bg-surface-secondary rounded-md">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 이용 시 도착 예상</span>
                  <p className="text-lg font-semibold mt-1">{comparison.taxi.arrivalTime}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    목표 도착 {targetArrival}보다 {parseAmPmToMinutes(targetArrival) - parseAmPmToMinutes(comparison.taxi.arrivalTime) > 0 ? '더 일찍' : '늦게'} 도착
                  </p>
                </div>
              </div>
              <div className="p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시가 대중교통보다 빠른 시간</span>
                <p className="text-lg font-semibold mt-1">약 {comparison.fasterMinutes}분</p>
                <p className="text-xs text-muted-foreground mt-1">
                  택시 {comparison.taxi.totalMinutes}분 vs 대중교통 {comparison.public.totalMinutes}분
                </p>
              </div>
              {taxi.taxiFare != null && (
                <div className="p-3 bg-surface-secondary rounded-md">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 예상 요금</span>
                  <p className="text-lg font-semibold mt-1">약 {taxi.taxiFare.toLocaleString('ko-KR')}원</p>
                  <p className="text-xs text-muted-foreground mt-1">출처: {taxi.source}</p>
                </div>
              )}
            </div>
          )}

        {/* ==== 4. 대중교통 vs 택시 비교 표 ==== */}
        {comparison && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Label className="font-medium text-sm" id="compare-table-label">대중교통 vs 택시 비교</Label>
            </div>
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>교통편</Table.Column>
                  <Table.Column>출발 시각</Table.Column>
                  <Table.Column>총 소요 시간</Table.Column>
                  <Table.Column>도착 예상 시각</Table.Column>
                  <Table.Column>출처</Table.Column>
                </Table.Header>
                <Table.Body>
                  <Table.Row>
                    <Table.Cell>대중교통</Table.Cell>
                    <Table.Cell>{comparison.public.departureTime}</Table.Cell>
                    <Table.Cell>약 {comparison.public.totalMinutes}분</Table.Cell>
                    <Table.Cell>{comparison.public.arrivalTime}</Table.Cell>
                    <Table.Cell>{transit?.source ?? '—'}</Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell>택시</Table.Cell>
                    <Table.Cell>{comparison.taxi.departureTime}</Table.Cell>
                    <Table.Cell>약 {comparison.taxi.totalMinutes}분</Table.Cell>
                    <Table.Cell>{comparison.taxi.arrivalTime}</Table.Cell>
                    <Table.Cell>{taxi?.source ?? '—'}</Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </div>
        )}

        {/* ==== 5. 대중교통 출발 시한 + 택시 출발 시한 ==== */}
        {comparison && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Label className="font-medium text-sm">늦지 않으려면 언제까지 출발해야 하나요? (여유 5분 포함)</Label>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">대중교통</span>
                <p className="text-lg font-semibold mt-1">
                  {formatLatestDeparture(comparison.latest.public.latestDeparture, 5, nowMinutes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  소요 시간: 약 {comparison.public.totalMinutes}분 (이동 {comparison.public.transitMinutes}분 + 준비 {comparison.public.prepMinutes}분)
                </p>
              </div>
              <div className="p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시</span>
                <p className="text-lg font-semibold mt-1">
                  {formatLatestDeparture(comparison.latest.taxi.latestDeparture, 5, nowMinutes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  소요 시간: 약 {comparison.taxi.totalMinutes}분 (이동 {comparison.taxi.vehicleEtaMinutes}분 + 준비 {comparison.taxi.prepMinutes}분)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ==== 6. 후보 시각별 택시 ETA (2가지 시간대) ==== */}
        {taxiFuture && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Label className="font-medium text-sm">후보 출발 시각별 택시 예상 소요 시간</Label>
            </div>
            {taxiFuture.departureTimes.length >= 2 && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[0, 1].map((idx) => {
                  const depTime = taxiFuture.departureTimes[idx];
                  const eta = taxiFuture.vehicleEtaMinutes[idx];
                  const fare = taxiFuture.taxiFare[idx];
                  const depMinutes = parseAmPmToMinutes(depTime);
                  const arrivalAtDep = depMinutes + (eta ?? 0) + (comparison?.taxi?.prepMinutes ?? 5);
                  const spare = targetMinutes - arrivalAtDep;
                  return (
                    <div key={idx} className="p-3 bg-surface-secondary rounded-md">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">출발 시각 {idx + 1}</span>
                        <span className="text-xs text-muted-foreground">
                          여유 {Math.max(0, spare)}분
                        </span>
                      </div>
                      <p className="text-lg font-semibold mt-1">{depTime} 출발</p>
                      <p className="text-sm mt-1">
                        택시 예상: 약 {eta != null ? eta : '확인 불가'}분
                        {fare != null ? ` / 약 ${fare.toLocaleString('ko-KR')}원` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        도착 예상: {formatMinutesToTime(arrivalAtDep)}
                        {spare > 0 ? ` (목표 도착 {targetArrival}보다 ${spare}분 여유)` : spare === 0 ? ' (딱 맞음)' : ' (지연)'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            {taxiFuture.departureTimes.length < 2 && (
              <Description className="text-sm text-muted-foreground">
                후보 출발 시각 정보가 아직 준비되지 않았어요.
              </Description>
            )}
          </div>
        )}

        {/* ==== 정보 없을 때 표시 ==== */}
        {!transit && !taxi && (
          <Description className="text-sm text-muted-foreground">
            실시간 교통 정보가 아직 없어요. 프로필 저장 후 다시 확인해 주세요.
          </Description>
        )}
      </CardContent>
    </Card>
  );
}
