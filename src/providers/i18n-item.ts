import * as vscode from 'vscode';

// TreeView 아이템 클래스
export class I18nItem extends vscode.TreeItem {
  public children?: I18nItem[];

  constructor(
    public readonly label: string,
    public readonly type:
      | 'korean'
      | 'i18n'
      | 'start'
      | 'stop'
      | 'refresh'
      | 'pending-section'
      | 'completed-section'
      | 'button-container'
      | 'control-buttons'
      | 'convert-button',
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
