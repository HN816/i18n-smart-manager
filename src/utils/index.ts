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

export function hasVariables(text: string, fileType: FileType): boolean {
    // ${} 패턴
    if (/\$\{[^}]*\}/.test(text)) {
        return true;
    }

    // 파일 타입별 변수 패턴
    if (fileType === 'vue') {
        // {{ }} 패턴
        return /\{\{[^}]*\}\}/.test(text);
    } else if (fileType === 'tsx') {
        // {} 패턴
        return /\{[^{}]*\}/.test(text);
    }

    return false;
}
