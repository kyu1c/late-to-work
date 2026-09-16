'use client';

import { Button, Alert, Card, Table } from '@heroui/react';
import { cn } from '@heroui/styles';
import type { RecommendResponse } from '@/lib/types';

interface RecommendResultCardProps {
  recommendResult: RecommendResponse | null;
  recommendError: string | null;
  recommendLoading: boolean;
  resultEmpty: boolean;
  onEditProfile: () => void;
}

function formatSource(source: string, note: string): { label: string; detail: string | null } {
  const label = source === 'navi' ? '카카오내비'
    : source === 'tmap' ? 'Tmap (카카오내비 대체)'
    : source === 'odsay' ? 'ODsay'
    : source === 'kakao' ? '카카오맵'
    : source === 'none' ? '실시간 정보 없음'
    : source;
  const detail = source === 'tmap' ? '카카오내비 연결 실패 후 Tmap으로 대체 조회' : null;
  return { label, detail };
}

function formatMoney(won: number): string {
  return won.toLocaleString('ko-KR');
}

/** HH:MM → 시:분 (12시간제, 오전/오후) */
function toAmPm(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${String(m).padStart(2, '0')}`;
}

export function RecommendResultCard({
  recommendResult,
  recommendError,
  recommendLoading,
  resultEmpty,
  onEditProfile,
}: RecommendResultCardProps) {
  if (recommendResult) {
    const r = recommendResult;
    const comp = r.comparison;
    const transit = r.transit;
    const taxi = r.taxi;
    const isLateByTransit = comp.faster === 'taxi';
    const transitMinutes = transit.durationMinutes;
    const taxiEta = taxi.vehicleEtaMinutes;
    const diffMinutes = comp.fasterMinutes;

    return (
      <Card className="w-full">
        <Card.Header className="pb-3 border-b border-border mb-3">
          <Card.Title className="text-lg">
            현재 시각: <span className="font-normal text-muted-foreground">{toAmPm(r.nowTime)}</span>
          </Card.Title>
          <Card.Description className="text-sm text-muted-foreground mt-1">
            목표 도착: <strong>{toAmPm(r.targetArrival)}</strong>
            {' '}/ 잔여 시간: <strong>{formatDiff(comp.departureTimeUsed, r.targetArrival)}</strong>
          </Card.Description>
        </Card.Header>

        <Card.Content className="flex flex-col gap-4">
          {/* ── 1. 날씨 정보 ── */}
          {r.weather && (
            <Alert status={r.weather.isRaining ? 'danger' : 'success'} className="w-full">
              <Alert.Description>
                <span className="mr-2">{r.weather.isRaining ? '☔' : '☀️'}</span>
                {r.weather.note}
              </Alert.Description>
            </Alert>
          )}

          {/* ── 2. 대중교통 지각 여부 ── */}
          <Alert status={isLateByTransit ? 'danger' : 'success'} className="w-full">
            <Alert.Description>
              <strong>{isLateByTransit ? '지각 위험' : '안전'}</strong>
              {' '}— 대중교통 이용 시 목표 도착 {toAmPm(r.targetArrival)}에{' '}
              {isLateByTransit ? '늦을 수 있어요' : '도착할 수 있어요'}.
            </Alert.Description>
          </Alert>

          {/* ── 3. (지각 위험 시) 택시 비교 요약 ── */}
          {isLateByTransit && taxiEta != null && (
            <div className="p-3 bg-surface-secondary rounded-md">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <span>택시가 대중교통보다</span>
                <strong className="text-foreground">약 {diffMinutes}분 더 빨라요</strong>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">총 소요 시간</span>
                  <div className="text-foreground font-medium mt-1">
                    {taxiEta != null ? `약 ${taxiEta}분` : '확인 불가'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">도착 예상</span>
                  <div className="text-foreground font-medium mt-1">
                    {comp.taxi.arrivalTime ? toAmPm(comp.taxi.arrivalTime) : '확인 불가'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">예상 요금</span>
                  <div className="text-foreground font-medium mt-1">
                    {taxi.taxiFare != null ? `${formatMoney(taxi.taxiFare)}원` : '확인 불가'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 4. 대중교통 vs 택시 비교 표 ── */}
          <Table aria-label="교통편 비교표" className="w-full">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>교통편</Table.Column>
                  <Table.Column>출발 기준</Table.Column>
                  <Table.Column>이동 + 준비</Table.Column>
                  <Table.Column>도착 예상</Table.Column>
                  <Table.Column>출처 / 추가 정보</Table.Column>
                </Table.Header>
                <Table.Body>
                  {/* 대중교통 행 */}
                  <Table.Row>
                    <Table.Cell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">대중교통</span>
                        <span className="text-xs text-muted-foreground">
                          {formatSource(transit.source, transit.note).label}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{comp.public.departureTime ? toAmPm(comp.public.departureTime) : '-'}</Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">
                        {transitMinutes != null
                          ? `이동 ${transitMinutes}분 + 준비 ${comp.public.prepMinutes}분`
                          : '이동 확인 불가 / 실시간 정보 없음'}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">
                        {comp.public.arrivalTime ? toAmPm(comp.public.arrivalTime) : '-'}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="text-xs text-muted-foreground flex flex-col gap-1">
                        {transit.transfers != null && transit.transfers > 0 && (
                          <span>환승: 약 {transit.transfers}회</span>
                        )}
                        {transit.distanceMeters != null && (
                          <span>거리: {transit.distanceMeters.toFixed(0)}m</span>
                        )}
                        <span className="mt-1">{transit.note}</span>
                      </div>
                    </Table.Cell>
                  </Table.Row>

                  {/* 택시 행 */}
                  <Table.Row>
                    <Table.Cell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">택시</span>
                        <span className="text-xs text-muted-foreground">
                          {formatSource(taxi.source, taxi.note).label}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{comp.taxi.departureTime ? toAmPm(comp.taxi.departureTime) : '-'}</Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">
                        차량 {taxiEta != null ? taxiEta : '?'}분 +
                        준비 {comp.taxi.prepMinutes}분
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">
                        {comp.taxi.arrivalTime ? toAmPm(comp.taxi.arrivalTime) : '-'}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="text-xs text-muted-foreground flex flex-col gap-1">
                        {taxi.taxiFare != null && (
                          <span>예상 요금: {formatMoney(taxi.taxiFare)}원</span>
                        )}
                        {taxi.distanceMeters != null && (
                          <span>거리: {taxi.distanceMeters.toFixed(0)}m</span>
                        )}
                        <span className="mt-1">{taxi.note}</span>
                        <Button
                          className="mt-2"
                          variant="ghost"
                          size="sm"
                          onPress={() => { window.location.href = 'kakaot://'; }}
                        >
                          카카오T 앱 열기
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>

          {/* ── 5. 대중교통 늦지 않는 출발 시각 ── */}
          <div className="p-3 bg-surface-secondary rounded-md">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>대중교통 이용 시</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">늦지 않는 마지막 출발</span>
                <div className="text-foreground font-medium mt-1">
                  {comp.latest.public.latestDeparture ? toAmPm(comp.latest.public.latestDeparture) : '-'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">현재 여유 시간</span>
                <div className="text-foreground font-medium mt-1">
                  {comp.latest.public.minutesUntilMustLeave > 0
                    ? `약 ${comp.latest.public.minutesUntilMustLeave}분 여유`
                    : comp.latest.public.minutesUntilMustLeave === 0
                      ? '지금 바로 출발'
                      : '이미 늦었어요'}
                </div>
              </div>
            </div>
          </div>

          {/* ── 6. 택시 늦지 않는 출발 시각 ── */}
          <div className="p-3 bg-surface-secondary rounded-md">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>택시 이용 시</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">늦지 않는 마지막 출발</span>
                <div className="text-foreground font-medium mt-1">
                  {comp.latest.taxi.latestDeparture ? toAmPm(comp.latest.taxi.latestDeparture) : '-'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">현재 여유 시간</span>
                <div className="text-foreground font-medium mt-1">
                  {comp.latest.taxi.minutesUntilMustLeave > 0
                    ? `약 ${comp.latest.taxi.minutesUntilMustLeave}분 여유`
                    : comp.latest.taxi.minutesUntilMustLeave === 0
                      ? '지금 바로 출발'
                      : '이미 늦었어요'}
                </div>
              </div>
            </div>
          </div>

          {/* ── 7. 후보 시각별 택시 ETA + 여유 시간 ── */}
          {r.taxiFuture && r.taxiFuture.departureTimes.length > 0 && (
            <div className="p-4 bg-surface-secondary rounded-lg">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-border">
                <span className="text-md font-semibold text-foreground">후보 출발 시각별 택시 예상 소요시간</span>
                <span className="text-sm text-muted-foreground">(미래 운행 정보 기준)</span>
              </div>
              <div className="flex flex-col gap-2">
                {r.taxiFuture.departureTimes.map((dep, i) => {
                  const eta = r.taxiFuture!.vehicleEtaMinutes[i];
                  const fare = r.taxiFuture!.taxiFare[i];
                  const depMinutes = hhmmToMinutes(dep);
                  const targetMinutes = hhmmToMinutes(r.targetArrival) ?? 0;
                  const nowMinutes = hhmmToMinutes(r.nowTime) ?? 0;
                  const totalNeeded = (eta ?? 0) + r.taxiPrepTotalMinutes;
                  const leaveBy = targetMinutes - totalNeeded - 5;
                  const slack = leaveBy - nowMinutes;
                  return (
                    <div key={dep} className="grid grid-cols-4 gap-3 py-2 border-b border-border last:border-none">
                      <div>
                        <span className="text-sm text-foreground font-medium">{toAmPm(dep)} 출발</span>
                      </div>
                      <div>
                        <span className="text-sm text-foreground">
                          {eta != null ? `약 ${eta}분` : '확인 불가'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-foreground">
                          {fare != null ? `${formatMoney(fare)}원` : '확인 불가'}
                        </span>
                      </div>
                      <div className={cn(
                        'text-sm text-right',
                        slack > 0 ? 'text-foreground' : slack === 0 ? 'text-yellow-500 font-medium' : 'text-destructive font-medium'
                      )}>
                        {slack > 0
                          ? `여유 ${slack}분`
                          : slack === 0
                            ? '여유 0분 (지금 출발)'
                            : `이미 ${Math.abs(slack)}분 지남`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-sm text-muted-foreground mt-3 pt-2 border-t border-border">
                출발 시각을 몇 가지로 나눠서 각각에 대해 차가 얼마나 걸릴지 미리 본 결과예요.
                늦지 않는 마지막 출발 시각을 가늠하는 데 참고할 수 있어요.
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                실시간 교통·날씨 정보가 없으면 평균·패턴 기반 추정치로 안내해요.
              </p>
            </div>
          )}

          {/* ── 한 줄 결론 ── */}
          <div className="p-3 bg-surface-secondary rounded-lg">
            <strong className="text-lg font-semibold text-foreground">{comp.statement}</strong>
          </div>

          {/* ── 행동 ── */}
          <div className="mt-3 flex flex-col gap-1">
            {r.actions.map((a, i) => (
              <div key={i} className="text-md text-foreground p-2 px-3 bg-surface-secondary rounded-lg">
                {a}
              </div>
            ))}
          </div>

          {/* ── 참고 ── */}
          <div className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
            {r.note}
          </div>
          <p className="text-sm text-muted-foreground" style={{ marginTop: 'var(--space-1)' }}>
            준비 시간은 개인 준비와 택시 호출 대기를 함께 고려한 초기 추정치예요.
            고급 설정에서 조정할 수 있어요.
          </p>
        </Card.Content>
      </Card>
    );
  }

  if (resultEmpty && !recommendResult && !recommendError) {
    return (
      <div className="text-muted-foreground text-md text-center py-6">출발 시간을 입력해 주세요</div>
    );
  }

  if (recommendError) {
    return (
      <div className="p-4 bg-surface-secondary rounded-lg text-destructive text-md">
        <span>{recommendError}</span>
        {recommendError.includes('위치') ||
        recommendError.includes('출발') ||
        recommendError.includes('수정') ? (
          <Button
            className="mt-2"
            variant="outline"
            size="sm"
            onPress={onEditProfile}
          >
            프로필 수정하기
          </Button>
        ) : null}
      </div>
    );
  }

  return null;
}

function formatDiff(departureUsed: string, targetArrival: string): string {
  const dep = hhmmToMinutes(departureUsed);
  const target = hhmmToMinutes(targetArrival);
  if (dep == null || target == null) return '';
  const diff = target - dep;
  if (diff <= 0) return '도착 완료';
  return `약 ${diff}분`;
}

function hhmmToMinutes(hhmm: string): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
