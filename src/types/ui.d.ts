// UI 관련 타입 정의

// TreeView 아이템 타입
export type I18nItemType =
  | 'korean'
  | 'i18n'
  | 'start'
  | 'stop'
  | 'refresh'
  | 'pending-section'
  | 'completed-section'
  | 'button-container'
  | 'control-buttons'
  | 'convert-button';

// 진행 상황 콜백 타입
export interface ProgressCallback {
  (current: number, total: number): void;
}
