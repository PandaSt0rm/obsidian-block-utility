import { App, Editor, EditorPosition, MarkdownView, Notice, Plugin } from 'obsidian';

/**
 * @interface BlockInfo
 * @description Defines the structure for returning information about a fenced region.
 *
 * @property {boolean} success - Indicates whether a valid fenced region containing the cursor was successfully found.
 * @property {number} startLine - The line number (0-indexed) of the opening delimiter (``` / ~~~ / $$ / :::box-info / :::tag-info / :::...). -1 if not found or not applicable.
 * @property {number} endLine - The line number (0-indexed) of the closing delimiter (``` / ~~~ / $$ / :::end-... / :::). -1 if not found or not applicable.
 * @property {BlockType | null} blockType - The type of fenced content identified.
 * @property {string} [errorMessage] - An optional user-friendly message explaining why the operation failed (e.g., cursor outside fence, delimiter mismatch). Included when success is false.
 */
type BlockType =
	| 'Code'
	| 'LaTeX'
	| 'BoxInfo'
	| 'TagInfo'
	| 'InlineLaTeX'
	| 'InlineMath'
	| 'InlineCode'
	| 'InlineItalic'
	| 'InlineBold'
	| 'InlineBoldItalic'
	| 'InlineUnderline'
	| 'InlineStrikethrough'
	| 'InlineHighlight'
	| 'GenericFence';

type BlockDelimiter = string;

const BLOCK_LABELS: Record<BlockType, string> = {
	Code: 'Code',
	LaTeX: 'LaTeX',
	BoxInfo: 'Box Info',
	TagInfo: 'Tag Info',
	InlineLaTeX: 'LaTeX',
	InlineMath: 'LaTeX',
	InlineCode: 'Inline Code',
	InlineItalic: 'Italic',
	InlineBold: 'Bold',
	InlineBoldItalic: 'Bold/Italic',
	InlineUnderline: 'Underline',
	InlineStrikethrough: 'Strikethrough',
	InlineHighlight: 'Highlight',
	GenericFence: 'Markdown fence',
};

const getBlockLabel = (blockType: BlockType | null): string => {
	if (!blockType) {
		return 'Fence';
	}
	return BLOCK_LABELS[blockType] ?? 'Fence';
};

interface BlockInfo {
	success: boolean;
	startLine: number;
	endLine: number;
	blockType: BlockType | null;
	startCh?: number;
	endCh?: number;
	outerStartCh?: number;
	outerEndCh?: number;
	errorMessage?: string;
}

interface InlineFenceMatch {
	blockType: Extract<
		BlockType,
		| 'InlineLaTeX'
		| 'InlineMath'
		| 'InlineCode'
		| 'InlineItalic'
		| 'InlineBold'
		| 'InlineBoldItalic'
		| 'InlineUnderline'
		| 'InlineStrikethrough'
		| 'InlineHighlight'
	>;
	contentStart: number;
	contentEnd: number;
	outerStart: number;
	outerEnd: number;
}

interface InlineFormattingRule {
	char: string;
	blockTypesByLength: Partial<Record<number, InlineFenceMatch['blockType']>>;
}

interface FenceDetection {
	blockType: BlockType;
	startDelimiter: BlockDelimiter;
	endDelimiter: BlockDelimiter;
	indent: string;
	closingMatcher: (trimmedLine: string) => boolean;
}

interface CursorFenceState {
	inBacktickCode: boolean;
	inTildeCode: boolean;
	inDollarLatex: boolean;
}

/**
 * @class BlockUtilityPlugin
 * @extends Plugin
 * @description The main class for the Obsidian Block Utility plugin. Handles loading commands
 * for copying, selecting, wrapping, and removing Markdown fences (code, math, info, and inline).
 */
export default class BlockUtilityPlugin extends Plugin {

