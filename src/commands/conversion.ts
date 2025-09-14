import * as vscode from 'vscode';
import { stateManager } from '../state';
import {
  highlightConversionTargets,
  clearConversionPreview,
  applyConversionFromPreview,
} from '../services/text-conversion';
import { extractKoreanTexts } from '../services/korean-extraction';

export function registerConversionCommands(context: vscode.ExtensionContext): void {
  // 변환 미리보기 명령어 등록
  const previewCommand = vscode.commands.registerCommand('i18n-manager.previewConversion', () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();

    if (filteredTexts.length === 0) {
      vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
      return;
    }

    // 범위 정보도 함께 전달
    const ranges = stateManager
      .getKoreanRanges()
      .filter((range) => !stateManager.getTreeDataProvider().getExcludedTexts().has(range.text));

    // 변환 미리보기 표시
    highlightConversionTargets(filteredTexts, ranges);
  });

  // 미리보기 제거 명령어 등록
  const clearPreviewCommand = vscode.commands.registerCommand('i18n-manager.clearPreview', () => {
    clearConversionPreview();
  });

  // 전체 변환 명령어 등록
  const convertAllCommand = vscode.commands.registerCommand('i18n-manager.convertAll', async () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();

    if (filteredTexts.length === 0) {
      vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
      return;
    }

    // 범위 정보도 함께 전달
    const ranges = stateManager
      .getKoreanRanges()
      .filter((range) => !stateManager.getTreeDataProvider().getExcludedTexts().has(range.text));

    await applyConversionFromPreview(filteredTexts, ranges);

    // 변환 후 새로고침
    if (stateManager.isMonitoring()) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        extractKoreanTextsFromEditor(editor);
      }
    }
  });

  context.subscriptions.push(previewCommand, clearPreviewCommand, convertAllCommand);
}

// 한글 텍스트 추출 함수 (conversion에서 사용)
function extractKoreanTextsFromEditor(editor: vscode.TextEditor): void {
  if (!stateManager.isMonitoring()) {
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const fileName = document.fileName;

  // 한글 텍스트 추출
  const { koreanRanges, i18nRanges } = extractKoreanTexts(text, fileName);

  // 상태에 저장
  stateManager.setKoreanRanges(koreanRanges);
  stateManager.setI18nRanges(i18nRanges);

  // TreeView에 표시할 데이터 준비
  const allTexts = [
    ...koreanRanges.map((range) => ({ text: range.text, type: 'korean' as const })),
    ...i18nRanges.map((range) => ({ text: range.text, type: 'i18n' as const })),
  ];

  // TreeView 업데이트
  stateManager.getTreeDataProvider().updateData(allTexts);
}
