// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractKoreanTexts } from './korean-extractor';
import { TextHighlighter } from './highlighter';

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
			const pendingSection = new I18nItem(
				`🌐 국제화 대기 (${this.koreanTexts.length})`,
				'pending-section',
				vscode.TreeItemCollapsibleState.Expanded
			);
			pendingSection.children = this.koreanTexts.filter(item => !this.excludedTexts.has(item.label));
			items.push(pendingSection);

			// 국제화 완료 섹션
			const completedSection = new I18nItem(
				`✅ 국제화 완료 (${this.i18nTexts.length})`,
				'completed-section',
				vscode.TreeItemCollapsibleState.Expanded
			);
			completedSection.children = this.i18nTexts;
			items.push(completedSection);

			return Promise.resolve(items);
		}

		// 섹션의 자식들 반환
		if (element.type === 'pending-section') {
			return Promise.resolve(this.koreanTexts.filter(item => !this.excludedTexts.has(item.label)));
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
				treeItem.tooltip = `한글 텍스트: ${item.text}`;
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
				treeItem.tooltip = `i18n 적용됨: ${item.text}`;
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
		this.refresh();
		
		// 하이라이트 업데이트
		updateHighlights();
	}

	includeText(text: string): void {
		this.excludedTexts.delete(text);
		this.refresh();
		
		// 하이라이트 업데이트
		updateHighlights();
	}

	getExcludedTexts(): Set<string> {
		return this.excludedTexts;
	}
}

// TreeView 아이템 클래스
class I18nItem extends vscode.TreeItem {
	public children?: I18nItem[];

	constructor(
		public readonly label: string,
		public readonly type: 'korean' | 'i18n' | 'start' | 'stop' | 'refresh' | 'pending-section' | 'completed-section' | 'button-container' | 'control-buttons',
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
		
		if (type === 'korean') {
			this.iconPath = new vscode.ThemeIcon('text');
			this.description = '한글 텍스트';
		} else if (type === 'i18n') {
			this.iconPath = new vscode.ThemeIcon('check');
			this.description = 'i18n 적용됨';
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

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "i18n-manager" is now active!');

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
			vscode.window.showInformationMessage(`"${item.label}"을(를) 제외 목록에 추가했습니다.`);
		}
	});

	// 텍스트 포함 명령어 등록
	const includeCommand = vscode.commands.registerCommand('i18n-manager.include', (item: I18nItem) => {
		if (item.type === 'korean') {
			treeDataProvider.includeText(item.label);
			vscode.window.showInformationMessage(`"${item.label}"을(를) 다시 포함했습니다.`);
		}
	});

	// 텍스트 위치로 이동 명령어 등록
	const goToTextCommand = vscode.commands.registerCommand('i18n-manager.goToText', (item: I18nItem) => {
		if (item.type === 'korean' || item.type === 'i18n') {
			goToTextLocation(item.label);
		}
	});

	context.subscriptions.push(
		startCommand,
		stopCommand,
		refreshCommand,
		excludeCommand,
		includeCommand,
		goToTextCommand
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

	vscode.window.showInformationMessage('i18n Manager가 시작되었습니다.');
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

	// 전역 변수 초기화
	currentKoreanRanges = [];
	currentI18nRanges = [];

	vscode.window.showInformationMessage('i18n Manager가 중지되었습니다.');
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
		vscode.window.showWarningMessage(`"${text}"를 찾을 수 없습니다.`);
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

// This method is called when your extension is deactivated
export function deactivate() {
	stopMonitoring();
}