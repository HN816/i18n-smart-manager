import * as vscode from 'vscode';
import { convertToI18nKey, extractVariables } from './convert';

// JSON 파일 생성을 위한 인터페이스
export interface LocaleEntry {
	key: string;
	value: string;
	variables?: string[];
}

// 프로젝트 루트 경로를 가져오는 헬퍼 함수
function getProjectRoot(): string {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders && workspaceFolders.length > 0) {
		return workspaceFolders[0].uri.fsPath;
	}
	
	// 워크스페이스가 없으면 현재 활성 편집기의 디렉토리 사용
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const filePath = editor.document.uri.fsPath;
		return filePath.substring(0, filePath.lastIndexOf('\\') || filePath.lastIndexOf('/'));
	}
	
	// 그 외의 경우 현재 디렉토리 사용
	return process.cwd();
}

// 기존 JSON 파일을 읽어오는 함수
async function readExistingLocales(filePath: string): Promise<{ [key: string]: string }> {
	try {
		const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
		const jsonString = new TextDecoder().decode(fileContent);
		return JSON.parse(jsonString);
	} catch (error) {
		// 파일이 없거나 파싱 오류인 경우 빈 객체 반환
		return {};
	}
}

// locales.ko.json 파일 생성 함수
export async function generateLocalesJson(texts: string[], language: string = 'ko', outputPath?: string): Promise<void> {
	if (texts.length === 0) {
		vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
		return;
	}

	// 출력 경로가 지정되지 않은 경우 프로젝트 루트에 자동 저장
	let targetPath = outputPath;
	if (!targetPath) {
		const projectRoot = getProjectRoot();
		const fileName = `locales.${language}.json`;
		targetPath = `${projectRoot}/${fileName}`;
	}

	// 기존 파일 읽기
	const existingLocales = await readExistingLocales(targetPath);
	const existingKeys = new Set(Object.keys(existingLocales));

	// 텍스트를 i18n 키와 값으로 변환
	const localeEntries: LocaleEntry[] = [];
	const usedKeys = new Set<string>(); // 중복 키 방지
	const skippedKeys: string[] = []; // 건너뛴 키들
	const newKeys: string[] = []; // 새로 추가된 키들

	for (const text of texts) {
		const variableInfo = extractVariables(text);
		let key: string;
		let value: string;

		if (variableInfo.variables.length === 0) {
			// 변수가 없는 경우
			key = convertToI18nKey(text);
			value = text;
		} else {
			// 변수가 있는 경우 - 키는 템플릿 기반, 값은 i18n 키 형식으로 변환
			key = convertToI18nKey(variableInfo.template);
			// 변수를 i18n 키 형식으로 변환 ({{ }} 형태를 {숫자} 형태로)
			let i18nValue = text;
			let index = 0;
			
			// ${} 형태 변수를 {숫자} 형태로 변환
			i18nValue = i18nValue.replace(/\$\{\s*([^}]+)\s*\}/g, () => `{${index++}}`);
			
			// {{}} 형태 변수를 {숫자} 형태로 변환
			i18nValue = i18nValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, () => `{${index++}}`);
			
			value = i18nValue;
		}

		// 기존 키가 있는지 확인
		if (existingKeys.has(key)) {
			skippedKeys.push(key);
			continue; // 기존 키는 건너뛰기
		}

		// 중복 키 처리 (새로 생성되는 키들 간의 중복)
		let finalKey = key;
		let counter = 1;
		while (usedKeys.has(finalKey) || existingKeys.has(finalKey)) {
			finalKey = `${key}_${counter}`;
			counter++;
		}
		usedKeys.add(finalKey);
		newKeys.push(finalKey);

		localeEntries.push({
			key: finalKey,
			value: value,
			variables: variableInfo.variables.length > 0 ? variableInfo.variables : undefined
		});
	}

	// 기존 locales와 새로운 locales 병합
	const mergedLocales = { ...existingLocales };
	localeEntries.forEach(entry => {
		mergedLocales[entry.key] = entry.value;
	});

	// JSON 파일로 저장
	try {
		const jsonContent = JSON.stringify(mergedLocales, null, 2);
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(targetPath),
			new TextEncoder().encode(jsonContent)
		);

		const languageName = getLanguageName(language);
		const fileName = targetPath.split(/[\\/]/).pop(); // 파일명만 추출
		
		// 결과 메시지 구성
		let message = `${languageName} locales 파일이 업데이트되었습니다: ${fileName}\n`;
		message += `새로 추가된 항목: ${newKeys.length}개\n`;
		if (skippedKeys.length > 0) {
			message += `기존 키로 인해 건너뛴 항목: ${skippedKeys.length}개`;
		}
		
		vscode.window.showInformationMessage(message);

		// 건너뛴 키가 있으면 상세 정보 표시
		if (skippedKeys.length > 0) {
			const showDetails = await vscode.window.showInformationMessage(
				`${skippedKeys.length}개의 기존 키가 건너뛰어졌습니다. 상세 정보를 보시겠습니까?`,
				'상세 보기',
				'닫기'
			);
			
			if (showDetails === '상세 보기') {
				const skippedKeysText = skippedKeys.join('\n');
				const doc = await vscode.workspace.openTextDocument({
					content: `건너뛴 키 목록:\n\n${skippedKeysText}`,
					language: 'plaintext'
				});
				await vscode.window.showTextDocument(doc);
			}
		}

		// 생성된 파일을 에디터에서 열기
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
		await vscode.window.showTextDocument(document);

	} catch (error: any) {
		vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
	}
}

// 언어 코드를 언어명으로 변환하는 헬퍼 함수
function getLanguageName(languageCode: string): string {
	const languageMap: { [key: string]: string } = {
		'ko': '한국어',
		'en': '영어',
		'ja': '일본어',
		'zh': '중국어',
		'es': '스페인어',
		'fr': '프랑스어',
		'de': '독일어',
		'ru': '러시아어'
	};
	
	return languageMap[languageCode] || languageCode.toUpperCase();
}

// locales.json 생성 명령어를 위한 헬퍼 함수
export async function showLocalesGenerationDialog(texts: string[], language: string = 'ko'): Promise<void> {
	if (texts.length === 0) {
		vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
		return;
	}

	// 바로 기본 JSON 생성
	await generateLocalesJson(texts, language);
}
