import * as vscode from 'vscode'
import { CAFS } from './cafsFileSystemProvider'

export class CAFSFileExplorer {
	constructor(context: vscode.ExtensionContext) {
		const cafs = new CAFS()
		context.subscriptions.push(vscode.workspace.registerFileSystemProvider('cafs', cafs, { isCaseSensitive: true }))
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('cafs:/'), name: "Remote Connections" })
	}
}