'use client';

import { Button, Card, Chip } from '@heroui/react';
import type { Profile } from '@/lib/types';
import styles from './ProfileCard.module.css';

export function ProfileSummaryCard({ profile, onEdit, onClear }: { profile: Profile; onEdit: () => void; onClear: () => void }) {
  return (
    <Card className={styles.card}>
      <Card.Header className={styles.cardHeader}>
        <Card.Title className={styles.cardTitle}>저장된 정보</Card.Title>
      </Card.Header>
      <Card.Content className={styles.cardContent}>
        {/* 출발지(집) */}
        <div className={styles.profileField}>
          <span className={styles.profileFieldLabel}>출발지(집)</span>
          <span className={styles.profileFieldValue}>
            {profile.homeName}
            <span className={styles.profileFieldAddress}>{profile.homeAddress}</span>
          </span>
        </div>

        {/* 도착지(회사) */}
        <div className={styles.profileField}>
          <span className={styles.profileFieldLabel}>도착지(회사)</span>
          <span className={styles.profileFieldValue}>
            {profile.workName}
            <span className={styles.profileFieldAddress}>{profile.workAddress}</span>
          </span>
        </div>

        {/* 목표 도착 시간 */}
        <div className={styles.profileField}>
          <span className={styles.profileFieldLabel}>목표 도착 시간</span>
          <span className={styles.profileFieldValue}>{profile.targetArrival}</span>
        </div>

        {/* 선호 교통 수단 */}
        <div className={styles.profileField}>
          <span className={styles.profileFieldLabel}>선호 교통 수단</span>
          <span className={styles.profileFieldValue}>
            {profile.preferredTransport === 'subway' && '지하철 위주'}
            {profile.preferredTransport === 'bus' && '버스 위주'}
            {profile.preferredTransport === 'any' && '상관없음'}
          </span>
        </div>

        {/* 수정 / 초기화 버튼 — 양옆 배치 */}
        <div className={styles.profileActions}>
          <Button
            className={styles.profileEditButton}
            variant="ghost"
            size="sm"
            onPress={onEdit}
          >
            프로필 수정하기
          </Button>
          <Button
            className={styles.profileClear}
            variant="ghost"
            size="sm"
            onPress={onClear}
          >
            초기화
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
