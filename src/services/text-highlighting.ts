import * as vscode from 'vscode';
import { TextRange } from '../types';

class TextHighlightingService {
  private currentDecorations: vscode.TextEditorDecorationType[] = [];

  // 텍스트 하이라이트
  highlightText(editor: vscode.TextEditor, koreanRanges: TextRange[], i18nRanges: TextRange[]): void {
    const document = editor.document;

    // 기존 하이라이트 제거
    this.clearDecorations(editor);

    // 한글 텍스트 하이라이트
    const koreanDecorations: vscode.DecorationOptions[] = [];
    koreanRanges.forEach((range) => {
      const startPos = document.positionAt(range.start);
      const endPos = document.positionAt(range.end);
      koreanDecorations.push({
        range: new vscode.Range(startPos, endPos),
      });
    });

    const koreanDecorationType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline wavy',
      color: '#ffe44cff',
    });

    // i18n 텍스트 하이라이트
    const i18nDecorations: vscode.DecorationOptions[] = [];
    i18nRanges.forEach((range) => {
      const startPos = document.positionAt(range.start);
      const endPos = document.positionAt(range.end);
      i18nDecorations.push({
        range: new vscode.Range(startPos, endPos),
      });
    });

    const i18nDecorationType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline',
      color: '#90EE90ff',
    });

    editor.setDecorations(koreanDecorationType, koreanDecorations);
    editor.setDecorations(i18nDecorationType, i18nDecorations);

    // 현재 사용 중인 데코레이션 저장
    this.currentDecorations = [koreanDecorationType, i18nDecorationType];
  }

  // 기존 하이라이트 제거
  clearDecorations(editor: vscode.TextEditor): void {
    this.currentDecorations.forEach((decoration) => {
      editor.setDecorations(decoration, []);
      decoration.dispose();
    });
    this.currentDecorations = [];
  }

  // 모든 에디터에서 하이라이트 제거
  clearAllDecorations(): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.clearDecorations(editor);
    });
  }

  // 현재 데코레이션 상태 확인
  hasActiveDecorations(): boolean {
    return this.currentDecorations.length > 0;
  }
}

const service = new TextHighlightingService();

export const highlightText = (editor: vscode.TextEditor, koreanRanges: TextRange[], i18nRanges: TextRange[]) =>
  service.highlightText(editor, koreanRanges, i18nRanges);
export const clearDecorations = (editor: vscode.TextEditor) => service.clearDecorations(editor);
export const clearAllDecorations = () => service.clearAllDecorations();
export const hasActiveDecorations = () => service.hasActiveDecorations();
