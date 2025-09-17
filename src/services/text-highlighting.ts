import * as vscode from 'vscode';
import { TextRange } from '../types';

class TextHighlightingService {
  private currentDecorations: vscode.TextEditorDecorationType[] = [];

  // 설정에서 색상과 스타일 가져오기
  private getHighlightingConfig() {
    const config = vscode.workspace.getConfiguration('I18nSmartManager.highlighting');

    return {
      koreanTextColor: config.get<string>('koreanTextColor', '#ffe44c'),
      i18nTextColor: config.get<string>('i18nTextColor', '#90EE90'),
      koreanTextDecoration: config.get<string>('koreanTextDecoration', 'underline wavy'),
      i18nTextDecoration: config.get<string>('i18nTextDecoration', 'underline'),
    };
  }

  // 텍스트 하이라이트
  highlightText(editor: vscode.TextEditor, koreanRanges: TextRange[], i18nRanges: TextRange[]): void {
    const document = editor.document;
    const config = this.getHighlightingConfig();

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
      textDecoration: config.koreanTextDecoration as any,
      color: config.koreanTextColor,
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
      textDecoration: config.i18nTextDecoration as any,
      color: config.i18nTextColor,
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
