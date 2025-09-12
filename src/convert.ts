import * as vscode from 'vscode';

// 변수 정보를 담는 인터페이스
interface VariableInfo {
	originalText: string;
	variables: string[];
	template: string;
}

// 텍스트에서 변수 추출 및 템플릿 생성
function extractVariables(text: string): VariableInfo {
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

	// {{}} 형태 변수 찾기
	const braceMatches = text.matchAll(/\{\{\s*([^}]+)\s*\}\}/g);
	for (const match of braceMatches) {
		const variableName = match[1].trim();
		variables.push(variableName);
		template = template.replace(match[0], `{${index}}`);
		index++;
	}

	return {
		originalText: text,
		variables,
		template
	};
}

// 텍스트를 i18n 키로 변환하는 함수
export function convertToI18nKey(text: string): string {
	return text
		.replace(/\s+/g, '_')           // 띄어쓰기를 _로 변환
		.replace(/\./g, '#dot#');        // 온점을 #dot#으로 변환
}

// 변수 포함 텍스트를 i18n 형태로 변환
export function convertTextWithVariables(text: string): string {
	const variableInfo = extractVariables(text);
	
	if (variableInfo.variables.length === 0) {
		// 변수가 없는 경우 기존 로직 사용
		const i18nKey = convertToI18nKey(text);
		return `t('${i18nKey}')`;
	} else {
		// 변수가 있는 경우 템플릿 기반으로 변환
		const templateKey = convertToI18nKey(variableInfo.template);
		const variablesArray = variableInfo.variables.join(', ');
		return `t('${templateKey}', [${variablesArray}])`;
	}
}

// 전역 변수로 현재 미리보기 데코레이션과 수정사항 저장
let currentPreviewDecoration: vscode.TextEditorDecorationType | null = null;
let savedModifications: { start: number, end: number, replacement: string }[] = [];

// 변환될 부분을 미리 하이라이트하는 테스트 함수
export function highlightConversionTargets(texts: string[], ranges: { start: number, end: number, text: string }[]): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('활성 편집기가 없습니다.');
		return;
	}
	
	const document = editor.document;
	const decorations: vscode.DecorationOptions[] = [];
	
	// 수정사항 초기화
	savedModifications = [];
	
	// 중복 제거를 위해 처리된 범위 추적
	const processedRanges: { start: number, end: number }[] = [];
	
	// 각 텍스트에 대해 변환될 부분 하이라이트
	texts.forEach(text => {
		// 같은 텍스트에 해당하는 모든 범위 찾기
		const matchingRanges = ranges.filter(r => r.text === text);
		
		matchingRanges.forEach(range => {
			// 이미 처리된 범위와 겹치는지 확인
			const isOverlapping = processedRanges.some(processed => 
				(range.start < processed.end && range.end > processed.start)
			);
			
			if (!isOverlapping) {
				const startPos = document.positionAt(range.start);
				const endPos = document.positionAt(range.end);
				
				// 변수 포함 텍스트 변환
				const conversionPreview = convertTextWithVariables(text);
				
				// 수정사항 저장
				savedModifications.push({
					start: range.start,
					end: range.end,
					replacement: conversionPreview
				});
				
				decorations.push({
					range: new vscode.Range(startPos, endPos),
					hoverMessage: `변환 예정: "${text}" → ${conversionPreview}`,
					renderOptions: {
						before: {
							contentText: `[변환예정] `,
							color: '#ff6b6b',
							fontWeight: 'bold'
						},
						after: {
							contentText: ` → ${conversionPreview}`,
							color: '#4ecdc4',
							fontWeight: 'bold'
						}
					}
				});
				
				// 처리된 범위에 추가
				processedRanges.push({ start: range.start, end: range.end });
			}
		});
	});
	
	// 기존 미리보기 제거
	if (currentPreviewDecoration) {
		currentPreviewDecoration.dispose();
	}
	
	// 변환 예정 하이라이트 적용
	currentPreviewDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255, 107, 107, 0.1)',
		border: '1px solid #ff6b6b',
		borderRadius: '3px'
	});
	
	editor.setDecorations(currentPreviewDecoration, decorations);
}

