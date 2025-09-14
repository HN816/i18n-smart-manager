import * as vscode from 'vscode';
import { clearAllDecorations } from './services/text-highlighting';
import { I18nTreeDataProvider } from './providers';
import { stateManager } from './state';
import { registerAllCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  const treeDataProvider = new I18nTreeDataProvider(() => stateManager.updateHighlights());
  stateManager.setTreeDataProvider(treeDataProvider);
  vscode.window.createTreeView('i18nManager', { treeDataProvider });

  registerAllCommands(context);
}

export function deactivate() {
  clearAllDecorations();
  stateManager.reset();
}
