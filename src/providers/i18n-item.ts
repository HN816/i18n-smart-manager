import * as vscode from 'vscode';
import type { I18nItemType } from '../types';

// TreeView 아이템 클래스
export class I18nItem extends vscode.TreeItem {
  public children?: I18nItem[];

  constructor(
    public readonly label: string,
    public readonly type: I18nItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);

    if (type === 'korean') {
      this.iconPath = new vscode.ThemeIcon('text');
      this.description = 'Korean text';
    } else if (type === 'i18n') {
      this.iconPath = new vscode.ThemeIcon('check');
      this.description = 'i18n applied';
    }
  }
}
