import type { FileType } from '../types';
import * as vscode from 'vscode';

export function getFileType(fileNm?: string): FileType | false {
    let fileName = fileNm;
    if (!fileName) {
        fileName = vscode.window.activeTextEditor?.document.fileName ?? '';
    }

    if (fileName.toLowerCase().endsWith('.vue')) {
        return 'vue';
    } else if (fileName.toLowerCase().endsWith('.ts') || fileName.toLowerCase().endsWith('.js')) {
        return 'ts';
    } else if (fileName.toLowerCase().endsWith('.tsx') || fileName.toLowerCase().endsWith('.jsx')) {
        return 'tsx';
    }
    return false;
}

// 따옴표/백틱으로 감싸진 텍스트인지 확인하는 함수
export function isQuotedText(text: string): boolean {
    const trimmed = text.trim();
    const quotes = ["'", '"', '`'];

    return quotes.some(quote =>
        trimmed.startsWith(quote) && trimmed.endsWith(quote)
    );
}