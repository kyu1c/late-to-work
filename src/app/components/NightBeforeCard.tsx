'use client';

import { Button, Card, Separator } from '@heroui/react';
import type { NightBeforeResponse } from '@/lib/types';
import styles from './NightBeforeCard.module.css';

interface NightBeforeCardProps {
  nightBeforeResult: NightBeforeResponse;
  loading: boolean;
  onRefresh: () => void;
}

export function NightBeforeCard({ nightBeforeResult, loading, onRefresh }: NightBeforeCardProps) {
  return (
    <Card className={styles.card}>
      <Card.Header className={styles.header}>
        <Card.Title className={styles.title}>
          어제 밤 기준 내일 출발 추천
        </Card.Title>
        <Button
          variant="ghost"
          onPress={onRefresh}
          isDisabled={loading}
          className={styles.refreshButton}
        >
          {loading ? '새로고침 중…' : '새로고침'}
        </Button>
      </Card.Header>
      <Card.Content className={styles.content}>
        <div className={styles.tightSection}>
          <div className={styles.tightHeader}>
            <span className={styles.label}>타이트:</span>{' '}
            <strong>{nightBeforeResult.tight.departureTime}</strong> 출발
          </div>
          <div className={styles.tightNote}>{nightBeforeResult.tight.transportNote}</div>
          <div className={styles.tightNote}>{nightBeforeResult.tight.arrivalNote}</div>
        </div>
        <Separator className={styles.divider} />
        <div className={styles.looseSection}>
          <div className={styles.looseHeader}>
            <span className={styles.label}>여유:</span>{' '}
            <strong>{nightBeforeResult.loose.departureTime}</strong> 출발
          </div>
          <div className={styles.looseNote}>{nightBeforeResult.loose.transportNote}</div>
          <div className={styles.looseNote}>{nightBeforeResult.loose.arrivalNote}</div>
        </div>
        <div className={styles.bottomNote}>{nightBeforeResult.note}</div>
      </Card.Content>
    </Card>
  );
}
