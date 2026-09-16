'use client';

import { Button, Card, Table } from '@heroui/react';
import { cn } from '@heroui/styles';
import type { Profile } from '@/lib/types';

interface ProfileSummaryCardProps {
  profile: Profile;
  onEdit: () => void;
  onClear: () => void;
}

function toAmPm(hhmm: string): string {
  if (!hhmm) return '-';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${String(m).padStart(2, '0')}`;
}

function transportLabel(v: string): string {
  if (v === 'subway') return '지하철 위주';
  if (v === 'bus') return '버스 위주';
  if (v === 'any') return '상관없음';
  return v;
}

export function ProfileSummaryCard({ profile, onEdit, onClear }: ProfileSummaryCardProps) {
  return (
    <Card className="w-full">
      <Card.Header className="pb-3 border-b border-border">
        <Card.Title className="text-lg">저장된 정보</Card.Title>
      </Card.Header>
      <Card.Content className="pt-3">
        <Table aria-label="저장된 프로필 정보" className="w-full">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>항목</Table.Column>
                <Table.Column>값</Table.Column>
              </Table.Header>
              <Table.Body>
                {/* 집 위치 */}
                <Table.Row>
                  <Table.Cell>
                    <span className="text-sm font-medium text-muted-foreground">출발지(집)</span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="text-sm text-foreground">
                      <strong>{profile.homeName}</strong>
                      <span className="block text-xs text-muted-foreground mt-0.5">{profile.homeAddress}</span>
                    </div>
                  </Table.Cell>
                </Table.Row>

                {/* 출근지 위치 */}
                <Table.Row>
                  <Table.Cell>
                    <span className="text-sm font-medium text-muted-foreground">도착지(회사)</span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="text-sm text-foreground">
                      <strong>{profile.workName}</strong>
                      <span className="block text-xs text-muted-foreground mt-0.5">{profile.workAddress}</span>
                    </div>
                  </Table.Cell>
                </Table.Row>

                {/* 목표 도착 시각 */}
                <Table.Row>
                  <Table.Cell>
                    <span className="text-sm font-medium text-muted-foreground">목표 도착 시각</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm font-medium text-foreground">{toAmPm(profile.targetArrival)}</span>
                  </Table.Cell>
                </Table.Row>

                {/* 선호 교통 수단 */}
                <Table.Row>
                  <Table.Cell>
                    <span className="text-sm font-medium text-muted-foreground">선호 교통 수단</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm text-foreground">{transportLabel(profile.preferredTransport)}</span>
                  </Table.Cell>
                </Table.Row>

                {/* 평소 평균 이동 소요 시간 */}
                {profile.usualTransitMinutes != null && profile.usualTransitMinutes > 0 && (
                  <Table.Row>
                    <Table.Cell>
                      <span className="text-sm font-medium text-muted-foreground">평소 평균 이동 소요 시간</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">약 {profile.usualTransitMinutes}분</span>
                    </Table.Cell>
                  </Table.Row>
                )}

                {/* 전날 밤 선호 시간대 */}
                {profile.preferredTimeA && (
                  <Table.Row>
                    <Table.Cell>
                      <span className="text-sm font-medium text-muted-foreground">전날 밤 선호 시간대 A</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">{toAmPm(profile.preferredTimeA)}</span>
                    </Table.Cell>
                  </Table.Row>
                )}
                {profile.preferredTimeB && (
                  <Table.Row>
                    <Table.Cell>
                      <span className="text-sm font-medium text-muted-foreground">전날 밤 선호 시간대 B</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">{toAmPm(profile.preferredTimeB)}</span>
                    </Table.Cell>
                  </Table.Row>
                )}

                {/* 준비 시간 */}
                <Table.Row>
                  <Table.Cell>
                    <span className="text-sm font-medium text-muted-foreground">공통 준비 시간</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm text-foreground">{profile.prepMinutes}분</span>
                  </Table.Cell>
                </Table.Row>

                {/* 택시 호출 추가 */}
                {profile.taxiCallAddOn && (
                  <Table.Row>
                    <Table.Cell>
                      <span className="text-sm font-medium text-muted-foreground">택시 호출 시간 추가</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-foreground">{profile.taxiCallAddMinutes}분</span>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>

        {/* 프로필 수정 / 초기화 버튼 */}
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onPress={onEdit}
            fullWidth
          >
            프로필 수정하기
          </Button>
          <Button
            variant="danger"
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
