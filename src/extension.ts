// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractKoreanTexts } from './korean-extractor';
import { TextHighlighter } from './highlighter';
import { highlightConversionTargets, clearConversionPreview, applyConversionFromPreview } from './convert';
import { generateLocalesJson } from './locales-generator';

// TreeView 데이터 프로바이더
class I18nTreeDataProvider implements vscode.TreeDataProvider<I18nItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<I18nItem | undefined | null | void> = new vscode.EventEmitter<I18nItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<I18nItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private koreanTexts: I18nItem[] = [];
	private i18nTexts: I18nItem[] = [];
	private isActive: boolean = false;
	private excludedTexts: Set<string> = new Set(); // 제외된 텍스트들

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: I18nItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: I18nItem): Thenable<I18nItem[]> {
		if (!element) {
			// 루트 레벨: 섹션들만
			const items: I18nItem[] = [];

			// 국제화 대기 섹션
			const filteredCount = this.koreanTexts.filter(item => !this.excludedTexts.has(item.label)).length;
			const pendingSection = new I18nItem(
				`🌐 Pending (${filteredCount})`,
				'pending-section',
				vscode.TreeItemCollapsibleState.Expanded
			);
			pendingSection.children = this.koreanTexts.filter(item => !this.excludedTexts.has(item.label));
			items.push(pendingSection);

			// 국제화 완료 섹션
			const completedSection = new I18nItem(
				`✅ Applied (${this.i18nTexts.length})`,
				'completed-section',
				vscode.TreeItemCollapsibleState.Expanded
			);
			completedSection.children = this.i18nTexts;
			items.push(completedSection);

			return Promise.resolve(items);
		}

		// 섹션의 자식들 반환
		if (element.type === 'pending-section') {
			// 한글 텍스트들만
			const filteredKoreanTexts = this.koreanTexts.filter(item => !this.excludedTexts.has(item.label));
			return Promise.resolve(filteredKoreanTexts);
		} else if (element.type === 'completed-section') {
			return Promise.resolve(this.i18nTexts);
		}

		return Promise.resolve([]);
	}

	updateData(texts: { text: string, type: 'korean' | 'i18n' }[]): void {
		this.koreanTexts = texts
			.filter(item => item.type === 'korean')
			.map((item, index) => {
				const treeItem = new I18nItem(
					item.text,
					'korean',
					vscode.TreeItemCollapsibleState.None
				);
				treeItem.tooltip = `Korean text: ${item.text}`;
				treeItem.contextValue = 'korean-text';
				// 클릭 시 해당 위치로 이동
				treeItem.command = {
					command: 'i18n-manager.goToText',
					title: 'Go to Text',
					arguments: [treeItem]
				};
				return treeItem;
			});

		this.i18nTexts = texts
			.filter(item => item.type === 'i18n')
			.map((item, index) => {
				const treeItem = new I18nItem(
					item.text,
					'i18n',
					vscode.TreeItemCollapsibleState.None
				);
				treeItem.tooltip = `i18n applied: ${item.text}`;
				treeItem.contextValue = 'i18n-text';
				// 클릭 시 해당 위치로 이동
				treeItem.command = {
					command: 'i18n-manager.goToText',
					title: 'Go to Text',
					arguments: [treeItem]
				};
				return treeItem;
			});

		this.refresh();
	}

	setActive(active: boolean): void {
		this.isActive = active;
		this.refresh();
		
		// 컨텍스트 키 설정
		vscode.commands.executeCommand('setContext', 'i18nManager.isActive', active);
	}

	getActive(): boolean {
		return this.isActive;
	}

	excludeText(text: string): void {
		this.excludedTexts.add(text);
		this.refresh(); // TreeView 새로고침으로 카운트 업데이트
		
		// 하이라이트 업데이트
		updateHighlights();
	}

	includeText(text: string): void {
		this.excludedTexts.delete(text);
		this.refresh(); // TreeView 새로고침으로 카운트 업데이트
		
		// 하이라이트 업데이트
		updateHighlights();
	}

	getExcludedTexts(): Set<string> {
		return this.excludedTexts;
	}

	// 제외 목록 초기화 메서드 추가
	clearExcludedTexts(): void {
		this.excludedTexts.clear();
	}

	// 제외되지 않은 한글 텍스트 목록을 반환하는 메서드 추가
	getFilteredKoreanTexts(): string[] {
		return this.koreanTexts
			.filter(item => !this.excludedTexts.has(item.label))
			.map(item => item.label);
	}
}

