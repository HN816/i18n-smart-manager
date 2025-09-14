// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractKoreanTexts } from './services/korean-extraction';
import { highlightText, clearDecorations, clearAllDecorations } from './services/text-highlighting';
import { I18nTreeDataProvider } from './providers';
import { stateManager } from './state';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // TreeView 데이터 프로바이더 생성
  const treeDataProvider = new I18nTreeDataProvider(updateHighlights);
  stateManager.setTreeDataProvider(treeDataProvider);
  vscode.window.createTreeView('i18nManager', { treeDataProvider });

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
    const { highlightConversionTargets } = require('./services/text-conversion');
    highlightConversionTargets(filteredTexts, ranges);
  });

  // 미리보기 제거 명령어 등록
  const clearPreviewCommand = vscode.commands.registerCommand('i18n-manager.clearPreview', () => {
    const { clearConversionPreview } = require('./services/text-conversion');
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

    const { applyConversionFromPreview } = require('./services/text-conversion');
    await applyConversionFromPreview(filteredTexts, ranges);

    // 변환 후 새로고침
    if (stateManager.isMonitoring()) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        extractKoreanTextsFromEditor(editor);
      }
    }
  });

  // 선택된 텍스트를 pending에 추가하는 명령어 등록
  const addSelectedCommand = vscode.commands.registerCommand('i18n-manager.addSelected', () => {
    addSelectedTextToPending();
  });

  // locales.json 생성 명령어 등록
  const generateLocalesCommand = vscode.commands.registerCommand('i18n-manager.generateLocales', async () => {
    const filteredTexts = stateManager.getTreeDataProvider().getFilteredKoreanTexts();
    const { showLocalesGenerationDialog } = require('./services/locale-generation');
    await showLocalesGenerationDialog(filteredTexts);
  });

  // 스프레드시트 업로드 명령어 등록
  const uploadToSpreadsheetCommand = vscode.commands.registerCommand('i18n-manager.uploadToSpreadsheet', () => {
    const { uploadLocalesToSpreadsheet } = require('./services/spreadsheet');
    uploadLocalesToSpreadsheet();
  });

  // 모든 명령어를 context에 등록
  context.subscriptions.push(
    startCommand,
    stopCommand,
    refreshCommand,
    excludeCommand,
    includeCommand,
    goToTextCommand,
    previewCommand,
    clearPreviewCommand,
    convertAllCommand,
    addSelectedCommand,
    generateLocalesCommand,
    uploadToSpreadsheetCommand,
  );
}

// 하이라이트 업데이트 함수
function updateHighlights(): void {
  if (!stateManager.isMonitoring()) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // 제외된 텍스트를 제외한 한글 범위들만 필터링
  const filteredKoreanRanges = stateManager
    .getKoreanRanges()
    .filter((range) => !stateManager.getTreeDataProvider().getExcludedTexts().has(range.text));

  // 하이라이트 적용
  highlightText(editor, filteredKoreanRanges, stateManager.getI18nRanges());
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

  // TreeView에 표시할 데이터 준비
  const allTexts = [
    ...koreanRanges.map((range) => ({ text: range.text, type: 'korean' as const })),
    ...i18nRanges.map((range) => ({ text: range.text, type: 'i18n' as const })),
  ];

  // 하이라이트 적용 (제외된 텍스트 제외)
  const filteredKoreanRanges = koreanRanges.filter(
    (range) => !stateManager.getTreeDataProvider().getExcludedTexts().has(range.text),
  );
  highlightText(editor, filteredKoreanRanges, i18nRanges);

  // TreeView 업데이트
  stateManager.getTreeDataProvider().updateData(allTexts);
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

// This method is called when your extension is deactivated
export function deactivate() {
  // 모든 에디터에서 하이라이트 제거
  clearAllDecorations();
  stateManager.reset();
}
