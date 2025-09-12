import * as vscode from 'vscode';

export interface KoreanRange {
	start: number;
	end: number;
	text: string;
}

export interface ExtractedTexts {
	koreanRanges: KoreanRange[];
	i18nRanges: KoreanRange[];
}

// Vue 파일 처리 함수
export function processVueFile(text: string): string {
	let result = text;
	
	// <style> 태그 전체 제거 (scoped, lang 등 모든 속성 포함)
	result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
	
	return result;
}

// 주석 제거 함수 (위치 매핑 정보도 반환)
export function removeCommentsWithMapping(text: string): { processedText: string, positionMap: number[] } {
	let result = '';
	const positionMap: number[] = [];
	
	// HTML 주석 제거 (<!-- -->)
	const htmlCommentRegex = /<!--[\s\S]*?-->/g;
	let match;
	let lastIndex = 0;
	
	while ((match = htmlCommentRegex.exec(text)) !== null) {
		// 주석 이전 부분 추가
		result += text.substring(lastIndex, match.index);
		// 위치 매핑 추가
		for (let i = lastIndex; i < match.index; i++) {
			positionMap.push(i);
		}
		lastIndex = match.index + match[0].length;
	}
	
	// 마지막 주석 이후 부분 추가
	result += text.substring(lastIndex);
	for (let i = lastIndex; i < text.length; i++) {
		positionMap.push(i);
	}
	
	// 한 줄 주석 제거 (//)
	const singleLineCommentRegex = /\/\/.*$/gm;
	lastIndex = 0;
	let newResult = '';
	const newPositionMap: number[] = [];
	
	while ((match = singleLineCommentRegex.exec(result)) !== null) {
		// 주석 이전 부분 추가
		newResult += result.substring(lastIndex, match.index);
		// 위치 매핑 추가
		for (let i = lastIndex; i < match.index; i++) {
			newPositionMap.push(positionMap[i]);
		}
		lastIndex = match.index + match[0].length;
	}
	
	// 마지막 주석 이후 부분 추가
	newResult += result.substring(lastIndex);
	for (let i = lastIndex; i < result.length; i++) {
		newPositionMap.push(positionMap[i]);
	}
	
	result = newResult;
	
	// 블록 주석 제거 (/* */)
	const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
	lastIndex = 0;
	newResult = '';
	const finalPositionMap: number[] = [];
	
	while ((match = blockCommentRegex.exec(result)) !== null) {
		// 주석 이전 부분 추가
		newResult += result.substring(lastIndex, match.index);
		// 위치 매핑 추가
		for (let i = lastIndex; i < match.index; i++) {
			finalPositionMap.push(newPositionMap[i]);
		}
		lastIndex = match.index + match[0].length;
	}
	
	// 마지막 주석 이후 부분 추가
	newResult += result.substring(lastIndex);
	for (let i = lastIndex; i < result.length; i++) {
		finalPositionMap.push(newPositionMap[i]);
	}
	
	return { processedText: newResult, positionMap: finalPositionMap };
}

