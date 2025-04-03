import { App, Editor, EditorPosition, MarkdownView, Notice, Plugin } from 'obsidian';

/**
 * @interface BlockInfo
 * @description Defines the structure for returning information about a found block.
 *
 * @property {boolean} success - Indicates whether a valid block containing the cursor was successfully found.
 * @property {number} startLine - The line number (0-indexed) of the opening delimiter (``` or $$). -1 if not found or not applicable.
 * @property {number} endLine - The line number (0-indexed) of the closing delimiter (``` or $$). -1 if not found or not applicable.
 * @property {'Code' | 'LaTeX' | null} blockType - The type of block identified ('Code' or 'LaTeX'). null if no block was found.
 * @property {string} [errorMessage] - An optional user-friendly message explaining why the operation failed (e.g., cursor outside block, delimiter mismatch). Included when success is false.
 */
interface BlockInfo {
	success: boolean;
	startLine: number;
	endLine: number;
	blockType: 'Code' | 'LaTeX' | null;
	errorMessage?: string;
}

/**
 * @class BlockUtilityPlugin
 * @extends Plugin
 * @description The main class for the Obsidian Block Utility plugin. Handles loading commands
 * for copying and selecting content within code and LaTeX blocks.
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
				name: 'Copy block under cursor (Code or LaTeX)',
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
				name: 'Select block under cursor (Code or LaTeX)',
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

		} catch (error) {
			// Catch potential errors during command registration itself
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
	 * @description Locates the boundaries (start and end lines) and type of a fenced code block (```)
	 * or a LaTeX block ($$) that contains the editor's current cursor position.
	 * @param {Editor} editor - The Obsidian Editor instance representing the current active editor.
	 * Provides access to cursor position and document content.
	 * Assumes the editor instance is valid and available.
	 * @returns {BlockInfo} An object containing:
	 * - `success`: boolean indicating if a valid block containing the cursor was found.
	 * - `startLine`: number, the 0-indexed line of the opening delimiter, or -1.
	 * - `endLine`: number, the 0-indexed line of the closing delimiter, or -1.
	 * - `blockType`: 'Code' | 'LaTeX' | null, the type of block found.
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
				// Precondition check
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

		let startLineNum = -1;
		let endLineNum = -1;
		let startDelimiter: '```' | '$$' | null = null;
		let endDelimiter: '```' | '$$' | null = null;
		let blockType: 'Code' | 'LaTeX' | null = null;

		// Search backwards from the cursor line to find the start delimiter.
		console.debug(`BlockUtilityPlugin: Searching backwards for start delimiter from line ${currentLineNum}.`);
		for (let i = currentLineNum; i >= 0; i--) {
			let line: string;
			try {
				line = editor.getLine(i).trim();
			} catch (err) {
				console.warn(`BlockUtilityPlugin: Error reading line ${i} during backward search:`, err);
				continue; // Skip problematic line if reading fails
			}

			// Check for code block start (allows language specifier like ```python)
			if (line.startsWith('```')) {
				startLineNum = i;
				startDelimiter = '```';
				endDelimiter = '```'; // End delimiter must match exactly '```'
				blockType = 'Code';
				console.debug(`BlockUtilityPlugin: Found potential Code block start ' ${startDelimiter}' at line ${i}.`);
				break; // Found the start, stop searching backwards
			}
			// Check for LaTeX block start (must be exactly $$ on the line)
			else if (line === '$$') {
				startLineNum = i;
				startDelimiter = '$$';
				endDelimiter = '$$';
				blockType = 'LaTeX';
				console.debug(`BlockUtilityPlugin: Found potential LaTeX block start '${startDelimiter}' at line ${i}.`);
				break; // Found the start, stop searching backwards
			}
		}

		// If no start delimiter was found above or at the cursor line, the cursor isn't in a known block.
		if (startLineNum === -1 || !blockType || !endDelimiter) {
			console.debug("BlockUtilityPlugin: No start delimiter found enclosing the cursor.");
			return { success: false, startLine: -1, endLine: -1, blockType: null, errorMessage: "Cursor is not inside a recognized block (Code ``` or LaTeX $$)." };
		}

		// Search forwards from *after* the start line to find the matching end delimiter.
		console.debug(`BlockUtilityPlugin: Searching forwards for end delimiter '${endDelimiter}' from line ${startLineNum + 1}.`);
		for (let i = startLineNum + 1; i < totalLines; i++) {
			let line: string;
			try {
				line = editor.getLine(i).trim();
			} catch (err) {
				console.warn(`BlockUtilityPlugin: Error reading line ${i} during forward search:`, err);
				continue; // Skip problematic line
			}

			// Check if the line exactly matches the required end delimiter.
			if (line === endDelimiter) {
				endLineNum = i;
				console.debug(`BlockUtilityPlugin: Found matching end delimiter '${endDelimiter}' at line ${i}.`);
				break; // Found the end delimiter
			}
		}

		// If no matching end delimiter was found after the start delimiter, the block is incomplete or invalid.
		if (endLineNum === -1) {
			console.debug(`BlockUtilityPlugin: No matching end delimiter '${endDelimiter}' found after line ${startLineNum}.`);
			return { success: false, startLine: startLineNum, endLine: -1, blockType: blockType, errorMessage: `Could not find the closing ${endDelimiter} for this ${blockType} block.` };
		}

		// Final check: Ensure the cursor line is strictly between the start and end delimiter lines.
		// It cannot be on the delimiter lines themselves for content operations.
		if (currentLineNum <= startLineNum || currentLineNum >= endLineNum) {
			console.debug(`BlockUtilityPlugin: Cursor at line ${currentLineNum} is not strictly between start line ${startLineNum} and end line ${endLineNum}.`);
			return { success: false, startLine: startLineNum, endLine: endLineNum, blockType: blockType, errorMessage: `Cursor is not inside this ${blockType} block's content area.` };
		}

		// All checks passed, the cursor is inside a valid, recognized block.
		console.debug(`BlockUtilityPlugin: Successfully identified ${blockType} block from line ${startLineNum} to ${endLineNum}. Cursor is within content.`);
		return { success: true, startLine: startLineNum, endLine: endLineNum, blockType: blockType };
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

		// Handle failure reported by findBlockBoundaries
		if (!blockInfo.success) {
			console.warn(`BlockUtilityPlugin: Failed to find block boundaries for copy: ${blockInfo.errorMessage}`);
			new Notice(blockInfo.errorMessage || "Block Utility: Could not identify block for copying.");
			return;
		}

		console.debug(`BlockUtilityPlugin: Extracting content for ${blockInfo.blockType} block (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
		let blockContent = "";
		try {
			// Iterate through the lines *between* the delimiters.
			for (let i = blockInfo.startLine + 1; i < blockInfo.endLine; i++) {
				// Append the line content plus a newline character.
				blockContent += editor.getLine(i) + '\n';
			}
			// Remove the potentially extraneous newline added after the last line.
			if (blockContent.length > 0) {
				blockContent = blockContent.slice(0, -1);
			}
			console.debug(`BlockUtilityPlugin: Extracted content length: ${blockContent.length}`);
		} catch (error) {
			console.error("BlockUtilityPlugin: Error during content extraction:", error);
			new Notice(`Block Utility: Error extracting content from ${blockInfo.blockType} block.`);
			return;
		}


		// Use the asynchronous Clipboard API to write the text.
		console.debug("BlockUtilityPlugin: Attempting to write content to clipboard.");
		navigator.clipboard.writeText(blockContent).then(() => {
			// Success feedback
			console.log(`BlockUtilityPlugin: Successfully copied ${blockInfo.blockType} block content to clipboard.`);
			new Notice(`${blockInfo.blockType} block content copied!`);
		}).catch(err => {
			// Error feedback
			console.error(`BlockUtilityPlugin: Failed to copy ${blockInfo.blockType} block content to clipboard: `, err);
			new Notice(`Block Utility: Error copying ${blockInfo.blockType} block content. See console.`);
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

		// Handle failure reported by findBlockBoundaries
		if (!blockInfo.success) {
			console.warn(`BlockUtilityPlugin: Failed to find block boundaries for select: ${blockInfo.errorMessage}`);
			new Notice(blockInfo.errorMessage || "Block Utility: Could not identify block for selection.");
			return;
		}

		console.debug(`BlockUtilityPlugin: Calculating selection range for ${blockInfo.blockType} block (lines ${blockInfo.startLine + 1} to ${blockInfo.endLine - 1}).`);
		// Determine the first and last lines of the actual content.
		const firstContentLine = blockInfo.startLine + 1;
		const lastContentLine = blockInfo.endLine - 1;

		try {
			// Handle the edge case where the block is empty (no lines between delimiters).
			if (firstContentLine >= blockInfo.endLine) {
				console.debug("BlockUtilityPlugin: Block is empty. Placing cursor at start of content area.");
				// Position the cursor at the beginning of the line immediately after the start delimiter.
				const cursorPosition: EditorPosition = {
					line: firstContentLine,
					ch: 0 // Character position 0
				};
				editor.setSelection(cursorPosition, cursorPosition); // Set start and end the same to place cursor
				// Optional: Notify user block is empty
				// new Notice(`${blockInfo.blockType} block is empty.`);
				return; // Nothing more to do for an empty block
			}

			// Define the anchor (start) and head (end) positions for the selection.
			const anchorPos: EditorPosition = {
				line: firstContentLine,
				ch: 0 // Character 0: Start at the very beginning of the first content line.
			};
			console.debug(`BlockUtilityPlugin: Selection anchor: Line ${anchorPos.line}, Ch ${anchorPos.ch}`);

			// Get the length of the last content line to select up to its end.
			const lastLineLength = editor.getLine(lastContentLine).length;
			const headPos: EditorPosition = {
				line: lastContentLine,
				ch: lastLineLength // Character 'length': Selects up to the end of the last content line.
			};
			console.debug(`BlockUtilityPlugin: Selection head: Line ${headPos.line}, Ch ${headPos.ch}`);


			// Set the editor's selection range.
			console.debug("BlockUtilityPlugin: Setting editor selection.");
			editor.setSelection(anchorPos, headPos);
			console.log(`BlockUtilityPlugin: Successfully selected content of ${blockInfo.blockType} block.`);

			// Optional: Provide subtle feedback that selection was successful.
			// new Notice(`${blockInfo.blockType} block content selected.`);

		} catch (error) {
			// Catch errors during line reading or selection setting.
			console.error("BlockUtilityPlugin: Error during content selection:", error);
			new Notice(`Block Utility: Error selecting content within ${blockInfo.blockType} block.`);
		}
	}
}