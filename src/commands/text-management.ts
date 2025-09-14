import * as vscode from 'vscode';
import { stateManager } from '../state';
import { highlightText } from '../services/text-highlighting';

export function registerTextManagementCommands(context: vscode.ExtensionContext): void {
  // 텍스트 제외 명령어 등록
  const excludeCommand = vscode.commands.registerCommand('i18n-manager.exclude', (item: any) => {
    if (item.type === 'korean') {
      stateManager.getTreeDataProvider().excludeText(item.label);
    }
  });

  // 텍스트 포함 명령어 등록
  const includeCommand = vscode.commands.registerCommand('i18n-manager.include', (item: any) => {
    if (item.type === 'korean') {
      stateManager.getTreeDataProvider().includeText(item.label);
    }
  });

  // 텍스트 위치로 이동 명령어 등록
  const goToTextCommand = vscode.commands.registerCommand('i18n-manager.goToText', (item: any) => {
    if (item.type === 'korean' || item.type === 'i18n') {
      goToTextLocation(item.label);
    }
  });

  // 선택된 텍스트를 pending에 추가하는 명령어 등록
  const addSelectedCommand = vscode.commands.registerCommand('i18n-manager.addSelected', () => {
    addSelectedTextToPending();
  });

  context.subscriptions.push(excludeCommand, includeCommand, goToTextCommand, addSelectedCommand);
}

// 텍스트 위치로 이동하는 함수
function goToTextLocation(text: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('활성 편집기가 없습니다.');
    return;
  }

  // 현재 범위들에서 해당 텍스트 찾기
  const allRanges = [...stateManager.getKoreanRanges(), ...stateManager.getI18nRanges()];
  const targetRange = allRanges.find((range) => range.text === text);

  if (!targetRange) {
    vscode.window.showWarningMessage(`"${text}"을(를) 찾을 수 없습니다.`);
    return;
  }

  // 위치로 이동
  const startPos = editor.document.positionAt(targetRange.start);
  const endPos = editor.document.positionAt(targetRange.end);
  const range = new vscode.Range(startPos, endPos);

  // 선택하고 스크롤
  editor.selection = new vscode.Selection(startPos, endPos);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

  // 포커스 이동
  vscode.window.showTextDocument(editor.document, editor.viewColumn);
}

// 선택된 텍스트를 pending에 추가하는 함수
function addSelectedTextToPending(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('활성 편집기가 없습니다.');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('텍스트를 선택해주세요.');
    return;
  }

  const selectedText = editor.document.getText(selection).trim();
  if (!selectedText) {
    vscode.window.showWarningMessage('선택된 텍스트가 없습니다.');
    return;
  }

  // 한글이 포함되어 있는지 확인
  if (!/[가-힣]/.test(selectedText)) {
    vscode.window.showWarningMessage('선택된 텍스트에 한글이 포함되어 있지 않습니다.');
    return;
  }

  // 이미 pending에 있는지 확인
  const existingTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();
  if (existingTexts.includes(selectedText)) {
    vscode.window.showInformationMessage('이미 pending 목록에 있는 텍스트입니다.');
    return;
  }

  // 선택된 텍스트의 위치 정보 생성
  const start = editor.document.offsetAt(selection.start);
  const end = editor.document.offsetAt(selection.end);

  // 새로운 KoreanRange 생성
  const newRange = {
    start: start,
    end: end,
    text: selectedText,
  };

  // currentKoreanRanges에 추가
  const currentRanges = stateManager.getKoreanRanges();
  currentRanges.push(newRange);
  stateManager.setKoreanRanges(currentRanges);

  // TreeView 업데이트
  const allTexts = [
    ...stateManager.getKoreanRanges().map((range) => ({ text: range.text, type: 'korean' as const })),
    ...stateManager.getI18nRanges().map((range) => ({ text: range.text, type: 'i18n' as const })),
  ];
  stateManager.getTreeDataProvider().updateData(allTexts);

  // 하이라이트 업데이트
  const filteredKoreanRanges = stateManager
    .getKoreanRanges()
    .filter((range) => !stateManager.getTreeDataProvider().getExcludedTexts().has(range.text));
  highlightText(editor, filteredKoreanRanges, stateManager.getI18nRanges());

  vscode.window.showInformationMessage('pending 목록에 추가되었습니다.');
}
