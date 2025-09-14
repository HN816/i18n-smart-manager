import * as vscode from 'vscode';
import { I18nItem } from './i18n-item';

// TreeView 데이터 프로바이더
export class I18nTreeDataProvider implements vscode.TreeDataProvider<I18nItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<I18nItem | undefined | null | void> = new vscode.EventEmitter<
    I18nItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<I18nItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private koreanTexts: I18nItem[] = [];
  private i18nTexts: I18nItem[] = [];
  private isActive: boolean = false;
  private excludedTexts: Set<string> = new Set(); // 제외된 텍스트들
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
      const filteredCount = this.koreanTexts.filter((item) => !this.excludedTexts.has(item.label)).length;
      const pendingSection = new I18nItem(
        `🌐 Pending (${filteredCount})`,
        'pending-section',
        vscode.TreeItemCollapsibleState.Expanded,
      );
      pendingSection.children = this.koreanTexts.filter((item) => !this.excludedTexts.has(item.label));
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
      const filteredKoreanTexts = this.koreanTexts.filter((item) => !this.excludedTexts.has(item.label));
      return Promise.resolve(filteredKoreanTexts);
    } else if (element.type === 'completed-section') {
      return Promise.resolve(this.i18nTexts);
    }

    return Promise.resolve([]);
  }

  updateData(texts: { text: string; type: 'korean' | 'i18n' }[]): void {
    this.koreanTexts = texts
      .filter((item) => item.type === 'korean')
      .map((item, index) => {
        const treeItem = new I18nItem(item.text, 'korean', vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = `Korean text: ${item.text}`;
        treeItem.contextValue = 'korean-text';
        // 클릭 시 해당 위치로 이동
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
        const treeItem = new I18nItem(item.text, 'i18n', vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = `i18n applied: ${item.text}`;
        treeItem.contextValue = 'i18n-text';
        // 클릭 시 해당 위치로 이동
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

  excludeText(text: string): void {
    this.excludedTexts.add(text);
    this.refresh(); // TreeView 새로고침으로 카운트 업데이트

    // 하이라이트 업데이트
    if (this.updateHighlightsCallback) {
      this.updateHighlightsCallback();
    }
  }

  includeText(text: string): void {
    this.excludedTexts.delete(text);
    this.refresh(); // TreeView 새로고침으로 카운트 업데이트

    // 하이라이트 업데이트
    if (this.updateHighlightsCallback) {
      this.updateHighlightsCallback();
    }
  }

  getExcludedTexts(): Set<string> {
    return this.excludedTexts;
  }

  // 제외 목록 초기화 메서드 추가
  clearExcludedTexts(): void {
    this.excludedTexts.clear();
  }

  // 제외되지 않은 한글 텍스트 목록을 반환하는 메서드 추가
  getFilteredKoreanTexts(): string[] {
    return this.koreanTexts.filter((item) => !this.excludedTexts.has(item.label)).map((item) => item.label);
  }
}