// i18n 적용된 부분 찾기
export function findI18nRanges(text: string): KoreanRange[] {
	const i18nRanges: KoreanRange[] = [];
	
	// t('모든문자') 패턴 찾기 - t 다음에 바로 (가 와야 함
	const tMatches = text.matchAll(/\bt\(['"`]([^'"`]*?)['"`]\)/g);
	for (const match of tMatches) {
		const i18nText = match[1];
		// 한글이 포함된 경우만 처리
		if (/[가-힣]/.test(i18nText)) {
			const start = match.index!;
			const end = start + match[0].length;
			
			i18nRanges.push({
				start: start,
				end: end,
				text: i18nText
			});
		}
	}
	
	// {{ t('모든문자') }} 패턴 찾기
	const templateMatches = text.matchAll(/\{\{\s*t\(['"`]([^'"`]*?)['"`]\)\s*\}\}/g);
	for (const match of templateMatches) {
		const i18nText = match[1];
		// 한글이 포함된 경우만 처리
		if (/[가-힣]/.test(i18nText)) {
			const start = match.index!;
			const end = start + match[0].length;
			
			// 중복 체크 - 같은 위치에 이미 있는지 확인
			const isDuplicate = i18nRanges.some(range => 
				range.start === start && range.end === end
			);
			
			if (!isDuplicate) {
				i18nRanges.push({
					start: start,
					end: end,
					text: i18nText
				});
			}
		}
	}
	
	// "t('모든문자')" 패턴 찾기 (따옴표로 감싸진 경우)
	const quotedMatches = text.matchAll(/["'`]t\(['"`]([^'"`]*?)['"`]\)["'`]/g);
	for (const match of quotedMatches) {
		const i18nText = match[1];
		// 한글이 포함된 경우만 처리
		if (/[가-힣]/.test(i18nText)) {
			const start = match.index!;
			const end = start + match[0].length;
			
			// 중복 체크 - 같은 위치에 이미 있는지 확인
			const isDuplicate = i18nRanges.some(range => 
				range.start === start && range.end === end
			);
			
			if (!isDuplicate) {
				i18nRanges.push({
					start: start,
					end: end,
					text: i18nText
				});
			}
		}
	}
	
	return i18nRanges;
}

// TypeScript 파일에서 한글 찾기 (위치 매핑 포함)
export function findKoreanInTsFileWithMapping(
	processedText: string, 
	positionMap: number[], 
	i18nRanges: KoreanRange[]
): KoreanRange[] {
	const koreanRanges: KoreanRange[] = [];
	
	// 1. 따옴표 안의 한글 처리 - 수동으로 따옴표 쌍 찾기
	let i = 0;
	while (i < processedText.length) {
		const char = processedText[i];
		
		// 따옴표 시작 찾기
		if (char === '"' || char === "'" || char === '`') {
			const quoteType = char;
			const start = i;
			i++; // 따옴표 다음부터 시작
			
			// 닫는 따옴표 찾기
			let content = '';
			while (i < processedText.length && processedText[i] !== quoteType) {
				content += processedText[i];
				i++;
			}
			
			// 닫는 따옴표를 찾았고, 내용에 한글이 있으면
			if (i < processedText.length && /[가-힣]/.test(content)) {
				const end = i;
				const koreanText = content.trim();
				
				// 원본 텍스트에서 해당 위치 찾기
				const originalStart = positionMap[start];
				const originalEnd = positionMap[end] + 1;
				
				// i18n 범위에 포함되지 않는 경우만 처리
				const isInI18nRange = i18nRanges.some(range => {
					// 디버깅을 위한 로그 (나중에 제거)
					console.log(`Checking range: ${originalStart}-${originalEnd} against i18n range: ${range.start}-${range.end}`);
					console.log(`Text: "${koreanText}", i18n text: "${range.text}"`);
					
					// 한글 텍스트가 i18n 범위 안에 완전히 포함되는지 확인
					const isContained = originalStart >= range.start && originalEnd <= range.end;
					console.log(`Is contained: ${isContained}`);
					
					return isContained;
				});
				if (!isInI18nRange && koreanText) {
					koreanRanges.push({
						start: originalStart,
						end: originalEnd,
						text: koreanText
					});
				}
			}
		}
		i++;
	}
	
	// 2. 공백 없는 순수 한글 변수 처리
	// 이미 처리된 범위들을 추적
	const processedRanges: { start: number, end: number }[] = [];
	koreanRanges.forEach(range => {
		processedRanges.push({ start: range.start, end: range.end });
	});
	
	// 한글 변수 패턴 찾기 (공백 없는 순수 한글)
	for (let i = 0; i < processedText.length; i++) {
		const char = processedText[i];
		
		// 이미 처리된 범위에 포함되는지 확인
		const originalPos = positionMap[i];
		const isAlreadyProcessed = processedRanges.some(range => 
			originalPos >= range.start && originalPos < range.end
		);
		
		if (isAlreadyProcessed) {
			continue;
		}
		
		// 한글이면 연속된 한글 찾기
		if (/[가-힣]/.test(char)) {
			let koreanStart = i;
			let koreanEnd = i;
			
			// 연속된 한글 찾기
			while (koreanEnd < processedText.length && /[가-힣]/.test(processedText[koreanEnd])) {
				koreanEnd++;
			}
			
			// 한글 변수인지 확인 (앞뒤로 공백이나 특수문자가 있어야 함)
			const beforeChar = koreanStart > 0 ? processedText[koreanStart - 1] : ' ';
			const afterChar = koreanEnd < processedText.length ? processedText[koreanEnd] : ' ';
			
			// 한글 변수 조건: 앞뒤로 공백, 괄호, 콜론, 콤마 등이 있어야 함
			if (/[\s\[\]{}():,;=]/.test(beforeChar) && /[\s\[\]{}():,;=]/.test(afterChar)) {
				const koreanText = processedText.substring(koreanStart, koreanEnd);
				
				// 원본 텍스트에서 해당 위치 찾기
				const originalStart = positionMap[koreanStart];
				const originalEnd = positionMap[koreanEnd - 1] + 1;
				
				// i18n 범위에 포함되지 않는 경우만 처리
				const isInI18nRange = i18nRanges.some(range => originalStart >= range.start && originalEnd <= range.end);
				if (!isInI18nRange) {
					koreanRanges.push({
						start: originalStart,
						end: originalEnd,
						text: koreanText
					});
					
					// 처리된 범위에 추가
					processedRanges.push({ start: originalStart, end: originalEnd });
				}
			}
			
			// 다음 문자로 이동
			i = koreanEnd - 1;
		}
	}
	
	return koreanRanges;
}

// 한글 텍스트 위치 찾기 (위치 매핑 포함) - Vue 파일용
export function findKoreanRangesWithMapping(
	processedText: string, 
	positionMap: number[], 
	i18nRanges: KoreanRange[]
): KoreanRange[] {
	const koreanRanges: KoreanRange[] = [];
	
	// 글자를 하나씩 따라가면서 한글 위치 찾기
	let currentWord = '';
	let currentStart = -1;
	let hasKorean = false;
	let inString = false; // 문자열 안에 있는지 여부
	let stringType: '"' | "'" | '`' | '>' | null = null; // 문자열 타입
	
	for (let i = 0; i < processedText.length; i++) {
		const char = processedText[i];
		
		// 문자열 시작 트리거 확인
		if (!inString && (char === '"' || char === "'" || char === '`' || char === '>')) {
			// 이전에 한글이 있었다면 저장
			if (currentWord.trim().length > 0 && hasKorean) {
				const trimmedWord = currentWord.replace(/^\s+|\s+$/g, '');
				const actualStart = currentStart + (currentWord.length - currentWord.trimStart().length);
				const actualEnd = i - (currentWord.length - currentWord.trimEnd().length);
				
				const originalStart = positionMap[actualStart];
				const originalEnd = positionMap[actualEnd - 1] + 1;
				
				const isInI18nRange = i18nRanges.some(range => originalStart >= range.start && originalEnd <= range.end);
				if (!isInI18nRange) {
					koreanRanges.push({
						start: originalStart,
						end: originalEnd,
						text: trimmedWord
					});
				}
				
				currentWord = '';
				currentStart = -1;
				hasKorean = false;
			}
			
			// 문자열 시작
			inString = true;
			stringType = char as '"' | "'" | '`' | '>';
			currentStart = i;
			currentWord = char;
			continue;
		}
		
		// 문자열 닫힘 트리거 확인
		if (inString) {
			if ((stringType === '"' && char === '"') ||
				(stringType === "'" && char === "'") ||
				(stringType === '`' && char === '`') ||
				(stringType === '>' && char === '<')) {
				
				currentWord += char;
				
				// 문자열 안에 한글이 있었는지 확인
				if (hasKorean) {
					const originalStart = positionMap[currentStart];
					const originalEnd = positionMap[i] + 1;
					
					const isInI18nRange = i18nRanges.some(range => originalStart >= range.start && originalEnd <= range.end);
					if (!isInI18nRange) {
						// 따옴표는 제외하고 내용만 추출
						let content = currentWord.slice(1, -1).trim();
						
						// >< 태그의 경우 추가 공백/줄바꿈 제거
						if (stringType === '>') {
							// 열림 트리거 다음 공백/줄바꿈 제거
							content = content.replace(/^[\s\n\r]+/, '');
							// 닫힘 트리거 전 공백/줄바꿈 제거
							content = content.replace(/[\s\n\r]+$/, '');
						}
						
						if (content) {
							if (stringType === '>') {
								// >< 태그의 경우 양 끝 공백/줄바꿈 제거
								const fullContent = currentWord.slice(1, -1);
								const trimmedStart = fullContent.length - fullContent.trimStart().length;
								const trimmedEnd = fullContent.trimEnd().length;
								
								const textStart = currentStart + 1 + trimmedStart; // > 다음 + 앞쪽 공백
								const textEnd = currentStart + 1 + trimmedEnd; // > 다음 + 실제 텍스트 끝
								const textOriginalStart = positionMap[textStart];
								const textOriginalEnd = positionMap[textEnd - 1] + 1;
								
								koreanRanges.push({
									start: textOriginalStart,
									end: textOriginalEnd,
									text: content
								});
							} else {
								const textStart = currentStart + 1; // 따옴표 다음부터
								const textEnd = currentStart + 1 + content.length; // 내용만의 끝
								const textOriginalStart = positionMap[textStart];
								const textOriginalEnd = positionMap[textEnd - 1] + 1;
								
								koreanRanges.push({
									start: textOriginalStart,
									end: textOriginalEnd,
									text: content
								});
							}
						}
					}
				}
				
				// 문자열 종료
				inString = false;
				stringType = null;
				currentWord = '';
				currentStart = -1;
				hasKorean = false;
				continue;
			}
		}
		
		// 문자열 안에 있으면 모든 문자 추가
		if (inString) {
			currentWord += char;
			if (/[가-힣]/.test(char)) {
				hasKorean = true;
			}
			continue;
		}
		
		// 문자열 밖에서의 일반 처리
		// 한글이면 현재 단어에 추가
		if (/[가-힣]/.test(char)) {
			if (currentStart === -1) {
				currentStart = i;
			}
			currentWord += char;
			hasKorean = true;
		}
		// 공백이면 현재 단어에 추가 (단어 내부 공백)
		else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
			if (currentWord.length > 0) {
				currentWord += char;
			}
		}
		// 괄호나 특수문자 중에서 한글과 함께 사용되는 것들
		else if (char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}' || char === '-' || char === '_') {
			if (currentWord.length > 0 && hasKorean) {
				currentWord += char;
			}
		}
		// 한글이 아닌 다른 문자를 만나면
		else {
			// 현재 단어가 있고 한글이 포함되어 있으면 저장
			if (currentWord.trim().length > 0 && hasKorean) {
				// 양옆 공백 제거하되 내부 공백은 유지
				const trimmedWord = currentWord.replace(/^\s+|\s+$/g, '');
				// 실제 한글 텍스트의 시작과 끝 위치 계산
				const actualStart = currentStart + (currentWord.length - currentWord.trimStart().length);
				const actualEnd = i - (currentWord.length - currentWord.trimEnd().length);
				
				// 원본 텍스트에서 해당 위치 찾기
				const originalStart = positionMap[actualStart];
				const originalEnd = positionMap[actualEnd - 1] + 1;
				
				// i18n 범위에 포함되지 않는 경우만 처리
				const isInI18nRange = i18nRanges.some(range => originalStart >= range.start && originalEnd <= range.end);
				if (!isInI18nRange) {
					koreanRanges.push({
						start: originalStart,
						end: originalEnd,
						text: trimmedWord
					});
				}
				
				currentWord = '';
				currentStart = -1;
				hasKorean = false;
			}
		}
	}
	
	// 마지막 단어 처리
	if (currentWord.trim().length > 0 && hasKorean) {
		const trimmedWord = currentWord.replace(/^\s+|\s+$/g, '');
		const actualStart = currentStart + (currentWord.length - currentWord.trimStart().length);
		const actualEnd = processedText.length - (currentWord.length - currentWord.trimEnd().length);
		
		// 원본 텍스트에서 해당 위치 찾기
		const originalStart = positionMap[actualStart];
		const originalEnd = positionMap[actualEnd - 1] + 1;
		
		// i18n 범위에 포함되지 않는 경우만 처리
		const isInI18nRange = i18nRanges.some(range => originalStart >= range.start && originalEnd <= range.end);
		if (!isInI18nRange) {
			koreanRanges.push({
				start: originalStart,
				end: originalEnd,
				text: trimmedWord
			});
		}
	}
	
	return koreanRanges;
}

// 메인 추출 함수
export function extractKoreanTexts(text: string, fileName: string): ExtractedTexts {
	// 파일 타입 확인
	const isVueFile = fileName.toLowerCase().endsWith('.vue');
	const isTsFile = fileName.toLowerCase().endsWith('.ts') || fileName.toLowerCase().endsWith('.tsx');
	
	if (!isVueFile && !isTsFile) {
		return { koreanRanges: [], i18nRanges: [] };
	}
	
	// 주석 제거하면서 위치 매핑 정보 생성
	const { processedText, positionMap } = removeCommentsWithMapping(text);
	
	// Vue 파일인 경우 style 태그도 제거
	let finalProcessedText = processedText;
	if (isVueFile) {
		finalProcessedText = processVueFile(processedText);
	}
	
	// 1. 모든 한글 텍스트 찾기 (i18n 체크 없이)
	let allKoreanRanges: KoreanRange[];
	if (isTsFile) {
		allKoreanRanges = findKoreanInTsFileWithMapping(finalProcessedText, positionMap, []);
	} else {
		allKoreanRanges = findKoreanRangesWithMapping(finalProcessedText, positionMap, []);
	}
	
	// 2. i18n 적용된 부분 찾기 (원본 텍스트 기준)
	const i18nRanges = findI18nRanges(text);
	
	// 3. 한글 텍스트에서 i18n 범위와 겹치는 부분 제거
	const koreanRanges = allKoreanRanges.filter(koreanRange => {
		// i18n 범위와 겹치는지 확인
		const overlapsWithI18n = i18nRanges.some(i18nRange => {
			// 겹치는 조건: 한글 범위가 i18n 범위와 교차하거나 포함되는 경우
			return (koreanRange.start < i18nRange.end && koreanRange.end > i18nRange.start);
		});
		
		// 겹치지 않는 경우만 유지
		return !overlapsWithI18n;
	});
	
	return { koreanRanges, i18nRanges };
}