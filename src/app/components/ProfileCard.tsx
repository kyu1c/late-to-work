'use client';

import { Button, Card, Chip } from '@heroui/react';
import type { Profile } from '@/lib/types';
import styles from './ProfileCard.module.css';

export function ProfileSummaryCard({ profile, onEdit, onClear }: { profile: Profile; onEdit: () => void; onClear: () => void }) {
  return (
    <Card className={styles.card}>
      <Card.Header className={styles.cardHeader}>
        <Card.Title className={styles.cardTitle}>저장된 정보</Card.Title>
        <Button
          className={styles.profileEditButton}
          variant="ghost"
          size="sm"
          onPress={onEdit}
        >
          수정
        </Button>
      </Card.Header>
      <Card.Content className={styles.cardContent}>
        <div className={styles.profileRow}>
          <div>
            <span className={styles.profileStrong}>{profile.homeName}</span>
            <span className={styles.profileArrow}> → </span>
            <span className={styles.profileStrong}>{profile.workName}</span>
          </div>
          <Button
            className={styles.profileClear}
            variant="ghost"
            size="sm"
            onPress={onClear}
          >
            초기화
          </Button>
        </div>
        <p className={styles.profileAddress}>
          {profile.homeAddress} → {profile.workAddress}
        </p>
        <div className={styles.profileMeta}>
          <Chip size="sm" variant="soft" color="default">
            목표 도착: {profile.targetArrival}
          </Chip>
          <Chip size="sm" variant="soft" color="default">
            선호: {profile.preferredTransport}
          </Chip>
        </div>
      </Card.Content>
    </Card>
  );
}
