import * as vscode from 'vscode';
import { I18nItem } from './i18n-item';
import type { TextRange } from '../types/common';

// TreeView 데이터 프로바이더
export class I18nTreeDataProvider implements vscode.TreeDataProvider<I18nItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<I18nItem | undefined | null | void> = new vscode.EventEmitter<
    I18nItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<I18nItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private koreanTexts: I18nItem[] = [];
  private i18nTexts: I18nItem[] = [];
  private isActive: boolean = false;
  private excludedTextIds: Set<string> = new Set(); // 제외된 텍스트의 고유 ID들
  private updateHighlightsCallback?: () => void;

  constructor(updateHighlightsCallback?: () => void) {
    this.updateHighlightsCallback = updateHighlightsCallback;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: I18nItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: I18nItem): Thenable<I18nItem[]> {
    if (!element) {
      // 루트 레벨: 섹션들만
      const items: I18nItem[] = [];

      // 국제화 대기 섹션
      const filteredCount = this.koreanTexts.filter((item) => !this.excludedTextIds.has(item.getUniqueId())).length;
      const pendingSection = new I18nItem(
        `🌐 Pending (${filteredCount})`,
        'pending-section',
        vscode.TreeItemCollapsibleState.Expanded,
      );
      pendingSection.children = this.koreanTexts.filter((item) => !this.excludedTextIds.has(item.getUniqueId()));
      items.push(pendingSection);

      // 국제화 완료 섹션
      const completedSection = new I18nItem(
        `✅ Applied (${this.i18nTexts.length})`,
        'completed-section',
        vscode.TreeItemCollapsibleState.Expanded,
      );
      completedSection.children = this.i18nTexts;
      items.push(completedSection);

      return Promise.resolve(items);
    }

    // 섹션의 자식들 반환
    if (element.type === 'pending-section') {
      // 한글 텍스트들만
      const filteredKoreanTexts = this.koreanTexts.filter((item) => !this.excludedTextIds.has(item.getUniqueId()));
      return Promise.resolve(filteredKoreanTexts);
    } else if (element.type === 'completed-section') {
      return Promise.resolve(this.i18nTexts);
    }

    return Promise.resolve([]);
  }

  updateData(texts: { text: string; type: 'korean' | 'i18n'; range?: TextRange }[]): void {
    this.koreanTexts = texts
      .filter((item) => item.type === 'korean')
      .map((item, index) => {
        const treeItem = new I18nItem(item.text, 'korean', vscode.TreeItemCollapsibleState.None, item.range);
        treeItem.tooltip = `Korean text: ${item.text}${item.range ? ` (${item.range.start}-${item.range.end})` : ''}`;
        treeItem.contextValue = 'korean-text';
        treeItem.command = {
          command: 'i18n-manager.goToText',
          title: 'Go to Text',
          arguments: [treeItem],
        };
        return treeItem;
      });

    this.i18nTexts = texts
      .filter((item) => item.type === 'i18n')
      .map((item, index) => {
        const treeItem = new I18nItem(item.text, 'i18n', vscode.TreeItemCollapsibleState.None, item.range);
        treeItem.tooltip = `i18n applied: ${item.text}${item.range ? ` (${item.range.start}-${item.range.end})` : ''}`;
        treeItem.contextValue = 'i18n-text';
        treeItem.command = {
          command: 'i18n-manager.goToText',
          title: 'Go to Text',
          arguments: [treeItem],
        };
        return treeItem;
      });

    this.refresh();
  }

  setActive(active: boolean): void {
    this.isActive = active;
    this.refresh();

    // 컨텍스트 키 설정
    vscode.commands.executeCommand('setContext', 'i18nManager.isActive', active);
  }

  getActive(): boolean {
    return this.isActive;
  }

  excludeText(item: I18nItem): void {
    this.excludedTextIds.add(item.getUniqueId());
    this.refresh(); // TreeView 새로고침으로 카운트 업데이트

    // 하이라이트 업데이트
    if (this.updateHighlightsCallback) {
      this.updateHighlightsCallback();
    }
  }

  includeText(item: I18nItem): void {
    this.excludedTextIds.delete(item.getUniqueId());
    this.refresh(); // TreeView 새로고침으로 카운트 업데이트

    // 하이라이트 업데이트
    if (this.updateHighlightsCallback) {
      this.updateHighlightsCallback();
    }
  }

  getExcludedTexts(): Set<string> {
    return this.excludedTextIds;
  }

  clearExcludedTexts(): void {
    this.excludedTextIds.clear();
  }

  getAllKoreanTexts(): string[] {
    return this.koreanTexts.map((item) => item.label);
  }

  getFilteredKoreanTexts(): string[] {
    return this.koreanTexts.filter((item) => !this.excludedTextIds.has(item.getUniqueId())).map((item) => item.label);
  }
}
