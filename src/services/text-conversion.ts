import * as vscode from 'vscode';
import type { VariableInfo, Modification } from '../types';
import { getFileType, isQuotedText } from '../utils';

// 텍스트 변환 서비스 클래스
class TextConversionService {
  private currentPreviewDecoration: vscode.TextEditorDecorationType | null = null;
  private savedModifications: Modification[] = [];

  // 커스텀 함수를 안전하게 실행하는 함수
  private executeCustomFunction(customCode: string, text: string): string {
    try {
      // 보안을 위해 Function 생성자 사용 (eval보다 안전)
      const customFunction = new Function('text', `return (${customCode})(text);`);
      const result = customFunction(text);

      // 결과가 문자열인지 확인
      if (typeof result !== 'string') {
        throw new Error('함수는 문자열을 반환해야 합니다.');
      }

      return result;
    } catch (error: any) {
      // 에러 발생 시 기본 변환 사용
      console.warn('커스텀 함수 실행 중 오류:', error);
      vscode.window.showWarningMessage(`키 생성 함수 오류: ${error.message}. 기본 변환을 사용합니다.`);

      // 기본 변환 로직
      return text.replace(/\s+/g, '_').replace(/\./g, '#dot#');
    }
  }

  // 변수 포함 텍스트를 i18n 형태로 변환
  private convertTextWithVariables(text: string, range: { start: number, end: number, text: string }): string {
    const variableInfo = this.extractVariables(text);
    let i18nFunction: string;

    if (variableInfo.variables.length === 0) {
      // 변수가 없는 경우 기존 로직 사용
      const i18nKey = this.convertToI18nKey(text);
      i18nFunction = `t('${i18nKey}')`;
    } else {
      // 변수가 있는 경우 템플릿 기반으로 변환
      const templateKey = this.convertToI18nKey(variableInfo.template);
      const variablesArray = variableInfo.variables.join(', ');
      i18nFunction = `t('${templateKey}', [${variablesArray}])`;
    }

    if (isQuotedText(text)) {
      return i18nFunction;
    }

    const fileType = getFileType();
    if (!fileType) {
      return i18nFunction;
    }

    const wrapperMap = {
      tsx: `{${i18nFunction}}`,
      vue: `{{${i18nFunction}}}`,
      ts: i18nFunction
    };

    return wrapperMap[fileType] || i18nFunction;
  }

  // 미리보기 로직을 내부적으로 실행하는 헬퍼 함수 (화면에 표시하지 않음) - 변수 포함 지원
  private calculateModifications(texts: string[], ranges: { start: number; end: number; text: string }[]): void {
    // 수정사항 초기화
    this.savedModifications = [];

    // 중복 제거를 위해 처리된 범위 추적
    const processedRanges: { start: number; end: number }[] = [];

    // 각 텍스트에 대해 변환될 부분 계산
    texts.forEach((text) => {
      // 같은 텍스트에 해당하는 모든 범위 찾기
      const matchingRanges = ranges.filter((r) => r.text === text);

      matchingRanges.forEach((range) => {
        // 이미 처리된 범위와 겹치는지 확인
        const isOverlapping = processedRanges.some(
          (processed) => range.start < processed.end && range.end > processed.start,
        );

        if (!isOverlapping) {
          // 변수 포함 텍스트 변환
          const conversionPreview = this.convertTextWithVariables(text, range);

          // 수정사항 저장
          this.savedModifications.push({
            start: range.start,
            end: range.end,
            replacement: conversionPreview,
          });

          // 처리된 범위에 추가
          processedRanges.push({ start: range.start, end: range.end });
        }
      });
    });
  }

  // 텍스트에서 변수 추출 및 템플릿 생성
  extractVariables(text: string): VariableInfo {
    const variables: string[] = [];
    let template = text;
    let index = 0;

    // ${} 형태 변수 찾기
    const dollarMatches = text.matchAll(/\$\{\s*([^}]+)\s*\}/g);
    for (const match of dollarMatches) {
      const variableName = match[1].trim();
      variables.push(variableName);
      template = template.replace(match[0], `{${index}}`);
      index++;
    }

