'use client';

import { Card, CardHeader, CardTitle, CardContent, Button, Label, Description, Alert } from '@heroui/react';
import { cn } from '@heroui/styles';
import { parseTime } from '@internationalized/date';

type NowStatus = 'normal' | 'late-should-adjust' | 'after-workhours';

interface NowStatusCardProps {
  nowTimeString: string;
  targetArrival: string;
  transitResult?: { durationMinutes: number | null; source: string } | null;
  taxiEta?: number | null;
  taxiFare?: number | null;
  onEditProfile?: () => void;
  className?: string;
}

export function NowStatusCard({
  nowTimeString,
  targetArrival,
  transitResult,
  taxiEta,
  taxiFare,
  onEditProfile,
  className,
}: NowStatusCardProps) {
  const nowParsed = parseTime(nowTimeString);
  const targetParsed = parseTime(targetArrival);
  const nowMinutes = nowParsed ? arrToTotalMinutes(nowParsed) : 0;
  const targetMinutes = targetParsed ? arrToTotalMinutes(targetParsed) : 0;
  const diffMinutes = targetMinutes - nowMinutes;

  let status: NowStatus;
  if (diffMinutes < 0) {
    status = 'after-workhours';
  } else if (diffMinutes > 60) {
    status = 'late-should-adjust';
  } else {
    status = 'normal';
  }

  return (
    <Card className={cn(className ?? undefined, 'w-full')}>
      <CardHeader className="mb-3">
        <CardTitle>현재 시간 기준 안내</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status === 'normal' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Label className="font-medium">현재 시각</Label>
              <span className="text-foreground">{nowTimeString}</span>
              <span className="text-muted-foreground">→</span>
              <Label className="font-medium">목표 도착</Label>
              <span className="text-foreground">{targetArrival}</span>
              <span className="text-muted-foreground">(약 {diffMinutes}분 후)</span>
            </div>
            <Description>
              출근 시간이 아직 남았어요. 준비 시간을 고려해 여유 있게 출발하세요.
            </Description>
          </div>
        )}

        {status === 'late-should-adjust' && (
          <>
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
            {transitResult && transitResult.durationMinutes != null && (
              <div className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">대중교통 소요 시간</span>
                <span className="text-lg font-semibold">
                  약 {transitResult.durationMinutes}분 ({transitResult.source})
                </span>
              </div>
            )}
            {taxiEta != null && taxiFare != null && (
              <div className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 소요 시간 / 요금</span>
                <span className="text-lg font-semibold">
                  약 {taxiEta}분 / 약 {taxiFare.toLocaleString()}원
                </span>
              </div>
            )}
            {(!transitResult || transitResult.durationMinutes == null) && (taxiEta == null || taxiFare == null) && (
              <Description className="text-sm text-muted-foreground">
                실시간 교통 정보가 아직 없어요. 프로필 저장 후 다시 확인해 주세요.
              </Description>
            )}
          </>
        )}

        {status === 'after-workhours' && (
          <>
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
            {taxiEta != null && taxiFare != null && (
              <div className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-md">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">택시 소요 시간 / 요금</span>
                <span className="text-lg font-semibold">
                  약 {taxiEta}분 / 약 {taxiFare.toLocaleString()}원
                </span>
                <Description className="text-sm text-muted-foreground">
                  대중교통 실시간 정보는 이미 도착 시각이 지나 의미 없어서 표시하지 않았어요.
                </Description>
              </div>
            )}
            {taxiEta == null || taxiFare == null ? (
              <Description className="text-sm text-muted-foreground">
                실시간 교통 정보가 아직 없어요. 프로필 저장 후 다시 확인해 주세요.
              </Description>
            ) : null}
          </>
        )}

        {onEditProfile && (
          <div className="flex justify-end mt-2">
            <Button variant="ghost" size="sm" onPress={onEditProfile}>
              프로필 수정
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function arrToTotalMinutes(arr: { hour: number; minute: number; second: number }): number {
  return arr.hour * 60 + arr.minute;
}
