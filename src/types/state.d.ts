// 상태 관리 관련 타입 정의

import type { TextRange } from './common';

// 모니터링 상태
export interface MonitoringState {
  isMonitoring: boolean;
  debounceTimer: NodeJS.Timeout | undefined;
  currentKoreanRanges: TextRange[];
  currentI18nRanges: TextRange[];
}

// 상태 업데이트 타입
export type StateUpdate = Partial<MonitoringState>;