// TreeView 아이템 클래스
class I18nItem extends vscode.TreeItem {
	public children?: I18nItem[];

	constructor(
		public readonly label: string,
		public readonly type: 'korean' | 'i18n' | 'start' | 'stop' | 'refresh' | 'pending-section' | 'completed-section' | 'button-container' | 'control-buttons' | 'convert-button',
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
		
		if (type === 'korean') {
			this.iconPath = new vscode.ThemeIcon('text');
			this.description = 'Korean text';
		} else if (type === 'i18n') {
			this.iconPath = new vscode.ThemeIcon('check');
			this.description = 'i18n applied';
		}
	}
}

// 전역 변수
let treeDataProvider: I18nTreeDataProvider;
let highlighter: TextHighlighter;
let isMonitoring: boolean = false;
let debounceTimer: NodeJS.Timeout | undefined;
let currentKoreanRanges: { start: number, end: number, text: string }[] = [];
let currentI18nRanges: { start: number, end: number, text: string }[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// TreeView 데이터 프로바이더 생성
	treeDataProvider = new I18nTreeDataProvider();
	vscode.window.createTreeView('i18nManager', { treeDataProvider });

	// 하이라이터 생성
	highlighter = new TextHighlighter();

	// Start 명령어 등록
	const startCommand = vscode.commands.registerCommand('i18n-manager.start', () => {
		startMonitoring();
	});

	// Stop 명령어 등록
	const stopCommand = vscode.commands.registerCommand('i18n-manager.stop', () => {
		stopMonitoring();
	});

	// 새로고침 명령어 등록
	const refreshCommand = vscode.commands.registerCommand('i18n-manager.refresh', () => {
		if (isMonitoring) {
			// 사용자 제외 목록 초기화
			treeDataProvider.clearExcludedTexts();
			
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				extractKoreanTextsFromEditor(editor);
			}
		}
	});

	// 텍스트 제외 명령어 등록
	const excludeCommand = vscode.commands.registerCommand('i18n-manager.exclude', (item: I18nItem) => {
		if (item.type === 'korean') {
			treeDataProvider.excludeText(item.label);
		}
	});

	// 텍스트 포함 명령어 등록
	const includeCommand = vscode.commands.registerCommand('i18n-manager.include', (item: I18nItem) => {
		if (item.type === 'korean') {
			treeDataProvider.includeText(item.label);
		}
	});

	// 텍스트 위치로 이동 명령어 등록
	const goToTextCommand = vscode.commands.registerCommand('i18n-manager.goToText', (item: I18nItem) => {
		if (item.type === 'korean' || item.type === 'i18n') {
			goToTextLocation(item.label);
		}
	});

	// 변환 미리보기 명령어 등록
	const previewCommand = vscode.commands.registerCommand('i18n-manager.previewConversion', () => {
		const filteredTexts = treeDataProvider.getFilteredKoreanTexts();
		
		if (filteredTexts.length === 0) {
			vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
			return;
		}
		
		// 범위 정보도 함께 전달
		const ranges = currentKoreanRanges.filter(range => 
			!treeDataProvider.getExcludedTexts().has(range.text)
		);
		
		// 변환 미리보기 표시
		highlightConversionTargets(filteredTexts, ranges);
	});

	// 미리보기 제거 명령어 등록
	const clearPreviewCommand = vscode.commands.registerCommand('i18n-manager.clearPreview', () => {
		clearConversionPreview();
	});

	// 전체 변환 명령어 등록
	const convertAllCommand = vscode.commands.registerCommand('i18n-manager.convertAll', async () => {
		const filteredTexts = treeDataProvider.getFilteredKoreanTexts();
		
		if (filteredTexts.length === 0) {
			vscode.window.showInformationMessage('변환할 한글 텍스트가 없습니다.');
			return;
		}
		
		// 범위 정보도 함께 전달
		const ranges = currentKoreanRanges.filter(range => 
			!treeDataProvider.getExcludedTexts().has(range.text)
		);
		
		await applyConversionFromPreview(filteredTexts, ranges);
		
		// 변환 후 새로고침
		if (isMonitoring) {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				extractKoreanTextsFromEditor(editor);
			}
		}
	});

	// 선택된 텍스트를 pending에 추가하는 명령어 등록
	const addSelectedCommand = vscode.commands.registerCommand('i18n-manager.addSelected', () => {
		addSelectedTextToPending();
	});

	// locales.json 생성 명령어 등록
	const generateLocalesCommand = vscode.commands.registerCommand('i18n-manager.generateLocales', async () => {
		const filteredTexts = treeDataProvider.getFilteredKoreanTexts();
		await generateLocalesJson(filteredTexts, 'ko'); // 한국어로 기본 설정
	});

	// 모든 명령어를 context에 등록
	context.subscriptions.push(
		startCommand,
		stopCommand,
		refreshCommand,
		excludeCommand,
		includeCommand,
		goToTextCommand,
		previewCommand,
		clearPreviewCommand,
		convertAllCommand,
		addSelectedCommand,
		generateLocalesCommand  // 새로 추가
	);
}

