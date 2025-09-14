import { I18nTreeDataProvider } from '../providers';
import { highlightText } from '../services/text-highlighting';
import type { MonitoringState, TextRange } from '../types';
import * as vscode from 'vscode';

class StateManager {
  private static instance: StateManager;
  private _treeDataProvider: I18nTreeDataProvider | undefined;
  private _state: MonitoringState = {
    isMonitoring: false,
    debounceTimer: undefined,
    currentKoreanRanges: [],
    currentI18nRanges: [],
  };

  private constructor() {}

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // TreeDataProvider 관리
  setTreeDataProvider(provider: I18nTreeDataProvider): void {
    this._treeDataProvider = provider;
  }

  getTreeDataProvider(): I18nTreeDataProvider {
    if (!this._treeDataProvider) {
      throw new Error('TreeDataProvider가 초기화되지 않았습니다.');
    }
    return this._treeDataProvider;
  }

  // 상태 관리
  getState(): MonitoringState {
    return this._state;
  }

  updateState(updates: Partial<MonitoringState>): void {
    this._state = { ...this._state, ...updates };
  }

  // 모니터링 상태 관리
  setMonitoring(isMonitoring: boolean): void {
    this._state.isMonitoring = isMonitoring;
    this._treeDataProvider?.setActive(isMonitoring);
  }

  isMonitoring(): boolean {
    return this._state.isMonitoring;
  }

  // 타이머 관리
  setDebounceTimer(timer: NodeJS.Timeout | undefined): void {
    if (this._state.debounceTimer) {
      clearTimeout(this._state.debounceTimer);
    }
    this._state.debounceTimer = timer;
  }

  clearDebounceTimer(): void {
    if (this._state.debounceTimer) {
      clearTimeout(this._state.debounceTimer);
      this._state.debounceTimer = undefined;
    }
  }

  // 범위 데이터 관리
  setKoreanRanges(ranges: TextRange[]): void {
    this._state.currentKoreanRanges = ranges;
  }

  setI18nRanges(ranges: TextRange[]): void {
    this._state.currentI18nRanges = ranges;
  }

  getKoreanRanges(): TextRange[] {
    return this._state.currentKoreanRanges;
  }

  getI18nRanges(): TextRange[] {
    return this._state.currentI18nRanges;
  }

  // KoreanRange 추가 메서드
  addKoreanRange(range: TextRange): void {
    const currentRanges = this.getKoreanRanges();
    this.setKoreanRanges([...currentRanges, range]);

    // TreeView와 하이라이트 자동 업데이트
    this.updateTreeView();
    this.updateHighlights();
  }

  // TreeView 업데이트 메서드
  private updateTreeView(): void {
    const allTexts = [
      ...this.getKoreanRanges().map((range) => ({ text: range.text, type: 'korean' as const })),
      ...this.getI18nRanges().map((range) => ({ text: range.text, type: 'i18n' as const })),
    ];
    this.getTreeDataProvider().updateData(allTexts);
  }

  // 이벤트 리스너 관리
  private eventListeners: any = null;

  setEventListeners(listeners: any): void {
    this.eventListeners = listeners;
  }

  clearEventListeners(): void {
    if (this.eventListeners) {
      this.eventListeners.onDidChangeActiveTextEditor.dispose();
      this.eventListeners.onDidChangeTextDocument.dispose();
      this.eventListeners = null;
    }
  }

  // 하이라이트 업데이트 함수
  updateHighlights(): void {
    if (!this.isMonitoring()) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    // 제외된 텍스트를 제외한 한글 범위들만 필터링
    const filteredKoreanRanges = this.getKoreanRanges().filter(
      (range) => !this.getTreeDataProvider().getExcludedTexts().has(range.text),
    );

    // 하이라이트 적용
    highlightText(editor, filteredKoreanRanges, this.getI18nRanges());
  }

  // 상태 초기화
  reset(): void {
    this.clearDebounceTimer();
    this.clearEventListeners();
    this._state = {
      isMonitoring: false,
      debounceTimer: undefined,
      currentKoreanRanges: [],
      currentI18nRanges: [],
    };
    this._treeDataProvider?.updateData([]);
    this._treeDataProvider?.clearExcludedTexts();
  }
}

// 전역 인스턴스 export
export const stateManager = StateManager.getInstance();
