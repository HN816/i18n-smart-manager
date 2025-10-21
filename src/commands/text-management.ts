import * as vscode from 'vscode';
import { stateManager } from '../state';
import { I18nItem } from '../providers/i18n-item';

export function registerTextManagementCommands(context: vscode.ExtensionContext): void {
  // 텍스트 제외 명령어 등록
  const excludeCommand = vscode.commands.registerCommand('i18n-smart-manager.exclude', (item: any) => {
    if (item.type === 'korean') {
      stateManager.getTreeDataProvider().excludeText(item);
    }
  });

  // 텍스트 포함 명령어 등록
  const includeCommand = vscode.commands.registerCommand('i18n-smart-manager.include', (item: any) => {
    if (item.type === 'korean') {
      stateManager.getTreeDataProvider().includeText(item);
    }
  });

  // 텍스트 위치로 이동 명령어 등록
  const goToTextCommand = vscode.commands.registerCommand('i18n-smart-manager.goToText', (item: any) => {
    if (item.type === 'korean' || item.type === 'i18n') {
      goToTextLocation(item);
    }
  });

  // 선택된 텍스트를 pending에 추가하는 명령어 등록
  const addSelectedCommand = vscode.commands.registerCommand('i18n-smart-manager.addSelected', () => {
    addSelectedTextToPending();
  });

  context.subscriptions.push(excludeCommand, includeCommand, goToTextCommand, addSelectedCommand);
}

// 텍스트 위치로 이동하는 함수
function goToTextLocation(item: any): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('활성 편집기가 없습니다.');
    return;
  }

  // I18nItem에 range 정보가 있는 경우 해당 위치로 이동
  if (item.range) {
    const startPos = editor.document.positionAt(item.range.start);
    const endPos = editor.document.positionAt(item.range.end);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos));
    return;
  }

  // 텍스트 검색으로 이동
  const text = item.label;
  const document = editor.document;
  const textContent = document.getText();

  // 텍스트가 포함된 위치 찾기
  const index = textContent.indexOf(text);
  if (index !== -1) {
    const startPos = document.positionAt(index);
    const endPos = document.positionAt(index + text.length);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos));
  } else {
    vscode.window.showWarningMessage(`텍스트 "${text}"를 찾을 수 없습니다.`);
  }
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

  // 선택된 텍스트의 위치 정보 생성
  const start = editor.document.offsetAt(selection.start);
  const end = editor.document.offsetAt(selection.end);

  // 새로운 KoreanRange 생성
  const newRange = {
    start: start,
    end: end,
    text: selectedText,
  };

  // 고유 ID 생성 (기존 로직과 동일)
  const uniqueId = `${selectedText}:${start}:${end}`;

  // 제외된 텍스트 목록 확인
  const excludedIds = stateManager.getTreeDataProvider().getExcludedTexts();

  if (excludedIds.has(uniqueId)) {
    // 이미 제외된 텍스트라면 다시 포함시키기
    // I18nItem 객체 생성 (includeText 함수에서 사용)
    const tempItem = new I18nItem(selectedText, 'korean', vscode.TreeItemCollapsibleState.None, newRange);

    stateManager.getTreeDataProvider().includeText(tempItem);
    vscode.window.showInformationMessage('제외된 텍스트를 다시 포함시켰습니다.');
  } else {
    // 새로운 텍스트라면 pending 목록에 추가
    stateManager.addKoreanRange(newRange);
    vscode.window.showInformationMessage('pending 목록에 추가되었습니다.');
  }
}