// 하이라이트 업데이트 함수
function updateHighlights(): void {
	if (!isMonitoring) {return;}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {return;}

	// 제외된 텍스트를 제외한 한글 범위들만 필터링
	const filteredKoreanRanges = currentKoreanRanges.filter(range => 
		!treeDataProvider.getExcludedTexts().has(range.text)
	);

	// 하이라이트 적용
	highlighter.highlightText(editor, filteredKoreanRanges, currentI18nRanges);
}

// 모니터링 시작
function startMonitoring(): void {
	if (isMonitoring) {return;}

	isMonitoring = true;
	treeDataProvider.setActive(true);

	// 현재 활성 편집기에서 한글 텍스트 추출
	const extractFromCurrentEditor = () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			extractKoreanTextsFromEditor(editor);
		}
	};

	// 활성 편집기가 변경될 때마다 실행
	const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && isMonitoring) {
			extractKoreanTextsFromEditor(editor);
		}
	});

	// 문서가 변경될 때마다 실행 (디바운스 적용)
	const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document === event.document && isMonitoring) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				extractKoreanTextsFromEditor(editor);
			}, 500); // 500ms 디바운스
		}
	});

	// 초기 실행
	extractFromCurrentEditor();

	// 이벤트 리스너들을 전역으로 저장 (나중에 정리하기 위해)
	(global as any).i18nEventListeners = {
		onDidChangeActiveTextEditor,
		onDidChangeTextDocument
	};
}

// 모니터링 중지
function stopMonitoring(): void {
	if (!isMonitoring) {return;}

	isMonitoring = false;
	treeDataProvider.setActive(false);

	// 이벤트 리스너들 정리
	const listeners = (global as any).i18nEventListeners;
	if (listeners) {
		listeners.onDidChangeActiveTextEditor.dispose();
		listeners.onDidChangeTextDocument.dispose();
		(global as any).i18nEventListeners = null;
	}

	// 타이머 정리
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = undefined;
	}

	// 하이라이트 제거
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		highlighter.clearDecorations(editor);
	}

	// 패널 비우기
	treeDataProvider.updateData([]);

	// 사용자 제외 목록 초기화
	treeDataProvider.clearExcludedTexts();

	// 전역 변수 초기화
	currentKoreanRanges = [];
	currentI18nRanges = [];
}

