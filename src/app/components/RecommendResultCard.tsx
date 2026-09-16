'use client';

import { Button, Alert, Card } from '@heroui/react';
import { cn } from '@heroui/styles';
import type { RecommendResponse } from '@/lib/types';

function formatSource(source: string, note: string): { label: string; detail: string | null } {
  const label = source === 'navi' ? '카카오내비'
    : source === 'tmap' ? 'Tmap'
    : source === 'odsay' ? 'ODsay'
    : source === 'kakao' ? '카카오맵'
    : source === 'none' ? '실시간 정보 없음'
    : source;

  // Tmap은 카카오내비 실패 후 대체 경로임을 알림
  const detail = source === 'tmap' ? '카카오내비 연결 실패 후 Tmap으로 대체 조회' : null;
  return { label, detail };
}

interface RecommendResultCardProps {
  recommendResult: RecommendResponse | null;
  recommendError: string | null;
  recommendLoading: boolean;
  resultEmpty: boolean;
  onEditProfile: () => void;
}

export function RecommendResultCard({
  recommendResult,
  recommendError,
  recommendLoading,
  resultEmpty,
  onEditProfile,
}: RecommendResultCardProps) {
  if (recommendResult) {
    return (
      <Card className={ cn('w-full') }>
        <Card.Header className={ cn('flex', 'justify-between', 'items-center', 'pb-3', 'border-b', 'border-border', 'mb-3') }>
          <Card.Title>
            현재 시각 기준: {recommendResult.nowTime}
            <span className={ cn('ml-2', 'text-muted-foreground', 'font-normal') }>
              목표 도착: {recommendResult.targetArrival}
            </span>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p className={ cn('text-sm', 'text-muted-foreground', 'mb-3', 'pb-3', 'border-b', 'border-border') }>
            실시간 교통·날씨 정보가 없으면 평균·패턴 기반 추정치로 안내해요.
          </p>

          {/* 날씨 정보 */}
          {recommendResult.weather && (
            <Alert
              status={recommendResult.weather.isRaining ? 'danger' : 'success'}
              className={ cn('mb-3') }
            >
              <Alert.Description>
                <span className={ cn('flex-shrink-0', 'mr-2') }>
                  {recommendResult.weather.isRaining ? '☔' : '☀️'}
                </span>
                <span>{recommendResult.weather.note}</span>
              </Alert.Description>
            </Alert>
          )}

          {/* 교통편 비교표 */}
          <div className={ cn('w-full') }>
            {/* 대중교통 행 */}
            <div className={ cn('grid', 'grid-cols-2', 'gap-3', 'py-3', 'border-b', 'border-border', 'last:border-none') }>
              <div >
                <span className={ cn('text-sm', 'text-muted-foreground', 'font-medium', 'block', 'mb-1') }>대중교통</span>
                <span className={ cn('text-xs', 'text-muted-foreground') }>
                  {formatSource(formatSource(recommendResult.transit.source))}
                </span>
              </div>
              <div >
                <div>
                  출발 기준: {recommendResult.comparison.public.departureTime}
                </div>
                <div>
                  이동 {recommendResult.comparison.public.transitMinutes}분 +
                  준비 {recommendResult.comparison.public.prepMinutes}분
                </div>
                <div>도착 예상: {recommendResult.comparison.public.arrivalTime}</div>
              </div>
              <div >
                {recommendResult.transit.transfers != null &&
                  recommendResult.transit.transfers > 0 && (
                    <div>환승: 약 {recommendResult.transit.transfers}회</div>
                  )}
                {recommendResult.transit.distanceMeters != null && (
                  <div>거리: {recommendResult.transit.distanceMeters.toFixed(0)}m</div>
                )}
                <div className={ cn('text-sm', 'text-muted-foreground', 'mt-1') }>
                  {recommendResult.transit.note}
                </div>
              </div>
            </div>

            {/* 택시 행 */}
            <div className={ cn('grid', 'grid-cols-2', 'gap-3', 'py-3', 'border-b', 'border-border', 'last:border-none') }>
              <div >
                <span className={ cn('text-sm', 'text-muted-foreground', 'font-medium', 'block', 'mb-1') }>택시</span>
                <span className={ cn('text-xs', 'text-muted-foreground') }>
                  {formatSource(formatSource(recommendResult.taxi.source))}
                </span>
              </div>
              <div >
                <div>
                  출발 기준: {recommendResult.comparison.taxi.departureTime}
                </div>
                <div>
                  차량 {recommendResult.comparison.taxi.vehicleEtaMinutes}분 +
                  준비 {recommendResult.comparison.taxi.prepMinutes}분
                </div>
                <div>도착 예상: {recommendResult.comparison.taxi.arrivalTime}</div>
              </div>
              <div >
                {recommendResult.taxi.taxiFare != null && (
                  <div>예상 요금: {formatMoney(recommendResult.taxi.taxiFare)}원</div>
                )}
                {recommendResult.taxi.distanceMeters != null && (
                  <div>거리: {recommendResult.taxi.distanceMeters.toFixed(0)}m</div>
                )}
                <div className={ cn('text-sm', 'text-muted-foreground', 'mt-1') }>{recommendResult.taxi.note}</div>
                <Button
                  className={ cn('mt-2') }
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    window.location.href = 'kakaot://';
                  }}
                >
                  카카오T 앱 열기
                </Button>
              </div>
            </div>
          </div>

          {/* 한 줄 결론 */}
          <div className={ cn('p-3', 'bg-surface-secondary', 'rounded-lg', 'mt-3') }>
            <strong className={ cn('text-lg', 'font-semibold', 'text-foreground') }>
              {recommendResult.comparison.statement}
            </strong>
          </div>

          {/* 행동 */}
          <div className={ cn('mt-3', 'flex', 'flex-col', 'gap-1') }>
            {recommendResult.actions.map((a, i) => (
              <div key={i} className={ cn('text-md', 'text-foreground', 'p-2', 'px-3', 'bg-surface-secondary', 'rounded-lg') }>
                {a}
              </div>
            ))}
          </div>

          {/* 참고 */}
          <div className={ cn('text-sm', 'text-muted-foreground', 'mt-3', 'pt-3', 'border-t', 'border-border') }>{recommendResult.note}</div>
          <p className={ cn('text-sm', 'text-muted-foreground') } style={{ marginTop: 'var(--space-1)' }}>
            준비 시간은 개인 준비와 택시 호출 대기를 함께 고려한 초기 추정치예요.
            고급 설정에서 조정할 수 있어요.
          </p>

          {/* 미래 운행 정보 */}
          {recommendResult.taxiFuture &&
            recommendResult.taxiFuture.departureTimes.length > 0 && (() => {
              const tf = recommendResult.taxiFuture!;
              return (
                <div className={ cn('mt-4', 'p-4', 'bg-surface-secondary', 'rounded-lg') }>
                  <div className={ cn('flex', 'justify-between', 'items-center', 'mb-3', 'pb-2', 'border-b', 'border-border', 'text-md', 'font-semibold', 'text-foreground') }>
                    <span>후보 출발 시각별 차량 예상 소요시간</span>
                    <span className={ cn('text-sm', 'text-muted-foreground') }>(미래 운행 정보 기준)</span>
                  </div>
                  <div className={ cn('flex', 'flex-col', 'gap-2') }>
                    {tf.departureTimes.map((dep, i) => (
                      <div key={i} className={ cn('grid', 'grid-cols-3', 'gap-3', 'py-2', 'border-b', 'border-border', 'last:border-none') }>
                        <div className={ cn('text-sm', 'text-foreground') }>
                          <strong>{dep}</strong> 출발
                        </div>
                        <div className={ cn('text-sm', 'text-foreground') }>
                          {tf.vehicleEtaMinutes[i] != null ? (
                            <span>약 {tf.vehicleEtaMinutes[i]}분</span>
                          ) : (
                            <span>확인 불가</span>
                          )}
                        </div>
                        <div className={ cn('text-sm', 'text-foreground') }>
                          {tf.taxiFare[i] != null ? (
                            <span>
                              {formatMoney(tf.taxiFare[i])}원
                            </span>
                          ) : (
                            <span>확인 불가</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                <div className={ cn('text-sm', 'text-muted-foreground', 'mt-3', 'pt-2', 'border-t', 'border-border') }>
                  출발 시각을 몇 가지로 나눠서 각각에 대해 차가 얼마나 걸릴지 미리 본
                  결과예요. 늦지 않는 마지막 출발 시각을 가늠하는 데 참고할 수 있어요.
                </div>
                <p className={ cn('text-sm', 'text-muted-foreground', 'mb-3', 'pb-3', 'border-b', 'border-border') }>
                  실시간 교통·날씨 정보가 없으면 평균·패턴 기반 추정치로 안내해요.
                </p>
              </div>
            );
            })()}
        </Card.Content>
      </Card>
    );
  }

  if (resultEmpty && !recommendResult && !recommendError) {
    return (
      <div className={ cn('text-muted-foreground', 'text-md', 'text-center', 'py-6') }>출발 시간을 입력해 주세요</div>
    );
  }

  if (recommendError) {
    return (
      <div className={ cn('p-4', 'bg-surface-secondary', 'rounded-lg', 'text-destructive', 'text-md') }>
        <span>{recommendError}</span>
        {recommendError.includes('위치') ||
        recommendError.includes('출발') ||
        recommendError.includes('수정') ? (
          <Button
            className={ cn('mt-2') }
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

function formatMoney(won: number): string {
  return won.toLocaleString('ko-KR');
}
