import { App, Editor, EditorPosition, MarkdownView, Notice, Plugin } from 'obsidian';

/**
 * @interface BlockInfo
 * @description Defines the structure for returning information about a found block.
 *
 * @property {boolean} success - Indicates whether a valid block containing the cursor was successfully found.
 * @property {number} startLine - The line number (0-indexed) of the opening delimiter (``` / $$ / :::box-info / :::tag-info). -1 if not found or not applicable.
 * @property {number} endLine - The line number (0-indexed) of the closing delimiter (``` / $$ / :::end-box-info / :::end-tag-info). -1 if not found or not applicable.
 * @property {'Code' | 'LaTeX' | 'BoxInfo' | 'TagInfo' | null} blockType - The type of block identified.
 * @property {string} [errorMessage] - An optional user-friendly message explaining why the operation failed (e.g., cursor outside block, delimiter mismatch). Included when success is false.
 */
type BlockType = 'Code' | 'LaTeX' | 'BoxInfo' | 'TagInfo' | 'InlineLaTeX';

type BlockDelimiter =
	'```'
	| '$$'
	| ':::box-info'
	| ':::end-box-info'
	| ':::tag-info'
	| ':::end-tag-info'
	| ':::latex'
	| ':::end-latex';

const BLOCK_LABELS: Record<BlockType, string> = {
	Code: 'Code',
	LaTeX: 'LaTeX',
	BoxInfo: 'Box Info',
	TagInfo: 'Tag Info',
	InlineLaTeX: 'LaTeX',
};

const getBlockLabel = (blockType: BlockType | null): string => {
	if (!blockType) {
		return 'Block';
	}
	return BLOCK_LABELS[blockType] ?? 'Block';
};

interface BlockInfo {
	success: boolean;
	startLine: number;
	endLine: number;
	blockType: BlockType | null;
	startCh?: number;
	endCh?: number;
	errorMessage?: string;
}

