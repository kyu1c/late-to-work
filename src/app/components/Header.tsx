'use client';

import { Button, Table } from '@heroui/react';
import { useTheme } from 'next-themes';
import styles from './Header.module.css';

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const activeTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <div className={styles.themeToggle}>
        <Button
          className={`${styles.themeButton} ${activeTheme === 'dark' ? styles.themeButtonDark : ''}`}
          variant="ghost"
          size="sm"
          onPress={() => setTheme(activeTheme === 'dark' ? 'light' : 'dark')}
          aria-label="다크모드 전환"
        >
          {activeTheme === 'light' ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              <span>라이트</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span>다크</span>
            </>
          )}
        </Button>
      </div>

      <Table aria-label="서비스 정보" className="w-full">
        <Table.ScrollContainer>
          <Table.Content>
            <Table.Header>
              <Table.Column isRowHeader>항목</Table.Column>
              <Table.Column>내용</Table.Column>
            </Table.Header>
            <Table.Body>
              <Table.Row>
                <Table.Cell className={styles.serviceInfoLabel}>대회</Table.Cell>
                <Table.Cell>MABC Final</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell className={styles.serviceInfoLabel}>스킬명</Table.Cell>
                <Table.Cell>late-to-work</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell className={styles.serviceInfoLabel}>제작자</Table.Cell>
                <Table.Cell>조규원</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell className={styles.serviceInfoLabel}>개발 스펙</Table.Cell>
                <Table.Cell>실시간 교통·날씨 API 기반 출퇴근 비교 추천</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </>
  );
}