	/**
	 * @async
	 * @function onload
	 * @description Called when the plugin is loaded. Sets up the commands and logs initialization.
	 * Registers the 'copy-current-block' and 'select-current-block' commands.
	 * @override
	 * @returns {Promise<void>} A promise that resolves when loading is complete.
	 */
	async onload(): Promise<void> {
		const startTime = Date.now();
		console.log(`BlockUtilityPlugin: Loading plugin... Start time: ${startTime}`);

		try {
			// Command to copy fenced content
			this.addCommand({
				id: 'copy-current-block',
				name: 'Copy fenced content under cursor',
				/**
				 * @param {Editor} editor - The current editor instance.
				 * @param {MarkdownView} view - The current markdown view instance.
				 */
				editorCallback: (editor: Editor, view: MarkdownView) => {
					console.debug("BlockUtilityPlugin: 'copy-current-block' command triggered.");
					try {
						this.copyBlockUnderCursor(editor);
					} catch (error) {
						console.error("BlockUtilityPlugin: Uncaught error during copyBlockUnderCursor execution:", error);
						new Notice("Block Utility: An unexpected error occurred during copy. Check console for details.");
					}
				}
			});
			console.log("BlockUtilityPlugin: Registered 'copy-current-block' command.");

			// Command to select fenced content
			this.addCommand({
				id: 'select-current-block',
				name: 'Select fenced content under cursor',
				/**
				 * @param {Editor} editor - The current editor instance.
				 * @param {MarkdownView} view - The current markdown view instance.
				 */
				editorCallback: (editor: Editor, view: MarkdownView) => {
					console.debug("BlockUtilityPlugin: 'select-current-block' command triggered.");
					try {
						this.selectBlockUnderCursor(editor);
					} catch (error) {
						console.error("BlockUtilityPlugin: Uncaught error during selectBlockUnderCursor execution:", error);
						new Notice("Block Utility: An unexpected error occurred during select. Check console for details.");
					}
				}
			});
			console.log("BlockUtilityPlugin: Registered 'select-current-block' command.");

			// Command to WRAP selection with :::box-info fence
			this.addCommand({
				id: 'wrap-selection-box-info',
				name: 'Wrap selection with :::box-info fence',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-box-info' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::box-info', ':::end-box-info', BLOCK_LABELS.BoxInfo);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with box-info block:", error);
						new Notice('Block Utility: Failed to wrap selection with :::box-info fence. See console.');
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-box-info' command.");

			// Command to WRAP selection with :::tag-info fence
			this.addCommand({
				id: 'wrap-selection-tag-info',
				name: 'Wrap selection with :::tag-info fence',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-tag-info' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::tag-info', ':::end-tag-info', BLOCK_LABELS.TagInfo);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with tag-info block:", error);
						new Notice('Block Utility: Failed to wrap selection with :::tag-info fence. See console.');
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-tag-info' command.");

			// Command to WRAP selection with :::latex fence
			this.addCommand({
				id: 'wrap-selection-latex-fence',
				name: 'Wrap selection with :::latex fence',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-latex-fence' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::latex', ':::end-latex', BLOCK_LABELS.LaTeX);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with latex block:", error);
						new Notice('Block Utility: Failed to wrap selection with :::latex fence. See console.');
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-latex-fence' command.");

			// Command to remove fences from the current selection
			this.addCommand({
				id: 'remove-current-block-fence',
				name: 'Remove fences around content under cursor',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'remove-current-block-fence' command triggered.");
					try {
						this.removeBlockFence(editor);
					} catch (error) {
					console.error('BlockUtilityPlugin: Error removing fences during command:', error);
					new Notice('Block Utility: Failed to remove fences. See console.');
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'remove-current-block-fence' command.");

		} catch (error) {
			console.error("BlockUtilityPlugin: Failed to register commands during onload:", error);
			new Notice("Block Utility: Failed to initialize commands. Check console for details.");
		}

		const endTime = Date.now();
		console.log(`BlockUtilityPlugin: Plugin loaded successfully. Load time: ${endTime - startTime}ms`);
	}

	/**
	 * @function onunload
	 * @description Called when the plugin is unloaded. Performs cleanup and logs shutdown.
	 * @override
	 * @returns {void}
	 */
	onunload(): void {
		console.log('BlockUtilityPlugin: Unloading plugin...');
		// No specific resources to clean up in this version.
	}

	/**
	 * @function findBlockBoundaries
	 * @description Locates the boundaries (start and end lines) and type of a fenced Markdown region (e.g.,
	 * code fences ```/~~~ with optional info strings, LaTeX blocks $$, :::-style admonitions, and other
	 * supported fences) that contains the editor's current cursor position. Inline fences are also detected
	 * when no surrounding block fences are found.
	 * It skips indented (nested) fence markers to only use the root fence.
	 * @param {Editor} editor - The Obsidian Editor instance representing the current active editor.
	 * Provides access to cursor position and document content.
	 * Assumes the editor instance is valid and available.
	 * @returns {BlockInfo} An object containing:
	 * - `success`: boolean indicating if a valid fenced region containing the cursor was found.
	 * - `startLine`: number, the 0-indexed line of the opening delimiter, or -1.
	 * - `endLine`: number, the 0-indexed line of the closing delimiter, or -1.
	 * - `blockType`: `BlockType | null`, the type of fenced content found.
	 * - `errorMessage`: string | undefined, a message if success is false.
	 * @throws {Error} This function aims to handle errors internally by returning `success: false` and an
	 * `errorMessage`. However, unexpected errors during editor interaction (though unlikely
	 * with the Obsidian API) could theoretically propagate.
	 */
	findBlockBoundaries(editor: Editor): BlockInfo {
		console.debug("BlockUtilityPlugin: Entering findBlockBoundaries function.");
		let cursor;
		try {
			cursor = editor.getCursor();
			if (!cursor) {
				throw new Error("Failed to get cursor position.");
			}
			console.debug(`BlockUtilityPlugin: Cursor position: Line ${cursor.line}, Ch ${cursor.ch}`);
		} catch (err) {
			console.error("BlockUtilityPlugin: Error getting cursor:", err);
			return { success: false, startLine: -1, endLine: -1, blockType: null, errorMessage: "Could not get cursor position." };
		}

		const currentLineNum = cursor.line;
		const totalLines = editor.lineCount();
		console.debug(`BlockUtilityPlugin: Total lines in document: ${totalLines}`);

		// Prefer inline fences first so repeated presses peel layers from the caret outward.
		try {
			const currentLineText = editor.getLine(currentLineNum);
			const cursorPositions = this.collectCursorColumnsForLine(editor, currentLineNum, cursor);
			const inlineFirst = this.findInlineFenceMatch(currentLineText, cursorPositions);
			if (inlineFirst) {
				console.debug(
					`BlockUtilityPlugin: Inline fence (${inlineFirst.blockType}) detected on line ${currentLineNum} spanning ch ${inlineFirst.contentStart} to ${inlineFirst.contentEnd}.`,
				);
				return {
					success: true,
					startLine: currentLineNum,
					endLine: currentLineNum,
					blockType: inlineFirst.blockType,
					startCh: inlineFirst.contentStart,
					endCh: inlineFirst.contentEnd,
					outerStartCh: inlineFirst.outerStart,
					outerEndCh: inlineFirst.outerEnd,
				};
			}
		} catch (err) {
			console.warn(`BlockUtilityPlugin: Error performing inline-first detection on line ${currentLineNum}:`, err);
		}

		const cursorFenceState = this.getCursorFenceState(editor, currentLineNum);

		let startLineNum = -1;
		let endLineNum = -1;
		let startDelimiter: BlockDelimiter | null = null;
		let endDelimiter: BlockDelimiter | null = null;
		let blockIndent: string | null = null;
		let blockType: BlockType | null = null;
		let closingMatcher: ((trimmedLine: string) => boolean) | null = null;

		// Searching backwards for a root start delimiter while skipping indented fences.
		console.debug(`BlockUtilityPlugin: Searching backwards for root start delimiter from line ${currentLineNum}.`);
		for (let i = currentLineNum; i >= 0; i--) {
			let originalLine: string;
			let trimmedLine: string;
			try {
				originalLine = editor.getLine(i);
				trimmedLine = originalLine.trim();
			} catch (err) {
				console.warn(`BlockUtilityPlugin: Error reading line ${i} during backward search:`, err);
				continue;
			}

			const normalizedLine = trimmedLine.toLowerCase();
			const leadingWhitespaceLength = originalLine.length - trimmedLine.length;
			const leadingWhitespace = leadingWhitespaceLength > 0 ? originalLine.slice(0, leadingWhitespaceLength) : '';

			const detection = this.detectFenceStart(trimmedLine, normalizedLine, leadingWhitespace);
			if (detection) {
				if (!this.isFenceActiveAtCursor(detection, cursorFenceState)) {
					continue;
				}
				startLineNum = i;
				startDelimiter = detection.startDelimiter;
				endDelimiter = detection.endDelimiter;
				blockType = detection.blockType;
				blockIndent = detection.indent;
				closingMatcher = detection.closingMatcher;
				console.debug(
					`BlockUtilityPlugin: Found potential root ${blockType} fence start '${trimmedLine}' at line ${i}.`,
				);
				break;
			}
		}

			if (startLineNum === -1 || !blockType || !endDelimiter || !closingMatcher) {
				console.debug("BlockUtilityPlugin: No root start delimiter found enclosing the cursor.");
				return {
					success: false,
					startLine: -1,
					endLine: -1,
					blockType: null,
					errorMessage: 'Cursor is not inside a recognized Markdown fence.',
				};
			}

		// Searching forwards for a matching root end delimiter while skipping indented fences.
		console.debug(`BlockUtilityPlugin: Searching forwards for root end delimiter '${endDelimiter}' from line ${startLineNum + 1}.`);
		for (let i = startLineNum + 1; i < totalLines; i++) {
			let originalLine: string;
			let trimmedLine: string;
			try {
				originalLine = editor.getLine(i);
				trimmedLine = originalLine.trim();
			} catch (err) {
				console.warn(`BlockUtilityPlugin: Error reading line ${i} during forward search:`, err);
				continue;
			}

			const leadingWhitespaceLength = originalLine.length - trimmedLine.length;
			const leadingWhitespace = leadingWhitespaceLength > 0 ? originalLine.slice(0, leadingWhitespaceLength) : '';
			const indentMatches = blockIndent === null ? leadingWhitespaceLength === 0 : leadingWhitespace === blockIndent;

			if (!indentMatches) {
				continue;
			}

			if (closingMatcher && closingMatcher(trimmedLine)) {
				endLineNum = i;
				console.debug(`BlockUtilityPlugin: Found matching root end delimiter '${endDelimiter}' at line ${i}.`);
				break;
			}
		}

		if (endLineNum === -1) {
			console.debug(`BlockUtilityPlugin: No matching root end delimiter '${endDelimiter}' found after line ${startLineNum}.`);
			const fenceLabel = getBlockLabel(blockType);
			return {
				success: false,
				startLine: startLineNum,
				endLine: -1,
				blockType: blockType,
				errorMessage: `Could not find a closing fence (${endDelimiter}) for this ${fenceLabel}.`,
			};
		}

		// Ensure the cursor line is strictly between the start and end delimiter lines.
		if (currentLineNum <= startLineNum || currentLineNum >= endLineNum) {
			console.debug(`BlockUtilityPlugin: Cursor at line ${currentLineNum} is not strictly between start line ${startLineNum} and end line ${endLineNum}.`);
			const fenceLabel = getBlockLabel(blockType);
			return {
				success: false,
				startLine: startLineNum,
				endLine: endLineNum,
				blockType: blockType,
				errorMessage: `Cursor is not inside this ${fenceLabel} fence's content area.`,
			};
		}

		const fenceLabel = getBlockLabel(blockType);
		console.debug(
			`BlockUtilityPlugin: Successfully identified ${fenceLabel} fence from line ${startLineNum} to ${endLineNum}. Cursor is within content.`,
		);
		return { success: true, startLine: startLineNum, endLine: endLineNum, blockType: blockType };
	}

	private normalizeSelection(editor: Editor): { from: EditorPosition; to: EditorPosition } {
		const selections = editor.listSelections();
		if (!selections || selections.length === 0) {
			const cursor = editor.getCursor();
			return {
				from: { line: cursor.line, ch: cursor.ch },
				to: { line: cursor.line, ch: cursor.ch },
			};
		}
		const primary = selections[0];
		const { anchor, head } = primary;
		const anchorBeforeHead =
			anchor.line < head.line || (anchor.line === head.line && anchor.ch <= head.ch);
		const start = anchorBeforeHead ? anchor : head;
		const end = anchorBeforeHead ? head : anchor;
		return {
			from: { line: start.line, ch: start.ch },
			to: { line: end.line, ch: end.ch },
		};
	}

	private wrapSelectionWithFence(
		editor: Editor,
		startFence: string,
		endFence: string,
		blockLabel: string,
	): void {
		const PLACEHOLDER = 'Your text here';
		const { from, to } = this.normalizeSelection(editor);
		const selectedText = editor.getRange(from, to);
		const hasSelection = selectedText.length > 0;
		const innerContent = hasSelection ? selectedText : PLACEHOLDER;
		const wrapped = `${startFence}\n${innerContent}\n${endFence}`;

		editor.replaceRange(wrapped, from, to);

		const innerLines = innerContent.split('\n');
		const innerStartLine = from.line + 1;
		const innerEndLine = innerStartLine + innerLines.length - 1;
		const endCh = innerLines.length === 1 ? innerLines[0].length : innerLines[innerLines.length - 1].length;

		if (hasSelection) {
			editor.setSelection(
				{ line: innerStartLine, ch: 0 },
				{ line: innerEndLine, ch: endCh },
			);
		} else {
			editor.setSelection(
				{ line: innerStartLine, ch: 0 },
				{ line: innerStartLine, ch: PLACEHOLDER.length },
			);
		}

		new Notice(`${blockLabel} fence inserted.`);
	}

	private collectCursorColumnsForLine(editor: Editor, line: number, cursor: EditorPosition): number[] {
		const columns = new Set<number>();
		if (cursor.line === line) {
			columns.add(cursor.ch);
		}

		const selections = editor.listSelections?.();
		if (selections) {
			for (const selection of selections) {
				if (selection.anchor.line === line) {
					columns.add(selection.anchor.ch);
				}
				if (selection.head.line === line) {
					columns.add(selection.head.ch);
				}
			}
		}

		return Array.from(columns).sort((a, b) => a - b);
	}

	private findInlineFenceMatch(lineText: string, cursorColumns: number[]): InlineFenceMatch | null {
		if (!lineText || cursorColumns.length === 0) {
			return null;
		}

		const candidates = this.findInlineFenceCandidates(lineText);
		if (candidates.length === 0) {
			return null;
		}

		candidates.sort((a, b) => {
			if (a.outerStart !== b.outerStart) {
				return a.outerStart - b.outerStart;
			}
			return b.outerEnd - a.outerEnd;
		});

		for (const candidate of candidates) {
			const hasInsideCursor = cursorColumns.some(ch => ch > candidate.outerStart && ch < candidate.outerEnd);
			const hasBoundarySelection = cursorColumns.includes(candidate.outerStart) && cursorColumns.includes(candidate.outerEnd);
			if (hasInsideCursor || hasBoundarySelection) {
				return candidate;
			}
		}

		return null;
	}

	private findInlineFenceCandidates(lineText: string): InlineFenceMatch[] {
		return [
			...this.findInlineCodeMatches(lineText),
			...this.findInlineMathMatches(lineText),
			...this.findInlineFormattingMatches(lineText),
		];
	}

	private detectFenceStart(trimmedLine: string, normalizedLine: string, leadingWhitespace: string): FenceDetection | null {
		if (!trimmedLine) {
			return null;
		}

		const backtickDetection = this.createCodeFenceDetection(trimmedLine, leadingWhitespace, '`');
		if (backtickDetection) {
			return backtickDetection;
		}

		const tildeDetection = this.createCodeFenceDetection(trimmedLine, leadingWhitespace, '~');
		if (tildeDetection) {
			return tildeDetection;
		}

		if (trimmedLine === '$$') {
			return {
				blockType: 'LaTeX',
				startDelimiter: '$$',
				endDelimiter: '$$',
				indent: leadingWhitespace,
				closingMatcher: candidate => candidate.trim() === '$$',
			};
		}

		if (normalizedLine.startsWith(':::box-info')) {
			return {
				blockType: 'BoxInfo',
				startDelimiter: ':::box-info',
				endDelimiter: ':::end-box-info',
				indent: leadingWhitespace,
				closingMatcher: candidate => candidate.trim().toLowerCase() === ':::end-box-info',
			};
		}

		if (normalizedLine.startsWith(':::tag-info')) {
			return {
				blockType: 'TagInfo',
				startDelimiter: ':::tag-info',
				endDelimiter: ':::end-tag-info',
				indent: leadingWhitespace,
				closingMatcher: candidate => candidate.trim().toLowerCase() === ':::end-tag-info',
			};
		}

		if (normalizedLine.startsWith(':::latex')) {
			return {
				blockType: 'LaTeX',
				startDelimiter: ':::latex',
				endDelimiter: ':::end-latex',
				indent: leadingWhitespace,
				closingMatcher: candidate => candidate.trim().toLowerCase() === ':::end-latex',
			};
		}

		if (trimmedLine.startsWith(':::')) {
			const label = trimmedLine.slice(3).trim();
			const lowerLabel = label.toLowerCase();
			if (!label || lowerLabel.startsWith('end-')) {
				return null;
			}
			return {
				blockType: 'GenericFence',
				startDelimiter: trimmedLine,
				endDelimiter: ':::',
				indent: leadingWhitespace,
				closingMatcher: candidate => {
					const trimmedCandidate = candidate.trim();
					if (!trimmedCandidate.startsWith(':::')) {
						return false;
					}
					const remainder = trimmedCandidate.slice(3).trim().toLowerCase();
					if (!remainder) {
						return true;
					}
					return remainder === `end-${lowerLabel}`;
				},
			};
		}

		return null;
	}

	private createCodeFenceDetection(
		trimmedLine: string,
		leadingWhitespace: string,
		fenceChar: '`' | '~',
	): FenceDetection | null {
		if (!trimmedLine.startsWith(fenceChar.repeat(3))) {
			return null;
		}

		const fenceLength = this.countLeadingFenceCharacters(trimmedLine, fenceChar);
		if (fenceLength < 3) {
			return null;
		}

		const fenceSequence = fenceChar.repeat(fenceLength);
		return {
			blockType: 'Code',
			startDelimiter: fenceSequence,
			endDelimiter: fenceSequence,
			indent: leadingWhitespace,
			closingMatcher: candidate => {
				const trimmedCandidate = candidate.trim();
				if (!trimmedCandidate.startsWith(fenceSequence)) {
					return false;
				}
				const suffix = trimmedCandidate.slice(fenceSequence.length).trim();
				return suffix.length === 0;
			},
		};
	}

	private countLeadingFenceCharacters(text: string, targetChar: string): number {
		let count = 0;
		for (let i = 0; i < text.length; i++) {
			if (text[i] === targetChar) {
				count++;
			} else {
				break;
			}
		}
		return count;
	}

	private findInlineCodeMatches(lineText: string): InlineFenceMatch[] {
		const matches: InlineFenceMatch[] = [];
		const length = lineText.length;

		for (let i = 0; i < length; i++) {
			if (lineText[i] !== '`') {
				continue;
			}

			let fenceLength = 1;
			let j = i + 1;
			while (j < length && lineText[j] === '`') {
				fenceLength++;
				j++;
			}

			const openingEnd = i + fenceLength;
			let closingStart = -1;
			let searchIndex = openingEnd;

			while (searchIndex < length) {
				if (lineText[searchIndex] === '`') {
					let candidateLength = 1;
					let candidateIndex = searchIndex + 1;
					while (candidateIndex < length && lineText[candidateIndex] === '`') {
						candidateLength++;
						candidateIndex++;
					}

					if (candidateLength === fenceLength) {
						closingStart = searchIndex;
						const closingEnd = searchIndex + fenceLength;
						matches.push({
							blockType: 'InlineCode',
							contentStart: openingEnd,
							contentEnd: closingStart,
							outerStart: i,
							outerEnd: closingEnd,
						});
						i = closingEnd - 1;
						break;
					}

					searchIndex = candidateIndex;
					continue;
				}
				searchIndex++;
			}

			if (closingStart === -1) {
				i = openingEnd - 1;
			}
		}

		return matches;
	}

	private findInlineMathMatches(lineText: string): InlineFenceMatch[] {
		const matches: InlineFenceMatch[] = [];
		const length = lineText.length;

		for (let i = 0; i < length; i++) {
			if (lineText[i] !== '$' || this.isEscaped(lineText, i)) {
				continue;
			}

			let fenceLength = 1;
			if (i + 1 < length && lineText[i + 1] === '$' && !this.isEscaped(lineText, i + 1)) {
				fenceLength = 2;
			}

			const openingEnd = i + fenceLength;
			let closingStart = -1;
			let searchIndex = openingEnd;

			while (searchIndex < length) {
				if (lineText[searchIndex] === '$' && !this.isEscaped(lineText, searchIndex)) {
					let candidateLength = 1;
					let candidateIndex = searchIndex + 1;
					while (
						candidateIndex < length &&
						lineText[candidateIndex] === '$' &&
						!this.isEscaped(lineText, candidateIndex)
					) {
						candidateLength++;
						candidateIndex++;
					}

					if (candidateLength === fenceLength) {
						closingStart = searchIndex;
						const closingEnd = searchIndex + fenceLength;
						matches.push({
							blockType: fenceLength === 1 ? 'InlineMath' : 'InlineLaTeX',
							contentStart: openingEnd,
							contentEnd: closingStart,
							outerStart: i,
							outerEnd: closingEnd,
						});
						i = closingEnd - 1;
						break;
					}

					searchIndex = candidateIndex;
					continue;
				}
				searchIndex++;
			}

			if (closingStart === -1) {
				i = openingEnd - 1;
			}
		}

		return matches;
	}

	private findInlineFormattingMatches(lineText: string): InlineFenceMatch[] {
		const matches: InlineFenceMatch[] = [];
		const length = lineText.length;
		if (length === 0) {
			return matches;
		}

		const rules: InlineFormattingRule[] = [
			{ char: '*', blockTypesByLength: { 3: 'InlineBoldItalic', 2: 'InlineBold', 1: 'InlineItalic' } },
			{ char: '_', blockTypesByLength: { 3: 'InlineBoldItalic', 2: 'InlineBold', 1: 'InlineItalic' } },
			{ char: '~', blockTypesByLength: { 2: 'InlineStrikethrough' } },
			{ char: '=', blockTypesByLength: { 2: 'InlineHighlight' } },
			{ char: '+', blockTypesByLength: { 2: 'InlineUnderline' } },
		];

		outer: for (let i = 0; i < length; i++) {
			for (const rule of rules) {
				if (lineText[i] !== rule.char || this.isEscaped(lineText, i)) {
					continue;
				}

				const runLength = this.countSequentialCharacters(lineText, i, rule.char);
				const candidateLengths = Object.keys(rule.blockTypesByLength)
					.map(len => Number(len))
					.filter(len => len <= runLength && len > 0)
					.sort((a, b) => b - a);

				if (candidateLengths.length === 0) {
					continue;
				}

				for (const markerLength of candidateLengths) {
					const closingMatch = this.findFormattingClosing(lineText, i + markerLength, rule.char, markerLength);
					if (!closingMatch) {
						continue;
					}

					const { closingStart, closingEnd } = closingMatch;
					const innerContent = lineText.slice(i + markerLength, closingStart);
					if (!this.isInlineFormattingContentValid(innerContent)) {
						continue;
					}

					const blockType = rule.blockTypesByLength[markerLength];
					if (!blockType) {
						continue;
					}

					matches.push({
						blockType,
						contentStart: i + markerLength,
						contentEnd: closingStart,
						outerStart: i,
						outerEnd: closingEnd,
					});

					i = closingEnd - 1;
					continue outer;
				}
			}
		}

		return matches;
	}

	private findFormattingClosing(
		lineText: string,
		searchStart: number,
		markerChar: string,
		markerLength: number,
	): { closingStart: number; closingEnd: number } | null {
		const length = lineText.length;
		let searchIndex = searchStart;

		while (searchIndex < length) {
			if (lineText[searchIndex] === markerChar && !this.isEscaped(lineText, searchIndex)) {
				const candidateLength = this.countSequentialCharacters(lineText, searchIndex, markerChar);
				if (candidateLength >= markerLength) {
					return {
						closingStart: searchIndex,
						closingEnd: searchIndex + markerLength,
					};
				}
				searchIndex += candidateLength > 0 ? candidateLength : 1;
				continue;
			}

			searchIndex++;
		}

		return null;
	}

	private isInlineFormattingContentValid(content: string): boolean {
		return content.length > 0 && /\S/.test(content);
	}

	private countSequentialCharacters(text: string, startIndex: number, targetChar: string): number {
		let count = 0;
		for (let i = startIndex; i < text.length; i++) {
			if (text[i] !== targetChar) {
				break;
			}
			count++;
		}
		return count;
	}

	private getCursorFenceState(editor: Editor, currentLine: number): CursorFenceState {
		let inBacktickCode = false;
		let inTildeCode = false;
		let inDollarLatex = false;

		for (let i = 0; i <= currentLine; i++) {
			let line: string;
			try {
				line = editor.getLine(i);
			} catch {
				continue;
			}

			const trimmed = line.trim();
			if (trimmed.startsWith('```')) {
				inBacktickCode = !inBacktickCode;
			}
			if (trimmed.startsWith('~~~')) {
				inTildeCode = !inTildeCode;
			}
			if (trimmed === '$$') {
				inDollarLatex = !inDollarLatex;
			}
		}

		return { inBacktickCode, inTildeCode, inDollarLatex };
	}

	private isFenceActiveAtCursor(detection: FenceDetection, state: CursorFenceState): boolean {
		if (detection.startDelimiter.startsWith('```')) {
			return state.inBacktickCode;
		}

		if (detection.startDelimiter.startsWith('~~~')) {
			return state.inTildeCode;
		}

		if (detection.startDelimiter === '$$') {
			return state.inDollarLatex;
		}

		return true;
	}

	private isEscaped(text: string, index: number): boolean {
		let backslashCount = 0;
		for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
			backslashCount++;
		}
		return backslashCount % 2 === 1;
	}

	private removeBlockFence(editor: Editor): void {
		console.debug('BlockUtilityPlugin: Entering removeBlockFence function.');
		const blockInfo = this.findBlockBoundaries(editor);

		if (!blockInfo.success || !blockInfo.blockType) {
			console.warn(`BlockUtilityPlugin: Cannot remove fences because fenced content was not identified: ${blockInfo.errorMessage}`);
			new Notice(blockInfo.errorMessage || 'Block Utility: Could not identify fenced content for fence removal.');
			return;
		}

		const blockLabel = getBlockLabel(blockInfo.blockType);

		try {
			if (
				this.isInlineBlockType(blockInfo.blockType) &&
				typeof blockInfo.startCh === 'number' &&
				typeof blockInfo.endCh === 'number' &&
				typeof blockInfo.outerStartCh === 'number' &&
				typeof blockInfo.outerEndCh === 'number'
			) {
				const lineText = editor.getLine(blockInfo.startLine);
				const innerContent = lineText.slice(blockInfo.startCh, blockInfo.endCh);
				const from = { line: blockInfo.startLine, ch: blockInfo.outerStartCh };
				const to = { line: blockInfo.endLine, ch: blockInfo.outerEndCh };
				editor.replaceRange(innerContent, from, to);

				const caretOffset = blockInfo.startCh - blockInfo.outerStartCh;
				const normalizedOffset = Number.isFinite(caretOffset)
					? Math.max(0, Math.min(innerContent.length, caretOffset))
					: 0;
				const caretPosition: EditorPosition = {
					line: blockInfo.startLine,
					ch: blockInfo.outerStartCh + normalizedOffset,
				};
				editor.setSelection(caretPosition, caretPosition);
			} else {
				const contentLineCount = blockInfo.endLine - blockInfo.startLine - 1;
				this.removeFenceLine(editor, blockInfo.endLine);
				this.removeFenceLine(editor, blockInfo.startLine);

				if (contentLineCount > 0) {
					const firstContentLine = blockInfo.startLine;
					const lastContentLine = blockInfo.startLine + contentLineCount - 1;
					const lastLineLength = editor.getLine(lastContentLine).length;
					editor.setSelection(
						{ line: firstContentLine, ch: 0 },
						{ line: lastContentLine, ch: lastLineLength },
					);
				} else {
					const cursorPosition: EditorPosition = { line: blockInfo.startLine, ch: 0 };
					editor.setSelection(cursorPosition, cursorPosition);
				}
			}

			console.log(`BlockUtilityPlugin: Removed fences around ${blockLabel}.`);
			new Notice(`${blockLabel} fences removed.`);
		} catch (error) {
			console.error('BlockUtilityPlugin: Error while removing fences:', error);
			new Notice(`Block Utility: Error removing ${blockLabel} fences.`);
		}
	}

	private removeFenceLine(editor: Editor, line: number): void {
		const lineCount = editor.lineCount();
		if (line < 0 || line >= lineCount) {
			return;
		}

		const from = { line, ch: 0 };
		const to = line === lineCount - 1
			? { line, ch: editor.getLine(line).length }
			: { line: line + 1, ch: 0 };

		editor.replaceRange('', from, to);
	}

	private isInlineBlockType(
		blockType: BlockType | null,
	): blockType is Extract<
		BlockType,
		| 'InlineLaTeX'
		| 'InlineMath'
		| 'InlineCode'
		| 'InlineItalic'
		| 'InlineBold'
		| 'InlineBoldItalic'
		| 'InlineUnderline'
		| 'InlineStrikethrough'
		| 'InlineHighlight'
	> {
		return (
			blockType === 'InlineLaTeX' ||
			blockType === 'InlineMath' ||
			blockType === 'InlineCode' ||
			blockType === 'InlineItalic' ||
			blockType === 'InlineBold' ||
			blockType === 'InlineBoldItalic' ||
			blockType === 'InlineUnderline' ||
			blockType === 'InlineStrikethrough' ||
			blockType === 'InlineHighlight'
		);
	}

	/**
	 * @function copyBlockUnderCursor
	 * @description Finds the fenced region containing the cursor and copies its content (excluding delimiters)
	 * to the system clipboard. Provides user feedback via Notices.
	 * @param {Editor} editor - The Obsidian Editor instance. Assumed to be valid.
	 * @returns {void}
	 * @throws {Error} Catches and logs errors related to finding boundaries or clipboard operations,
	 * showing a Notice to the user. Does not re-throw.
	 */
	copyBlockUnderCursor(editor: Editor): void {
		console.debug("BlockUtilityPlugin: Entering copyBlockUnderCursor function.");
		const blockInfo = this.findBlockBoundaries(editor);

		if (!blockInfo.success) {
			console.warn(`BlockUtilityPlugin: Failed to find block boundaries for copy: ${blockInfo.errorMessage}`);
			new Notice(blockInfo.errorMessage || 'Block Utility: Could not identify fenced content for copying.');
			return;
		}

		const blockLabel = getBlockLabel(blockInfo.blockType);

		let blockContent = "";

		try {
			if (
				this.isInlineBlockType(blockInfo.blockType) &&
				typeof blockInfo.startCh === 'number' &&
				typeof blockInfo.endCh === 'number'
			) {
				console.debug(
					`BlockUtilityPlugin: Extracting inline content (${blockInfo.blockType}) on line ${blockInfo.startLine} between ch ${blockInfo.startCh} and ${blockInfo.endCh}.`,
				);
				const lineText = editor.getLine(blockInfo.startLine);
				blockContent = lineText.slice(blockInfo.startCh, blockInfo.endCh);
			} else {
				console.debug(`BlockUtilityPlugin: Extracting content for ${blockLabel} (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
				for (let i = blockInfo.startLine + 1; i < blockInfo.endLine; i++) {
					blockContent += editor.getLine(i) + '\n';
				}
				if (blockContent.length > 0) {
					blockContent = blockContent.slice(0, -1);
				}
			}
			console.debug(`BlockUtilityPlugin: Extracted content length: ${blockContent.length}`);
		} catch (error) {
			console.error('BlockUtilityPlugin: Error during content extraction:', error);
			new Notice(`Block Utility: Error extracting content from ${blockLabel}.`);
			return;
		}

		console.debug("BlockUtilityPlugin: Attempting to write content to clipboard.");
		navigator.clipboard.writeText(blockContent).then(() => {
			console.log(`BlockUtilityPlugin: Successfully copied ${blockLabel} content to clipboard.`);
			new Notice(`${blockLabel} content copied!`);
		}).catch(err => {
			console.error(`BlockUtilityPlugin: Failed to copy ${blockLabel} content to clipboard: `, err);
			new Notice(`Block Utility: Error copying ${blockLabel} content. See console.`);
		});
	}

	/**
	 * @function selectBlockUnderCursor
	 * @description Finds the fenced region containing the cursor and selects its content (excluding delimiters)
	 * within the Obsidian editor.
	 * @param {Editor} editor - The Obsidian Editor instance. Assumed to be valid.
	 * @returns {void}
	 * @throws {Error} Catches and logs errors related to finding boundaries or setting the selection,
	 * showing a Notice to the user if boundary finding fails. Does not re-throw.
	 */
	selectBlockUnderCursor(editor: Editor): void {
		console.debug("BlockUtilityPlugin: Entering selectBlockUnderCursor function.");
		const blockInfo = this.findBlockBoundaries(editor);

		if (!blockInfo.success) {
			console.warn(`BlockUtilityPlugin: Failed to find block boundaries for select: ${blockInfo.errorMessage}`);
			new Notice(blockInfo.errorMessage || 'Block Utility: Could not identify fenced content for selection.');
			return;
		}

		const blockLabel = getBlockLabel(blockInfo.blockType);

		if (
			this.isInlineBlockType(blockInfo.blockType) &&
			typeof blockInfo.startCh === 'number' &&
			typeof blockInfo.endCh === 'number'
		) {
			console.debug(
				`BlockUtilityPlugin: Selecting inline content (${blockInfo.blockType}) on line ${blockInfo.startLine} between ch ${blockInfo.startCh} and ${blockInfo.endCh}.`,
			);
			const anchorPos: EditorPosition = {
				line: blockInfo.startLine,
				ch: blockInfo.startCh,
			};
			const headPos: EditorPosition = {
				line: blockInfo.endLine,
				ch: blockInfo.endCh,
			};
			editor.setSelection(anchorPos, headPos);
			console.log(`BlockUtilityPlugin: Successfully selected content of ${blockLabel}.`);
			return;
		}

		console.debug(`BlockUtilityPlugin: Calculating selection range for ${blockLabel} (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
		const firstContentLine = blockInfo.startLine + 1;
		const lastContentLine = blockInfo.endLine - 1;

		try {
			if (firstContentLine >= blockInfo.endLine) {
				console.debug("BlockUtilityPlugin: Block is empty. Placing cursor at start of content area.");
				const cursorPosition: EditorPosition = {
					line: firstContentLine,
					ch: 0
				};
				editor.setSelection(cursorPosition, cursorPosition);
				return;
			}

			const anchorPos: EditorPosition = {
				line: firstContentLine,
				ch: 0
			};
			console.debug(`BlockUtilityPlugin: Selection anchor: Line ${anchorPos.line}, Ch ${anchorPos.ch}`);

			const lastLineLength = editor.getLine(lastContentLine).length;
			const headPos: EditorPosition = {
				line: lastContentLine,
				ch: lastLineLength
			};
			console.debug(`BlockUtilityPlugin: Selection head: Line ${headPos.line}, Ch ${headPos.ch}`);

			console.debug("BlockUtilityPlugin: Setting editor selection.");
			editor.setSelection(anchorPos, headPos);
			console.log(`BlockUtilityPlugin: Successfully selected content of ${blockLabel}.`);

		} catch (error) {
			console.error('BlockUtilityPlugin: Error during content selection:', error);
			new Notice(`Block Utility: Error selecting content within ${blockLabel}.`);
		}
	}
}