    const fileType = getFileType();
    if (fileType === 'vue') {
      // {{}} 형태 변수 찾기
      const braceMatches = text.matchAll(/\{\{\s*([^}]+)\s*\}\}/g);
      for (const match of braceMatches) {
        const variableName = match[1].trim();
        variables.push(variableName);
        template = template.replace(match[0], `{${index}}`);
        index++;
      }
    } else if (fileType === 'tsx') {
      // {} 형태 변수 찾기
      const jsxBraceMatches = text.matchAll(/\{\s*([^}]+)\s*\}/g);
      for (const match of jsxBraceMatches) {
        const variableName = match[1].trim();
        variables.push(variableName);
        template = template.replace(match[0], `{${index}}`);
        index++;
      }
    }

    return {
      originalText: text,
      variables,
      template,
    };
  }

  // 텍스트를 i18n 키로 변환하는 함수 (커스텀 함수 사용)
  convertToI18nKey(text: string): string {
    const config = vscode.workspace.getConfiguration('i18nManager.keyGeneration');
    const customFunction = config.get<string>(
      'customFunction',
      "text => text.replace(/\\s+/g, '_').replace(/\\./g, '#dot#')",
    );

    // 따옴표로 감싸진 텍스트인 경우 시작과 끝의 따옴표 제거
    let cleanText = text;
    if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith("`") && text.endsWith("`"))) {
      cleanText = text.slice(1, -1);
    }

    return this.executeCustomFunction(customFunction, cleanText);
  }

  // 변환될 부분을 미리 하이라이트하는 테스트 함수
  highlightConversionTargets(texts: string[], ranges: { start: number; end: number; text: string }[]): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('활성 편집기가 없습니다.');
      return;
    }

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];

    // 수정사항 초기화
    this.savedModifications = [];

    // 중복 제거를 위해 처리된 범위 추적
    const processedRanges: { start: number; end: number }[] = [];

    // 각 텍스트에 대해 변환될 부분 하이라이트
    texts.forEach((text) => {
      // 같은 텍스트에 해당하는 모든 범위 찾기
      const matchingRanges = ranges.filter((r) => r.text === text);

      matchingRanges.forEach((range) => {
        // 이미 처리된 범위와 겹치는지 확인
        const isOverlapping = processedRanges.some(
          (processed) => range.start < processed.end && range.end > processed.start,
        );

        if (!isOverlapping) {
          const startPos = document.positionAt(range.start);
          const endPos = document.positionAt(range.end);

          // 변수 포함 텍스트 변환
          const conversionPreview = this.convertTextWithVariables(text, range);

          // 수정사항 저장
          this.savedModifications.push({
            start: range.start,
            end: range.end,
            replacement: conversionPreview,
          });

          decorations.push({
            range: new vscode.Range(startPos, endPos),
            hoverMessage: `변환 예정: "${text}" → ${conversionPreview}`,
            renderOptions: {
              before: {
                contentText: `[변환예정] `,
                color: '#ff6b6b',
                fontWeight: 'bold',
              },
              after: {
                contentText: ` → ${conversionPreview}`,
                color: '#4ecdc4',
                fontWeight: 'bold',
              },
            },
          });

          // 처리된 범위에 추가
          processedRanges.push({ start: range.start, end: range.end });
        }
      });
    });

    // 기존 미리보기 제거
    if (this.currentPreviewDecoration) {
      this.currentPreviewDecoration.dispose();
    }

    // 변환 예정 하이라이트 적용
    this.currentPreviewDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 107, 107, 0.1)',
      border: '1px solid #ff6b6b',
      borderRadius: '3px',
    });

    editor.setDecorations(this.currentPreviewDecoration, decorations);
  }

  // 미리보기 하이라이트 제거 함수
  clearConversionPreview(): void {
    if (this.currentPreviewDecoration) {
      this.currentPreviewDecoration.dispose();
      this.currentPreviewDecoration = null;
    }
  }

  // 미리보기에서 표시한 그대로 변환 적용
  async applyConversionFromPreview(
    texts: string[],
    ranges: { start: number; end: number; text: string }[],
  ): Promise<void> {
    if (texts.length === 0) {
      vscode.window.showInformationMessage('적용할 한글 텍스트가 없습니다.');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('활성 편집기가 없습니다.');
      return;
    }

    // 미리보기 로직을 내부적으로 실행하여 수정사항 계산 (화면에 표시하지 않음)
    this.calculateModifications(texts, ranges);

    if (this.savedModifications.length === 0) {
      vscode.window.showInformationMessage('적용할 변환사항이 없습니다.');
      return;
    }

    const document = editor.document;
    const edit = new vscode.WorkspaceEdit();

    // 저장된 수정사항을 역순으로 적용 (뒤에서부터 앞으로)
    const sortedModifications = this.savedModifications.sort((a, b) => b.start - a.start);

    sortedModifications.forEach((mod) => {
      const startPos = document.positionAt(mod.start);
      const endPos = document.positionAt(mod.end);
      const range = new vscode.Range(startPos, endPos);
      edit.replace(document.uri, range, mod.replacement);
    });

    // 모든 수정사항을 한 번에 적용
    await vscode.workspace.applyEdit(edit);

    this.clearConversionPreview();
  }
}

const service = new TextConversionService();

export const extractVariables = (text: string) => service.extractVariables(text);
export const convertToI18nKey = (text: string) => service.convertToI18nKey(text);
export const highlightConversionTargets = (texts: string[], ranges: { start: number; end: number; text: string }[]) =>
  service.highlightConversionTargets(texts, ranges);
export const clearConversionPreview = () => service.clearConversionPreview();
export const applyConversionFromPreview = (texts: string[], ranges: { start: number; end: number; text: string }[]) =>
  service.applyConversionFromPreview(texts, ranges);
