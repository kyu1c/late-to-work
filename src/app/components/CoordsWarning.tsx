'use client';

import { Button } from '@heroui/react';
import styles from './CoordsWarning.module.css';

interface CoordsWarningProps {
  onEdit: () => void;
}

export function CoordsWarning({ onEdit }: CoordsWarningProps) {
  return (
    <div className={styles.warning}>
      <span>위치 정보가 불완전해요. 프로필을 수정해서 집·출근지 좌표를 다시 선택해주세요.</span>
      <Button variant="ghost" size="sm" onPress={onEdit}>
        프로필 수정하기
      </Button>
    </div>
  );
}
