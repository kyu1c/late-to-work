'use client';

import { Button, TimeField } from '@heroui/react';
import { parseTime } from '@internationalized/date';
import styles from './DepartureControl.module.css';

interface DepartureControlProps {
  nowTimeString: string;
  departureInput: string;
  departureAdjusted: boolean;
  recommendLoading: boolean;
  canRun: boolean;
  onSetDepartureInput: (v: string) => void;
  onSetDepartureAdjusted: (v: boolean) => void;
  onRunRecommend: () => void;
}

export function DepartureControl({
  nowTimeString,
  departureInput,
  departureAdjusted,
  recommendLoading,
  canRun,
  onSetDepartureInput,
  onSetDepartureAdjusted,
  onRunRecommend,
}: DepartureControlProps) {
  return (
    <div className={styles.departureControlArea}>
      {/* 현재 시각 */}
      <span className={styles.departureNowLabel}>현재 시각:</span>
      <span className={styles.departureNowTime}>{nowTimeString}</span>

      {/* 시간 조정 버튼들 */}
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
              const now = new Date();
              onSetDepartureInput(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
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
              : new Date().getHours() * 60 + new Date().getMinutes();
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
              : new Date().getHours() * 60 + new Date().getMinutes();
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
              : new Date().getHours() * 60 + new Date().getMinutes();
            onSetDepartureInput(minutesToHhmm(base - 5));
            onSetDepartureAdjusted(true);
          }}
          isDisabled={recommendLoading}
        >
          -5분
        </Button>
      </div>

      {/* 출발 시각 TimeField */}
      {departureInput && (
        <div className={styles.departureTimeField}>
          <span className={styles.departureTimeLabel}>출발 시각:</span>
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
        </div>
      )}
      <p className={styles.departureTimeHint}>
        출발 시각을 바꾸면 비교표가 다시 계산돼요.
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
              ? '출발 시각 조정됨 — 계산'
              : '지금 출발 계산'}
        </Button>
      </div>
    </div>
  );
}

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
