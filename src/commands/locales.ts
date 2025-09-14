import * as vscode from 'vscode';
import { stateManager } from '../state';
import { showLocalesGenerationDialog } from '../services/locale-generation';
import { uploadLocalesToSpreadsheet } from '../services/spreadsheet';

export function registerLocalesCommands(context: vscode.ExtensionContext): void {
  // locales.json 생성 명령어 등록
  const generateLocalesCommand = vscode.commands.registerCommand('i18n-manager.generateLocales', async () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();
    await showLocalesGenerationDialog(filteredTexts);
  });

  // 스프레드시트 업로드 명령어 등록
  const uploadToSpreadsheetCommand = vscode.commands.registerCommand('i18n-manager.uploadToSpreadsheet', () => {
    uploadLocalesToSpreadsheet();
  });

  context.subscriptions.push(generateLocalesCommand, uploadToSpreadsheetCommand);
}
