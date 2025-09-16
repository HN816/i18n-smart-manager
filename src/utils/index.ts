import type { FileType } from '../types';

export function getFileType(fileName: string): FileType | false {
    if (fileName.toLowerCase().endsWith('.vue')) {
        return 'vue';
    } else if (fileName.toLowerCase().endsWith('.ts') || fileName.toLowerCase().endsWith('.js')) {
        return 'ts';
    } else if (fileName.toLowerCase().endsWith('.tsx') || fileName.toLowerCase().endsWith('.jsx')) {
        return 'tsx';
    }
    return false;
}

// 따옴표로 감싸진 텍스트인지 확인
export function isQuotedText(text: string): boolean {
    const trimmed = text.trim();
    const quotes = ["'", '"', '`'];

    return quotes.some(quote =>
        trimmed.startsWith(quote) && trimmed.endsWith(quote)
    );
}

// 감싸진 따옴표 제거
export function removeQuotes(text: string): string {
    if (isQuotedText(text)) { return text.slice(1, -1); }
    return text;
}