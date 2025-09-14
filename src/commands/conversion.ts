import * as vscode from 'vscode';
import { stateManager } from '../state';
import {
  highlightConversionTargets,
  clearConversionPreview,
  applyConversionFromPreview,
} from '../services/text-conversion';

export function registerConversionCommands(context: vscode.ExtensionContext): void {
  // 변환 미리보기 명령어 등록
  const previewCommand = vscode.commands.registerCommand('i18n-manager.previewConversion', () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();

    if (filteredTexts.length === 0) {
      vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
      return;
    }

    // 범위 정보도 함께 전달 (고유 ID 기반으로 필터링)
    const excludedIds = stateManager.getTreeDataProvider().getExcludedTexts();
    const ranges = stateManager.getKoreanRanges().filter((range) => {
      const uniqueId = `${range.text}:${range.start}:${range.end}`;
      return !excludedIds.has(uniqueId);
    });

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

    // 범위 정보도 함께 전달 (고유 ID 기반으로 필터링)
    const excludedIds = stateManager.getTreeDataProvider().getExcludedTexts();
    const ranges = stateManager.getKoreanRanges().filter((range) => {
      const uniqueId = `${range.text}:${range.start}:${range.end}`;
      return !excludedIds.has(uniqueId);
    });

    await applyConversionFromPreview(filteredTexts, ranges);
  });

  context.subscriptions.push(previewCommand, clearPreviewCommand, convertAllCommand);
}
