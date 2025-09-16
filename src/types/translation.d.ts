// 번역 관련 타입 정의

// 번역 서비스 인터페이스
export interface TranslationService {
  translate(text: string, targetLang: string): Promise<string>;
}

// 언어 코드 타입
export type LanguageCode = 'ko' | 'en' | 'ja' | 'zh';

// 언어 정보
export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  flag: string;
  description: string;
}