// 한글 텍스트 추출 함수
function extractKoreanTextsFromEditor(editor: vscode.TextEditor): void {
	if (!isMonitoring) {return;}

	const document = editor.document;
	const fileName = document.fileName;
	const text = document.getText();
	
	// 한글 텍스트 추출
	const { koreanRanges, i18nRanges } = extractKoreanTexts(text, fileName);
	
	// 전역 변수에 저장
	currentKoreanRanges = koreanRanges;
	currentI18nRanges = i18nRanges;
	
	// TreeView에 표시할 데이터 준비
	const allTexts = [
		...koreanRanges.map(range => ({ text: range.text, type: 'korean' as const })),
		...i18nRanges.map(range => ({ text: range.text, type: 'i18n' as const }))
	];
	
	// 하이라이트 적용 (제외된 텍스트 제외)
	const filteredKoreanRanges = koreanRanges.filter(range => 
		!treeDataProvider.getExcludedTexts().has(range.text)
	);
	highlighter.highlightText(editor, filteredKoreanRanges, i18nRanges);
	
	// TreeView 업데이트
	treeDataProvider.updateData(allTexts);
}

// 텍스트 위치로 이동하는 함수
function goToTextLocation(text: string): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('활성 편집기가 없습니다.');
		return;
	}

	// 현재 범위들에서 해당 텍스트 찾기
	const allRanges = [...currentKoreanRanges, ...currentI18nRanges];
	const targetRange = allRanges.find(range => range.text === text);
	
	if (!targetRange) {
		vscode.window.showWarningMessage(`"${text}"을(를) 찾을 수 없습니다.`);
		return;
	}

	// 위치로 이동
	const startPos = editor.document.positionAt(targetRange.start);
	const endPos = editor.document.positionAt(targetRange.end);
	const range = new vscode.Range(startPos, endPos);
	
	// 선택하고 스크롤
	editor.selection = new vscode.Selection(startPos, endPos);
	editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	
	// 포커스 이동
	vscode.window.showTextDocument(editor.document, editor.viewColumn);
}

// 선택된 텍스트를 pending에 추가하는 함수
function addSelectedTextToPending(): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('활성 편집기가 없습니다.');
		return;
	}

	const selection = editor.selection;
	if (selection.isEmpty) {
		vscode.window.showWarningMessage('텍스트를 선택해주세요.');
		return;
	}

	const selectedText = editor.document.getText(selection).trim();
	if (!selectedText) {
		vscode.window.showWarningMessage('선택된 텍스트가 없습니다.');
		return;
	}

	// 한글이 포함되어 있는지 확인
	if (!/[가-힣]/.test(selectedText)) {
		vscode.window.showWarningMessage('선택된 텍스트에 한글이 포함되어 있지 않습니다.');
		return;
	}

	// 이미 pending에 있는지 확인
	const existingTexts = treeDataProvider.getFilteredKoreanTexts();
	if (existingTexts.includes(selectedText)) {
		vscode.window.showInformationMessage('이미 pending 목록에 있는 텍스트입니다.');
		return;
	}

	// 선택된 텍스트의 위치 정보 생성
	const start = editor.document.offsetAt(selection.start);
	const end = editor.document.offsetAt(selection.end);
	
	// 새로운 KoreanRange 생성
	const newRange = {
		start: start,
		end: end,
		text: selectedText
	};

	// currentKoreanRanges에 추가
	currentKoreanRanges.push(newRange);

	// TreeView 업데이트
	const allTexts = [
		...currentKoreanRanges.map(range => ({ text: range.text, type: 'korean' as const })),
		...currentI18nRanges.map(range => ({ text: range.text, type: 'i18n' as const }))
	];
	treeDataProvider.updateData(allTexts);

	// 하이라이트 업데이트
	const filteredKoreanRanges = currentKoreanRanges.filter(range => 
		!treeDataProvider.getExcludedTexts().has(range.text)
	);
	highlighter.highlightText(editor, filteredKoreanRanges, currentI18nRanges);

	vscode.window.showInformationMessage('pending 목록에 추가되었습니다.');
}

// This method is called when your extension is deactivated
export function deactivate() {
	stopMonitoring();
}