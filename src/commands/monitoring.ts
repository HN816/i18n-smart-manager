import * as vscode from 'vscode';
import { stateManager } from '../state';
import { extractKoreanTexts } from '../services/korean-extraction';
import { highlightText, clearDecorations } from '../services/text-highlighting';

export function registerMonitoringCommands(context: vscode.ExtensionContext): void {
  // Start 명령어 등록
  const startCommand = vscode.commands.registerCommand('i18n-manager.start', () => {
    startMonitoring();
  });

  // Stop 명령어 등록
  const stopCommand = vscode.commands.registerCommand('i18n-manager.stop', () => {
    stopMonitoring();
  });

  // 새로고침 명령어 등록
  const refreshCommand = vscode.commands.registerCommand('i18n-manager.refresh', () => {
    if (stateManager.isMonitoring()) {
      // 사용자 제외 목록 초기화
      stateManager.getTreeDataProvider().clearExcludedTexts();

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        extractKoreanTextsFromEditor(editor);
      }
    }
  });

  context.subscriptions.push(startCommand, stopCommand, refreshCommand);
}

// 모니터링 시작
function startMonitoring(): void {
  if (stateManager.isMonitoring()) {
    return;
  }

  stateManager.setMonitoring(true);

  // 현재 활성 편집기에서 한글 텍스트 추출
  const extractFromCurrentEditor = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      extractKoreanTextsFromEditor(editor);
    }
  };

  // 활성 편집기가 변경될 때마다 실행
  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && stateManager.isMonitoring()) {
      extractKoreanTextsFromEditor(editor);
    }
  });

  // 문서가 변경될 때마다 실행 (디바운스 적용)
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === event.document && stateManager.isMonitoring()) {
      stateManager.clearDebounceTimer();
      const timer = setTimeout(() => {
        extractKoreanTextsFromEditor(editor);
      }, 500); // 500ms 디바운스
      stateManager.setDebounceTimer(timer);
    }
  });

  // 초기 실행
  extractFromCurrentEditor();

  // 이벤트 리스너들을 저장
  stateManager.setEventListeners({
    onDidChangeActiveTextEditor,
    onDidChangeTextDocument,
  });
}

// 모니터링 중지
function stopMonitoring(): void {
  if (!stateManager.isMonitoring()) {
    return;
  }

  stateManager.setMonitoring(false);
  stateManager.clearEventListeners();
  stateManager.clearDebounceTimer();

  // 하이라이트 제거
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    clearDecorations(editor);
  }

  // 상태 초기화
  stateManager.reset();
}

// 한글 텍스트 추출 함수
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

  // TreeView에 표시할 데이터 준비 (range 정보 포함)
  const allTexts = [
    ...koreanRanges.map((range) => ({ text: range.text, type: 'korean' as const, range })),
    ...i18nRanges.map((range) => ({ text: range.text, type: 'i18n' as const, range })),
  ];

  // 하이라이트 적용 (제외된 텍스트 ID 기반으로 필터링)
  const excludedIds = stateManager.getTreeDataProvider().getExcludedTexts();
  const filteredKoreanRanges = koreanRanges.filter((range) => {
    const uniqueId = `${range.text}:${range.start}:${range.end}`;
    return !excludedIds.has(uniqueId);
  });
  highlightText(editor, filteredKoreanRanges, i18nRanges);

  // TreeView 업데이트
  stateManager.getTreeDataProvider().updateData(allTexts);
}
