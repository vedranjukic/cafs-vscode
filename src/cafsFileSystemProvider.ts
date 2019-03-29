import * as vscode from 'vscode'
import { basename, dirname } from 'path'
import axios from 'axios'
import * as request from 'request-promise-native'
import * as streamifier from 'streamifier'

export interface CAFSNode {
	resource: vscode.Uri
	iconClass?: string
	isDirectory: boolean
	id: string
	connectionId: string
	connectionName: string
	path: string
	name: string
	parent?: CAFSNode
}

export class CAFS implements vscode.FileSystemProvider {
	public onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>
	public onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()

	public nodes: Map<string, CAFSNode> = new Map<string, CAFSNode>()

	constructor() {
		this.onDidChangeFile = this.onDidChangeFileEmitter.event
	}
/*
	//	TODO: implement to allow open/save using chunks 
	public open?(resource: vscode.Uri): number | Thenable<number> {
		throw new Error("Method not implemented.");
	}	
	public close?(fd: number): void | Thenable<void> {
		throw new Error("Method not implemented.");
	}
	public read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number> {
		throw new Error("Method not implemented.");
	}
	public write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number> {
		throw new Error("Method not implemented.");
	}
*/
	public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		throw new Error("Method not implemented.")
	}
	public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		if (uri.path === '/') {
			return {
				ctime: 0,
				mtime: 0,
				size: 0,
				type: vscode.FileType.Directory
			} as vscode.FileStat
		}
		if (uri.path.split('/').length === 2) {
			return {
				ctime: 0,
				mtime: 0,
				size: 0,
				type: vscode.FileType.Directory
			} as vscode.FileStat
		}
		//
		//	todo provide 
		//
		const node = this.nodes.get(uri.toString())
		return {
			ctime: 0,
			mtime: 0,
			size: 0,
			type: node.isDirectory ? vscode.FileType.Directory : vscode.FileType.File
		} as vscode.FileStat
	}
	public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const projectId = vscode.workspace.getConfiguration('cafs').get('projectId')
		//
		//	Return connection list
		//
		if (uri.path === '/') {
			const response = await axios.get(`https://codeanywhere.com/api/ca6/connection/list?projectId=${projectId}&token=${token}`)
			const nodes = response.data.map(connection => ({
				resource: vscode.Uri.parse(`cafs:/${connection.name}`),
				isDirectory: true,
				iconClass: connection.type,
				connectionId: connection.id,
				connectionName: connection.name,
				path: '',
				name: connection.name,
				id: connection.id
			} as CAFSNode)) as CAFSNode[]
			nodes.forEach(node => {
				this.nodes.set(node.resource.toString(), node)
			})
			const sorted = this.sort(nodes)
			const files = sorted.reduce((files: [string, vscode.FileType][], node) => {
				files.push([node.name, vscode.FileType.Directory])
				return files
			}, [])
			return files
		}
		
		//
		//	Return folder list
		//
		const node = this.nodes.get(uri.toString())
		const response = await axios.get(`https://fs.codeanywhere.com/folder/list?id=${node.connectionId}c&connectionId=${node.connectionId}&path=${node.path}&token=${token}`)
		const nodes = response.data.map(file => ({
			resource: node.path ? vscode.Uri.parse(`cafs:/${node.connectionName}/${node.path}/${file.name}`) : vscode.Uri.parse(`cafs:/${node.connectionName}/${file.name}`),
			isDirectory: file.type === 'folder',
			iconClass: null,
			parent: node,
			path: node.path ? `${node.path}/${file.name}` : file.name,
			name: file.name,
			connectionId: node.connectionId,
			connectionName: node.connectionName,
			id: file.id
		} as CAFSNode)) as CAFSNode[]
		nodes.forEach(node => {
			this.nodes.set(node.resource.toString(), node)
		})
		const sorted = this.sort(nodes)
		const files = sorted.reduce((files: [string, vscode.FileType][], node) => {
			files.push([node.name, node.isDirectory ? vscode.FileType.Directory : vscode.FileType.File])
			return files
		}, [])
		return files
	}
	public async createDirectory(uri: vscode.Uri): Promise<void> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const parentUri = dirname(uri.toString())
		const name = basename(uri.toString())
		const node = this.nodes.get(parentUri)
		const path = node.path

		await axios.post(`https://fs.codeanywhere.com/folder/create`, {
			id: node.id,
			connectionId: node.connectionId,
			path,
			name,
			token
		})
		this.nodes.set(uri.toString(), {
			connectionId: node.connectionId,
			connectionName: node.connectionName,
			id: '',
			isDirectory: true,
			name,
			parent: node,
			path: path + '/' + name,
			resource: uri
		})
	}
	public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const node = this.nodes.get(uri.toString())
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const response = await axios.post(`https://fs.codeanywhere.com/file/open`, {
			id: node.id,
			connectionId: node.connectionId,
			path: node.path,
			encoding: 'UTF-8',
			token
		})
		return Buffer.from(response.data)
	}
	public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		if (options.create && !this.nodes.get(uri.toString())) {
			const parentUri = dirname(uri.toString())
			const parentNode = this.nodes.get(parentUri)
			const name = basename(uri.toString())
			const path = parentNode.path
			await axios.post('https://fs.codeanywhere.com/file/create', {
				id: parentNode.id,
				connectionId: parentNode.connectionId,
				path: parentNode.path,
				name,
				token
			})
			this.nodes.set(uri.toString(), {
				connectionId: parentNode.connectionId,
				connectionName: parentNode.connectionName,
				id: '',
				isDirectory: false,
				name: name,
				path: path + '/' + name,
				resource: uri
			})
			return
		}
		const node = this.nodes.get(uri.toString())
		const stream = streamifier.createReadStream(Buffer.from(content.toString()))
		await request.post({
			url: 'https://fs.codeanywhere.com/file/save',
			formData: {
				token,
				id: node.id,
				connectionId: node.connectionId,
				path: node.path,
				content: {
					value: stream,
					options: {
						knownLength: content.byteLength,
						filename: 'content',
						contentType: 'application/octet-stream'
					}
				}
			}
		})
	}
	public async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const node = this.nodes.get(uri.toString())
		await axios.post(`https://fs.codeanywhere.com/file/delete`, {
			id: node.id,
			connectionId: node.connectionId,
			path: node.path,
			token
		})
	}
	public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const nodeOld = this.nodes.get(oldUri.toString())
		const nodeNew = this.nodes.get(newUri.toString())
		await axios.post(`https://fs.codeanywhere.com/file/move`, {
			srcId: nodeOld.id,
			srcConnectionId: nodeOld.connectionId,
			srcPath: nodeOld.path,
			destId: nodeNew.id,
			destConnectionId: nodeNew.connectionId,
			destPath: nodeNew.path,
			overwrite: options.overwrite,
			token
		})
	}
	public async copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		const token = vscode.workspace.getConfiguration('cafs').get('token')
		const nodeSource = this.nodes.get(source.toString())
		const nodeDestination = this.nodes.get(destination.toString())
		await axios.post(`https://fs.codeanywhere.com/file/delete`, {
			srcId: nodeSource.id,
			srcConnectionId: nodeSource.connectionId,
			srcPath: nodeSource.path,
			destId: nodeDestination.id,
			destConnectionId: nodeDestination.connectionId,
			destPath: nodeDestination.path,
			overwrite: options.overwrite,
			token
		})
	}

	private sort(nodes: CAFSNode[]): CAFSNode[] {
		return nodes.sort((n1, n2) => {
			if (n1.isDirectory && !n2.isDirectory) {
				return -1
			}

			if (!n1.isDirectory && n2.isDirectory) {
				return 1
			}

			return basename(n1.resource.fsPath).localeCompare(basename(n2.resource.fsPath))
		})
	}
}