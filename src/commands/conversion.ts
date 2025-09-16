import * as vscode from 'vscode';
import { stateManager } from '../state';
import {
  highlightConversionTargets,
  clearConversionPreview,
  applyConversionFromPreview,
  setNamespace,
  getNamespace,
} from '../services/text-conversion';

export function registerConversionCommands(context: vscode.ExtensionContext): void {
  // 변환 미리보기 명령어 등록
  const previewCommand = vscode.commands.registerCommand('i18n-manager.previewConversion', async () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();

    if (filteredTexts.length === 0) {
      vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
      return;
    }

    // 네임스페이스 입력 받기
    const namespace = await vscode.window.showInputBox({
      prompt: `네임스페이스 입력 (선택사항)\n`,
      placeHolder: 'common → t(\'common.안녕하세요\')',
      value: getNamespace(),
      ignoreFocusOut: true,
    });

    if (namespace === undefined) {
      return; // 사용자가 취소한 경우
    }

    // 네임스페이스 설정
    setNamespace(namespace || '');

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

    // 네임스페이스 입력 받기
    const namespace = await vscode.window.showInputBox({
      prompt: `네임스페이스 입력 (선택사항)\n`,
      placeHolder: 'common → t(\'common.안녕하세요\')',
      value: getNamespace(),
      ignoreFocusOut: true,
    });

    if (namespace === undefined) {
      return; // 사용자가 취소한 경우
    }

    // 네임스페이스 설정
    setNamespace(namespace || '');

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