/**
 * @class BlockUtilityPlugin
 * @extends Plugin
 * @description The main class for the Obsidian Block Utility plugin. Handles loading commands
 * for copying and selecting content within code, LaTeX, and info fence blocks.
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
			// Command to COPY block content
			this.addCommand({
				id: 'copy-current-block',
				name: 'Copy block under cursor (Code/LaTeX/Info)',
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

			// Command to SELECT block content
			this.addCommand({
				id: 'select-current-block',
				name: 'Select block under cursor (Code/LaTeX/Info)',
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
				name: 'Wrap selection with :::box-info block',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-box-info' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::box-info', ':::end-box-info', BLOCK_LABELS.BoxInfo);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with box-info block:", error);
						new Notice("Block Utility: Failed to wrap selection with :::box-info block. See console.");
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-box-info' command.");

			// Command to WRAP selection with :::tag-info fence
			this.addCommand({
				id: 'wrap-selection-tag-info',
				name: 'Wrap selection with :::tag-info block',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-tag-info' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::tag-info', ':::end-tag-info', BLOCK_LABELS.TagInfo);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with tag-info block:", error);
						new Notice("Block Utility: Failed to wrap selection with :::tag-info block. See console.");
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-tag-info' command.");

			// Command to WRAP selection with :::latex fence
			this.addCommand({
				id: 'wrap-selection-latex-fence',
				name: 'Wrap selection with :::latex block',
				editorCallback: (editor: Editor) => {
					console.debug("BlockUtilityPlugin: 'wrap-selection-latex-fence' command triggered.");
					try {
						this.wrapSelectionWithFence(editor, ':::latex', ':::end-latex', BLOCK_LABELS.LaTeX);
					} catch (error) {
						console.error("BlockUtilityPlugin: Error wrapping selection with latex block:", error);
						new Notice("Block Utility: Failed to wrap selection with :::latex block. See console.");
					}
				},
			});
			console.log("BlockUtilityPlugin: Registered 'wrap-selection-latex-fence' command.");

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
	 * @description Locates the boundaries (start and end lines) and type of a fenced code block (```),
	 * LaTeX block ($$), or info fence block (:::box-info / :::tag-info) that contains the editor's
	 * current cursor position.
	 * It now skips indented (nested) fence markers to only use the root fence.
	 * @param {Editor} editor - The Obsidian Editor instance representing the current active editor.
	 * Provides access to cursor position and document content.
	 * Assumes the editor instance is valid and available.
	 * @returns {BlockInfo} An object containing:
	 * - `success`: boolean indicating if a valid block containing the cursor was found.
	 * - `startLine`: number, the 0-indexed line of the opening delimiter, or -1.
	 * - `endLine`: number, the 0-indexed line of the closing delimiter, or -1.
	 * - `blockType`: 'Code' | 'LaTeX' | 'BoxInfo' | 'TagInfo' | null, the type of block found.
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

		let inlineLaTeXMatch: { start: number; end: number } | null = null;
		try {
			const currentLineText = editor.getLine(currentLineNum);
			inlineLaTeXMatch = this.findInlineLatexRange(currentLineText, cursor.ch);
		} catch (err) {
			console.warn(`BlockUtilityPlugin: Error reading line ${currentLineNum} for inline LaTeX detection:`, err);
		}

		if (inlineLaTeXMatch) {
			console.debug(`BlockUtilityPlugin: Inline LaTeX detected on line ${currentLineNum} spanning ch ${inlineLaTeXMatch.start} to ${inlineLaTeXMatch.end}.`);
			return {
				success: true,
				startLine: currentLineNum,
				endLine: currentLineNum,
				blockType: 'InlineLaTeX',
				startCh: inlineLaTeXMatch.start,
				endCh: inlineLaTeXMatch.end,
			};
		}

		let startLineNum = -1;
		let endLineNum = -1;
		let startDelimiter: BlockDelimiter | null = null;
		let endDelimiter: BlockDelimiter | null = null;
		let blockIndent: string | null = null;
		let blockType: BlockType | null = null;

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

			// Check for Code block start: allows optional indentation and language specifier.
			if (trimmedLine.startsWith('```')) {
				startLineNum = i;
				startDelimiter = '```';
				endDelimiter = '```';
				blockType = 'Code';
				blockIndent = leadingWhitespace;
				console.debug(`BlockUtilityPlugin: Found potential root Code block start '${startDelimiter}' at line ${i}.`);
				break;
			}
			// Check for LaTeX block start: must not be indented.
			else if (trimmedLine === '$$') {
				startLineNum = i;
				startDelimiter = '$$';
				endDelimiter = '$$';
				blockType = 'LaTeX';
				blockIndent = leadingWhitespace;
				console.debug(`BlockUtilityPlugin: Found potential root LaTeX block start '${startDelimiter}' at line ${i}.`);
				break;
			} else if (normalizedLine.startsWith(':::box-info')) {
				startLineNum = i;
				startDelimiter = ':::box-info';
				endDelimiter = ':::end-box-info';
				blockType = 'BoxInfo';
				blockIndent = leadingWhitespace;
				console.debug(`BlockUtilityPlugin: Found potential root Box Info block start at line ${i}.`);
				break;
			} else if (normalizedLine.startsWith(':::tag-info')) {
				startLineNum = i;
				startDelimiter = ':::tag-info';
				endDelimiter = ':::end-tag-info';
				blockType = 'TagInfo';
				blockIndent = leadingWhitespace;
				console.debug(`BlockUtilityPlugin: Found potential root Tag Info block start at line ${i}.`);
				break;
			} else if (normalizedLine.startsWith(':::latex')) {
				startLineNum = i;
				startDelimiter = ':::latex';
				endDelimiter = ':::end-latex';
				blockType = 'LaTeX';
				blockIndent = leadingWhitespace;
				console.debug(`BlockUtilityPlugin: Found potential root LaTeX fence block start at line ${i}.`);
				break;
			}
		}

		if (startLineNum === -1 || !blockType || !endDelimiter) {
			console.debug("BlockUtilityPlugin: No root start delimiter found enclosing the cursor.");
			return {
				success: false,
				startLine: -1,
				endLine: -1,
				blockType: null,
				errorMessage: "Cursor is not inside a recognized block (Code ``` , LaTeX $$ or :::latex, :::box-info, :::tag-info).",
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

			const normalizedLine = trimmedLine.toLowerCase();
			const normalizedEnd = endDelimiter.toLowerCase();
			const leadingWhitespaceLength = originalLine.length - trimmedLine.length;
			const leadingWhitespace = leadingWhitespaceLength > 0 ? originalLine.slice(0, leadingWhitespaceLength) : '';
			const indentMatches = blockIndent === null ? leadingWhitespaceLength === 0 : leadingWhitespace === blockIndent;

			if (!indentMatches) {
				continue;
			}

			const isCodeFence = endDelimiter === '```';
			const isDollarFence = endDelimiter === '$$';

			if (
				(isCodeFence && trimmedLine.startsWith('```') && trimmedLine.replace(/^```/, '').trim().length === 0) ||
				(isDollarFence && trimmedLine === '$$') ||
				(!isCodeFence && !isDollarFence && normalizedLine === normalizedEnd)
			) {
				endLineNum = i;
				console.debug(`BlockUtilityPlugin: Found matching root end delimiter '${endDelimiter}' at line ${i}.`);
				break;
			}
		}

		if (endLineNum === -1) {
			console.debug(`BlockUtilityPlugin: No matching root end delimiter '${endDelimiter}' found after line ${startLineNum}.`);
			return { success: false, startLine: startLineNum, endLine: -1, blockType: blockType, errorMessage: `Could not find the closing ${endDelimiter} for this ${blockType} block.` };
		}

		// Ensure the cursor line is strictly between the start and end delimiter lines.
		if (currentLineNum <= startLineNum || currentLineNum >= endLineNum) {
			console.debug(`BlockUtilityPlugin: Cursor at line ${currentLineNum} is not strictly between start line ${startLineNum} and end line ${endLineNum}.`);
			return { success: false, startLine: startLineNum, endLine: endLineNum, blockType: blockType, errorMessage: `Cursor is not inside this ${blockType} block's content area.` };
		}

		console.debug(`BlockUtilityPlugin: Successfully identified ${blockType} block from line ${startLineNum} to ${endLineNum}. Cursor is within content.`);
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

		new Notice(`${blockLabel} block inserted.`);
	}

	private findInlineLatexRange(lineText: string, cursorCh: number): { start: number; end: number } | null {
		if (!lineText.includes('$$')) {
			return null;
		}

		const inlinePattern = /(?<!\\)\$\$(.*?)(?<!\\)\$\$/g;
		for (const match of lineText.matchAll(inlinePattern)) {
			const matchIndex = match.index;
			if (matchIndex === undefined) {
				continue;
			}
			const matchText = match[0];
			const startDelimiterEnd = matchIndex + 2;
			const endDelimiterStart = matchIndex + matchText.length - 2;

			if (startDelimiterEnd > endDelimiterStart) {
				continue;
			}

			if (cursorCh >= startDelimiterEnd && cursorCh <= endDelimiterStart) {
				return { start: startDelimiterEnd, end: endDelimiterStart };
			}
		}

		return null;
	}

	/**
	 * @function copyBlockUnderCursor
	 * @description Finds the block containing the cursor and copies its content (excluding delimiters)
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
			new Notice(blockInfo.errorMessage || "Block Utility: Could not identify block for copying.");
			return;
		}

		const blockLabel = getBlockLabel(blockInfo.blockType);

		let blockContent = "";

		try {
			if (
				blockInfo.blockType === 'InlineLaTeX' &&
				typeof blockInfo.startCh === 'number' &&
				typeof blockInfo.endCh === 'number'
			) {
				console.debug(`BlockUtilityPlugin: Extracting inline LaTeX content on line ${blockInfo.startLine} between ch ${blockInfo.startCh} and ${blockInfo.endCh}.`);
				const lineText = editor.getLine(blockInfo.startLine);
				blockContent = lineText.slice(blockInfo.startCh, blockInfo.endCh);
			} else {
				console.debug(`BlockUtilityPlugin: Extracting content for ${blockLabel} block (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
				for (let i = blockInfo.startLine + 1; i < blockInfo.endLine; i++) {
					blockContent += editor.getLine(i) + '\n';
				}
				if (blockContent.length > 0) {
					blockContent = blockContent.slice(0, -1);
				}
			}
			console.debug(`BlockUtilityPlugin: Extracted content length: ${blockContent.length}`);
		} catch (error) {
			console.error("BlockUtilityPlugin: Error during content extraction:", error);
			new Notice(`Block Utility: Error extracting content from ${blockLabel} block.`);
			return;
		}

		console.debug("BlockUtilityPlugin: Attempting to write content to clipboard.");
		navigator.clipboard.writeText(blockContent).then(() => {
			console.log(`BlockUtilityPlugin: Successfully copied ${blockLabel} block content to clipboard.`);
			new Notice(`${blockLabel} block content copied!`);
		}).catch(err => {
			console.error(`BlockUtilityPlugin: Failed to copy ${blockLabel} block content to clipboard: `, err);
			new Notice(`Block Utility: Error copying ${blockLabel} block content. See console.`);
		});
	}

	/**
	 * @function selectBlockUnderCursor
	 * @description Finds the block containing the cursor and selects its content (excluding delimiters)
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
			new Notice(blockInfo.errorMessage || "Block Utility: Could not identify block for selection.");
			return;
		}

		const blockLabel = getBlockLabel(blockInfo.blockType);

		if (
			blockInfo.blockType === 'InlineLaTeX' &&
			typeof blockInfo.startCh === 'number' &&
			typeof blockInfo.endCh === 'number'
		) {
			console.debug(`BlockUtilityPlugin: Selecting inline LaTeX content on line ${blockInfo.startLine} between ch ${blockInfo.startCh} and ${blockInfo.endCh}.`);
			const anchorPos: EditorPosition = {
				line: blockInfo.startLine,
				ch: blockInfo.startCh,
			};
			const headPos: EditorPosition = {
				line: blockInfo.endLine,
				ch: blockInfo.endCh,
			};
			editor.setSelection(anchorPos, headPos);
			console.log(`BlockUtilityPlugin: Successfully selected content of ${blockLabel} block.`);
			return;
		}

		console.debug(`BlockUtilityPlugin: Calculating selection range for ${blockLabel} block (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
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
			console.log(`BlockUtilityPlugin: Successfully selected content of ${blockLabel} block.`);

		} catch (error) {
			console.error("BlockUtilityPlugin: Error during content selection:", error);
			new Notice(`Block Utility: Error selecting content within ${blockLabel} block.`);
		}
	}
}
