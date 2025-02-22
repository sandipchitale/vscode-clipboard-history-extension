'use strict';
import {ExtensionContext, workspace, TextEditor, TextDocument, Range, Position, QuickPickOptions, QuickPickItem, window, commands, Selection} from 'vscode';

export function activate(context: ExtensionContext) {
    let config = workspace.getConfiguration('clipboard');
    let clipboardSize = config.get('size', 12);
    var clipboardArray = [];
    var disposableArray = [];

    // Used by cyclePaste command
    let lastPaste = -1;
    let timeoutAfterCyclePaste;

    // Save all values that are copied to clipboard in array
    function addClipboardItem(editor: TextEditor) {
        let doc: TextDocument = editor.document;
        let sels = editor.selections;
        for (var i = 0; i < sels.length; i++) {
            let line = sels[i].active.line;
            let text = doc.getText(new Range(sels[i].start, sels[i].end));
            if (sels[i].isEmpty) { // Get full line if no selection highlighted
                let lineStart = new Position(line, 0);
                let lineEnd = new Position(line, doc.lineAt(line).range.end.character)
                text = doc.getText(new Range(lineStart, lineEnd));
            }
            if (clipboardArray.indexOf(text) === -1) {
                clipboardArray.push(text);
                if (clipboardArray.length > clipboardSize) {
                    clipboardArray.shift();
                }
            }
        }
    }

    function makeQuickPick(clipboardArray, toBeRemoved?: boolean) {
        // Create quick pick clipboard items
        var options: QuickPickOptions = {placeHolder: "Clipboard", matchOnDescription: true, matchOnDetail: true};
        var copiedItems: QuickPickItem[] = [];
        // Add clear all history option if making removal quick pick
        if (toBeRemoved && clipboardArray.length > 0) { copiedItems.push({ label: "", description: "Clear All History" }); }
        // List clipboard items in order of recency
        for (var i = 0; i < clipboardArray.length; i++) {
            copiedItems.unshift({label:"", description:clipboardArray[i]});
        }
        return copiedItems;
    }

    function removeQuickPickItem(clipboardArray, item: QuickPickItem) {
        let index = clipboardArray.indexOf(item.description)
        if (index > -1) { clipboardArray.splice(index, 1); }
        return clipboardArray;
    }

    function editQuickPickItem(clipboardArray, item: QuickPickItem, text: string) {
        let index = clipboardArray.indexOf(item.description);
        if (index > -1) {clipboardArray[index] = text; }
        return clipboardArray;
    }

    function pasteSelected(item: QuickPickItem) {
        let activeEditor
        if (activeEditor = window.activeTextEditor) {    // Don't run if no active text editor instance available
            let text = item.description;
            pasteText(text);
        }
    }

    function pasteText(text: string) {
        let activeEditor
        if (activeEditor = window.activeTextEditor) {    // Don't run if no active text editor instance available
            activeEditor.edit(function (textInserter) {
                textInserter.replace(activeEditor.selection, text);
            })
        }
    }

    disposableArray.push(commands.registerCommand('clipboard.copy', () => {
        addClipboardItem(window.activeTextEditor);
        commands.executeCommand("editor.action.clipboardCopyAction");
    }));

    disposableArray.push(commands.registerCommand('clipboard.cut', () => {
        addClipboardItem(window.activeTextEditor);
        commands.executeCommand("editor.action.clipboardCutAction");
    }));


    disposableArray.push(commands.registerCommand('clipboard.paste', () => {
        commands.executeCommand("editor.action.clipboardPasteAction");
    }));

    disposableArray.push(commands.registerCommand('clipboard.cyclePaste', () => {
        const now = new Date().valueOf();
        if (clipboardArray.length == 0) {
            // Nothing in clipboard history.
            commands.executeCommand("editor.action.clipboardPasteAction");
        } else {
            // First cycle paste
            if (lastPaste == -1) {
                // Record timestamp
                lastPaste = now;
                // paste first item.
                pasteText(clipboardArray[0]);
                // rotate by 1
                if (clipboardArray.length > 0) {
                    clipboardArray.push(clipboardArray.shift())
                }
            } else {
                if (now - lastPaste < 1000) {
                    // Cycle paste the next item within 1 second
                    lastPaste = now;
                    // paste first item.
                    pasteText(clipboardArray[0]);
                    // rotate by 1
                    if (clipboardArray.length > 0) {
                        clipboardArray.push(clipboardArray.shift())
                    }
                } else {
                    lastPaste = -1;
                    pasteText(clipboardArray[0]);
                }
            }
            // Clear outstanding clear selection timeout
            if (timeoutAfterCyclePaste) {
                clearTimeout(timeoutAfterCyclePaste);
            }
            timeoutAfterCyclePaste = setTimeout(function() {
                // CLear selection
                let activeEditor
                if (activeEditor = window.activeTextEditor) {    // Don't run if no active text editor instance available
                    activeEditor.selection = new Selection(activeEditor.selection.end, activeEditor.selection.end);
                }
                // Clear clear selection timeout
                if (timeoutAfterCyclePaste) {
                    clearTimeout(timeoutAfterCyclePaste);
                }
            }, 1000);
        }
    }));

    disposableArray.push(commands.registerCommand('clipboard.pasteFromClipboard', () => {
        if (clipboardArray.length == 0) {
            window.setStatusBarMessage("No items in clipboard");
            window.showQuickPick(makeQuickPick(clipboardArray));
            return;
        } else {
            window.showQuickPick(makeQuickPick(clipboardArray)).then((item) => { pasteSelected(item); });
        }
    }));

    disposableArray.push(commands.registerCommand('clipboard.removeFromClipboard', () => {
        if (clipboardArray.length == 0) {
            window.setStatusBarMessage("No items in clipboard");
            window.showQuickPick(makeQuickPick(clipboardArray));
            return;
        } else {
            let currentQuickPick = makeQuickPick(clipboardArray, true);
            window.showQuickPick(currentQuickPick).then((item)=>{
                if (item.description === "Clear All History") {
                    clipboardArray = [];    // Clear clipboard history if selected
                    window.setStatusBarMessage("Clipboard history cleared");
                    return;
                } else {
                    let removedQuickPick = makeQuickPick(removeQuickPickItem(clipboardArray, item), true);
                    window.setStatusBarMessage("Removed from clipboard");
                }
            });
        }
    }));

    disposableArray.push(commands.registerCommand('clipboard.editClipboard', () => {
        if (clipboardArray.length == 0) {
            window.setStatusBarMessage("No items in clipboard");
            return;
        } else {
            let currentQuickPick = makeQuickPick(clipboardArray);
            window.showQuickPick(currentQuickPick).then((item) => {
                let text = item.description;
                window.showInputBox({ value: item.description.toString() })
                    .then(val => {
                        let editedQuickPick = makeQuickPick(editQuickPickItem(clipboardArray, item, val));
                        window.setStatusBarMessage("Edited clipboard item");
                    });
            })
        }
    }));

    context.subscriptions.concat(disposableArray);
}

// Called when extension is deactivated
export function deactivate() {
}
