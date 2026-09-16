'use client';

import { Button, TimeField } from '@heroui/react';
import { parseTime } from '@internationalized/date';
import styles from './DepartureControl.module.css';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function hhmmToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h ?? 0) || !Number.isFinite(m ?? 0)) return 0;
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToHhmm(m: number): string {
  const total = Math.round(m) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${pad2(h)}:${pad2(min)}`;
}

function formatNowForDisplay(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
}

interface DepartureControlProps {
  nowTime: Date;
  departureInput: string;
  departureAdjusted: boolean;
  recommendLoading: boolean;
  canRun: boolean;
  onSetDepartureInput: (v: string) => void;
  onSetDepartureAdjusted: (v: boolean) => void;
  onRunRecommend: () => void;
}

export function DepartureControl({
  nowTime,
  departureInput,
  departureAdjusted,
  recommendLoading,
  canRun,
  onSetDepartureInput,
  onSetDepartureAdjusted,
  onRunRecommend,
}: DepartureControlProps) {
  const nowDisplay = formatNowForDisplay(nowTime);
  const departureDisplay = departureInput
    ? formatDepartureDisplay(departureInput)
    : '';

  return (
    <div className={styles.departureControlArea}>
      {/* 현재 시각 */}
      <div className={styles.departureNowRow}>
        <span className={styles.departureNowLabel}>현재 시각</span>
        <span className={styles.departureNowTime}>{nowDisplay}</span>
      </div>

      {/* 출발 시각 + 시간 조절 버튼 */}
      <div className={styles.departureRow}>
        <div className={styles.departureTimeField}>
          <span className={styles.departureTimeLabel}>출발 시각</span>
          <TimeField
            value={departureInput ? parseTime(departureInput) : null}
            onChange={(timeValue) =>
              onSetDepartureInput(timeValue ? timeValue.toString() : '')
            }
            minValue={parseTime('00:00')}
            maxValue={parseTime('23:59')}
            isDisabled={recommendLoading}
            placeholderValue={parseTime('00:00')}
            granularity="minute"
          >
            <TimeField.Group>
              <TimeField.Input>
                {(segment) => <TimeField.Segment segment={segment} />}
              </TimeField.Input>
            </TimeField.Group>
          </TimeField>
          <span className={styles.departureTimeValue}>{departureDisplay}</span>
        </div>

        <div className={styles.departureChipRow}>
          <Button
            variant="ghost"
            onPress={() => {
              onSetDepartureInput('');
              onSetDepartureAdjusted(false);
            }}
            isDisabled={recommendLoading}
          >
            지금
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              if (!departureInput) {
                onSetDepartureInput(minutesToHhmm(nowToMinutes(nowTime)));
                onSetDepartureAdjusted(true);
              }
            }}
            isDisabled={recommendLoading}
          >
            현재 시각 입력
          </Button>
          <span className={styles.departureChipSeparator}>|</span>
          <Button
            variant="ghost"
            onPress={() => {
              const base = departureInput
                ? hhmmToMinutes(departureInput)
                : nowToMinutes(nowTime);
              onSetDepartureInput(minutesToHhmm(base + 5));
              onSetDepartureAdjusted(true);
            }}
            isDisabled={recommendLoading}
          >
            +5분
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              const base = departureInput
                ? hhmmToMinutes(departureInput)
                : nowToMinutes(nowTime);
              onSetDepartureInput(minutesToHhmm(base + 10));
              onSetDepartureAdjusted(true);
            }}
            isDisabled={recommendLoading}
          >
            +10분
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              const base = departureInput
                ? hhmmToMinutes(departureInput)
                : nowToMinutes(nowTime);
              onSetDepartureInput(minutesToHhmm(base - 5));
              onSetDepartureAdjusted(true);
            }}
            isDisabled={recommendLoading}
          >
            -5분
          </Button>
        </div>
      </div>

      <p className={styles.departureTimeHint}>
        출발 시각 조정은 위 버튼으로만 해요. 계산은 아래 '새로운 출발 시간으로 계산' 버튼을 눌러주세요.
      </p>

      {/* 바로 계산 버튼 */}
      <div className={styles.calcButtonRow}>
        <Button
          className={styles.recommendPrimaryButton}
          variant="primary"
          onPress={onRunRecommend}
          isDisabled={recommendLoading || !canRun}
        >
          {recommendLoading
            ? '계산 중…'
            : departureAdjusted
              ? '새로운 출발 시각으로 계산'
              : '지금 출발 계산'}
        </Button>
      </div>

      <p className={styles.departureAdjustedHint}>
        {departureAdjusted && !recommendLoading
          ? '출발 시각을 바꾸셨다면 위 버튼으로 다시 계산해주세요.'
          : '출발 시각을 바꾸면 비교표가 다시 계산돼요.'}
      </p>
    </div>
  );
}

function nowToMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function formatDepartureDisplay(input: string): string {
  const d = new Date();
  const [h, m] = input.split(':').map((s) => parseInt(s, 10));
  if (!Number.isFinite(h ?? 0) || !Number.isFinite(m ?? 0)) return input;
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
}
