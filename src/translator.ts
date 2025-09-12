import * as vscode from 'vscode';

// 번역 서비스 인터페이스
interface TranslationService {
	translate(text: string, targetLang: string): Promise<string>;
}

// DeepL 번역 서비스
class DeepLTranslationService implements TranslationService {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async translate(text: string, targetLang: string): Promise<string> {
		const languageMap: { [key: string]: string } = {
			'en': 'EN',
			'ja': 'JA',
			'ko': 'KO'
		};

		const targetLanguage = languageMap[targetLang] || targetLang;

		try {
			const response = await fetch('https://api-free.deepl.com/v2/translate', {
				method: 'POST',
				headers: {
					'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					text: text,
					source_lang: 'KO',
					target_lang: targetLanguage
				})
			});

			if (!response.ok) {
				throw new Error(`DeepL API error: ${response.status}`);
			}

			const data = await response.json() as any;
			return data.translations[0].text;
		} catch (error) {
			console.error('DeepL translation error:', error);
			throw new Error(`번역 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}

// 번역 서비스 팩토리
export class TranslationServiceFactory {
	static createService(provider: string, apiKey: string): TranslationService {
		if (!apiKey) {
			throw new Error('DeepL API 키가 필요합니다.');
		}

		return new DeepLTranslationService(apiKey);
	}
}

// 번역 함수
export async function translateText(text: string, targetLang: string, provider: string, apiKey: string): Promise<string> {
	const service = TranslationServiceFactory.createService(provider, apiKey);
	return await service.translate(text, targetLang);
}

// 여러 텍스트를 일괄 번역하는 함수
export async function translateTexts(texts: string[], targetLang: string, provider: string, apiKey: string): Promise<string[]> {
	const service = TranslationServiceFactory.createService(provider, apiKey);
	const results: string[] = [];

	for (const text of texts) {
		try {
			const translated = await service.translate(text, targetLang);
			results.push(translated);
		} catch (error) {
			console.error(`번역 실패 (${text}):`, error);
			results.push(text); // 번역 실패 시 원본 반환
		}
	}

	return results;
}
