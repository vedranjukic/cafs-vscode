'use strict';

import * as vscode from 'vscode';

import { CAFSFileExplorer } from './cafsFileExplorer';

export function activate(context: vscode.ExtensionContext) {
	// Samples of `window.createView`
	new CAFSFileExplorer(context);
}