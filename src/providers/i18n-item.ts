import * as vscode from 'vscode';
import type { I18nItemType } from '../types';
import type { TextRange } from '../types/common';

// TreeView 아이템 클래스
export class I18nItem extends vscode.TreeItem {
  public children?: I18nItem[];
  public readonly range?: TextRange;

  constructor(
    public readonly label: string,
    public readonly type: I18nItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    range?: TextRange,
  ) {
    super(label, collapsibleState);
    this.range = range;

    if (type === 'korean') {
      this.iconPath = new vscode.ThemeIcon('text');
      this.description = 'Korean text';
    } else if (type === 'i18n') {
      this.iconPath = new vscode.ThemeIcon('check');
      this.description = 'i18n applied';
    }
  }

  // 위치 정보를 기반으로 고유 ID 생성
  getUniqueId(): string {
    if (this.range) {
      return `${this.label}:${this.range.start}:${this.range.end}`;
    }
    return this.label;
  }
}