export function replaceTextWithI18n(i18nKey: string, start: number, end: number): Promise<boolean> {
	return new Promise((resolve) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('활성 편집기가 없습니다.');
			resolve(false);
			return;
		}
		
		const document = editor.document;
		
		const startPos = document.positionAt(start);
		const endPos = document.positionAt(end);
		const range = new vscode.Range(startPos, endPos);
		
		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, range, i18nKey);
		
		vscode.workspace.applyEdit(edit).then(() => {
			resolve(true);
		});
	});
}

// 미리보기 하이라이트 제거 함수
export function clearConversionPreview(): void {
	if (currentPreviewDecoration) {
		currentPreviewDecoration.dispose();
		currentPreviewDecoration = null;
	}
}

// 미리보기 로직을 내부적으로 실행하는 헬퍼 함수 (화면에 표시하지 않음) - 변수 포함 지원
function calculateModifications(texts: string[], ranges: { start: number, end: number, text: string }[]): void {
	// 수정사항 초기화
	savedModifications = [];
	
	// 중복 제거를 위해 처리된 범위 추적
	const processedRanges: { start: number, end: number }[] = [];
	
	// 각 텍스트에 대해 변환될 부분 계산
	texts.forEach(text => {
		// 같은 텍스트에 해당하는 모든 범위 찾기
		const matchingRanges = ranges.filter(r => r.text === text);
		
		matchingRanges.forEach(range => {
			// 이미 처리된 범위와 겹치는지 확인
			const isOverlapping = processedRanges.some(processed => 
				(range.start < processed.end && range.end > processed.start)
			);
			
			if (!isOverlapping) {
				// 변수 포함 텍스트 변환
				const conversionPreview = convertTextWithVariables(text);
				
				// 수정사항 저장
				savedModifications.push({
					start: range.start,
					end: range.end,
					replacement: conversionPreview
				});
				
				// 처리된 범위에 추가
				processedRanges.push({ start: range.start, end: range.end });
			}
		});
	});
}

// 전체 텍스트 목록에 i18n 일괄 적용 (변수 포함 지원)
export async function applyI18nToAllTexts(texts: string[], ranges: { start: number, end: number, text: string }[]): Promise<void> {
	if (texts.length === 0) {
		vscode.window.showInformationMessage('적용할 한글 텍스트가 없습니다.');
		return;
	}
	
	// 파일 타입 확인
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('활성 편집기가 없습니다.');
		return;
	}
	
	// 자동 적용 - 변환 규칙에 따라 자동으로 키 생성
	let successCount = 0;
	
	// 역순으로 변환 (뒤에서부터 앞으로)
	for (let i = texts.length - 1; i >= 0; i--) {
		const text = texts[i];
		const i18nConversion = convertTextWithVariables(text);
		
		// 해당 텍스트에 해당하는 범위 찾기
		const range = ranges.find(r => r.text === text);
		if (range) {
			let success: boolean;
			
			success = await replaceTextWithI18n(i18nConversion, range.start, range.end);
			
			if (success) {
				successCount++;
			}
		}
	}
	
	vscode.window.showInformationMessage(`${successCount}개 텍스트를 자동으로 i18n 키로 변환했습니다.`);
}

// 미리보기에서 표시한 그대로 변환 적용
export async function applyConversionFromPreview(texts: string[], ranges: { start: number, end: number, text: string }[]): Promise<void> {
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
	calculateModifications(texts, ranges);
	
	if (savedModifications.length === 0) {
		vscode.window.showInformationMessage('적용할 변환사항이 없습니다.');
		return;
	}
	
	const document = editor.document;
	const edit = new vscode.WorkspaceEdit();
	
	// 저장된 수정사항을 역순으로 적용 (뒤에서부터 앞으로)
	const sortedModifications = savedModifications.sort((a, b) => b.start - a.start);
	
	sortedModifications.forEach(mod => {
		const startPos = document.positionAt(mod.start);
		const endPos = document.positionAt(mod.end);
		const range = new vscode.Range(startPos, endPos);
		edit.replace(document.uri, range, mod.replacement);
	});
	
	// 모든 수정사항을 한 번에 적용
	await vscode.workspace.applyEdit(edit);
	
	clearConversionPreview();
}
