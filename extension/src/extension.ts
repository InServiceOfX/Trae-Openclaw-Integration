import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── MCP Server State ────────────────────────────────────────────────────────

let mcpServer: net.Server | null = null;
let socketPath: string;
let statusBarItem: vscode.StatusBarItem;
let isRunning = false;

// ─── JSON-RPC Types ───────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ─── MCP Tools ───────────────────────────────────────────────────────────────

const TOOLS: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  // Read a file and return its contents
  read_file: async (params: Record<string, unknown>) => {
    const filePath = params.path as string;
    if (!filePath) throw new Error('Missing required parameter: path');
    const absPath = resolveWorkspacePath(filePath);
    try {
      const content = await fs.promises.readFile(absPath, 'utf-8');
      return { path: absPath, content, size: content.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to read file ${absPath}: ${msg}`);
    }
  },

  // Write content to a file
  write_file: async (params: Record<string, unknown>) => {
    const filePath = params.path as string;
    const content = params.content as string;
    if (!filePath) throw new Error('Missing required parameter: path');
    if (content === undefined) throw new Error('Missing required parameter: content');
    const absPath = resolveWorkspacePath(filePath);
    try {
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
      await fs.promises.writeFile(absPath, content, 'utf-8');
      return { path: absPath, written: true, size: content.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to write file ${absPath}: ${msg}`);
    }
  },

  // List directory contents
  list_dir: async (params: Record<string, unknown>) => {
    const dirPath = (params.path as string) || '';
    const absPath = resolveWorkspacePath(dirPath);
    try {
      const entries = await fs.promises.readdir(absPath, { withFileTypes: true });
      return {
        path: absPath,
        entries: entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          isDirectory: e.isDirectory(),
        }))
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to list directory ${absPath}: ${msg}`);
    }
  },

  // Search for text in files (grep)
  search_codebase: async (params: Record<string, unknown>) => {
    const query = params.query as string;
    const filePattern = (params.pattern as string) || '*';
    const cwd = (params.cwd as string) ? resolveWorkspacePath(params.cwd as string) : getFirstWorkspace();
    if (!query) throw new Error('Missing required parameter: query');
    try {
      const { stdout } = await execAsync(
        `grep -rn --include="${filePattern}" "${query.replace(/"/g, '\\"')}" "${cwd}" 2>/dev/null | head -50`,
        { timeout: 10000 }
      );
      const results = stdout.trim().split('\n').filter(Boolean).map(line => {
        const colonIdx = line.indexOf(':');
        const file = line.substring(0, colonIdx);
        const rest = line.substring(colonIdx + 1);
        const colonIdx2 = rest.indexOf(':');
        const lineNum = parseInt(rest.substring(0, colonIdx2), 10);
        const text = rest.substring(colonIdx2 + 1);
        return { file, line: lineNum, text };
      });
      return { query, cwd, results, count: results.length };
    } catch {
      return { query, cwd, results: [], count: 0 };
    }
  },

  // Execute a shell command
  run_command: async (params: Record<string, unknown>) => {
    const command = params.command as string;
    const cwd = (params.cwd as string) ? resolveWorkspacePath(params.cwd as string) : getFirstWorkspace();
    if (!command) throw new Error('Missing required parameter: command');
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: (params.timeout as number) || 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: stdout.substring(0, 50000), stderr: stderr.substring(0, 10000), exitCode: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      return { stdout: (err.stdout || '').substring(0, 50000), stderr: (err.stderr || '').substring(0, 10000), exitCode: err.code || 1 };
    }
  },

  // Open a file in the editor
  open_file: async (params: Record<string, unknown>) => {
    const filePath = params.path as string;
    const line = (params.line as number) || 1;
    if (!filePath) throw new Error('Missing required parameter: path');
    const absPath = resolveWorkspacePath(filePath);
    try {
      const uri = vscode.Uri.file(absPath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
      if (line > 1) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const position = new vscode.Position(line - 1, 0);
          editor.selection = new vscode.Selection(position, position);
          await editor.revealRange(new vscode.Range(position, position));
        }
      }
      return { path: absPath, opened: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to open file ${absPath}: ${msg}`);
    }
  },

  // Get workspace folders
  get_workspace: async () => {
    const folders = vscode.workspace.workspaceFolders || [];
    return {
      folders: folders.map(f => ({ name: f.name, uri: f.uri.fsPath })),
      root: folders.length > 0 ? folders[0].uri.fsPath : null,
    };
  },

  // Get document symbols (code navigation)
  get_symbols: async (params: Record<string, unknown>) => {
    const filePath = (params.path as string) || '';
    const absPath = resolveWorkspacePath(filePath);
    try {
      const uri = vscode.Uri.file(absPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider', uri
      );
      return {
        path: absPath,
        symbols: (symbols || []).map(s => ({
          name: s.name,
          kind: vscode.SymbolKind[s.kind],
          kindNum: s.kind,
          location: {
            file: s.location.uri.fsPath,
            line: s.location.range.start.line + 1,
            endLine: s.location.range.end.line + 1,
          },
          containerName: s.containerName,
        }))
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { path: absPath, symbols: [], error: msg };
    }
  },

  // List currently open editors in TRAE
  get_open_editors: async () => {
    const editors = vscode.window.visibleTextEditors;
    const tabGroups = vscode.window.tabGroups?.all || [];

    // Build a set from visible editors
    const visiblePaths = new Set(editors.map(e => e.document.uri.fsPath));

    // Collect all open tabs (visible or not)
    const allTabs: Array<{ path: string; name: string; active: boolean; visible: boolean; isDirty: boolean; languageId: string }> = [];
    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const fsPath = tab.input.uri.fsPath;
          const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fsPath);
          allTabs.push({
            path: fsPath,
            name: tab.label,
            active: tab.isActive,
            visible: visiblePaths.has(fsPath),
            isDirty: doc?.isDirty ?? false,
            languageId: doc?.languageId ?? 'unknown',
          });
        }
      }
    }

    // Fallback: use visible editors if tab groups API isn't available
    if (allTabs.length === 0) {
      for (const editor of editors) {
        allTabs.push({
          path: editor.document.uri.fsPath,
          name: editor.document.fileName,
          active: editor === vscode.window.activeTextEditor,
          visible: true,
          isDirty: editor.document.isDirty,
          languageId: editor.document.languageId,
        });
      }
    }

    const activeEditor = vscode.window.activeTextEditor;
    return {
      editors: allTabs,
      activeEditor: activeEditor ? {
        path: activeEditor.document.uri.fsPath,
        languageId: activeEditor.document.languageId,
        lineCount: activeEditor.document.lineCount,
        selection: {
          startLine: activeEditor.selection.start.line + 1,
          startChar: activeEditor.selection.start.character,
          endLine: activeEditor.selection.end.line + 1,
          endChar: activeEditor.selection.end.character,
        }
      } : null,
      count: allTabs.length,
    };
  },

  // Run a command in the TRAE integrated terminal
  run_terminal_command: async (params: Record<string, unknown>) => {
    const command = params.command as string;
    const terminalName = (params.terminalName as string) || 'TRAE MCP';
    const waitMs = (params.waitMs as number) || 3000;
    if (!command) throw new Error('Missing required parameter: command');

    // Find or create a terminal with the given name
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
      const cwd = (params.cwd as string) ? resolveWorkspacePath(params.cwd as string) : getFirstWorkspace();
      terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: cwd,
      });
    }

    terminal.show(true); // preserveFocus = true
    terminal.sendText(command);

    // Brief wait to let the command start
    await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 5000)));

    return {
      terminal: terminalName,
      command: command,
      sent: true,
      note: 'Command sent to terminal. Use get_terminal_output to read output, or run_command for programmatic execution with stdout capture.',
    };
  },

  // Get the last output lines from the TRAE output channel / terminal
  // Note: VS Code does not expose terminal stdout directly, so this reads
  // from the extension's own output channel log or a temp file if set.
  get_terminal_output: async (params: Record<string, unknown>) => {
    const terminalName = (params.terminalName as string) || 'TRAE MCP';
    const lines = (params.lines as number) || 50;

    // VS Code doesn't expose terminal stdout natively.
    // Strategy: check for a temp output file that run_terminal_command might produce,
    // or give the user guidance to use run_command for captured output.
    const tmpOutputFile = `/tmp/trae-mcp-terminal-output-${terminalName.replace(/[^a-z0-9]/gi, '_')}.txt`;

    if (require('fs').existsSync(tmpOutputFile)) {
      try {
        const content = require('fs').readFileSync(tmpOutputFile, 'utf-8');
        const lineArr = content.split('\n');
        const recent = lineArr.slice(-lines).join('\n');
        return {
          terminal: terminalName,
          output: recent,
          lineCount: lineArr.length,
          source: 'file',
          filePath: tmpOutputFile,
        };
      } catch {
        // fall through
      }
    }

    // Fallback: list open terminals and their state
    const terminals = vscode.window.terminals.map(t => ({
      name: t.name,
      processId: null as number | null, // processId requires async
    }));

    return {
      terminal: terminalName,
      output: null,
      terminals: terminals,
      note: 'VS Code does not expose terminal stdout directly. Use run_command tool for shell commands with captured output. Alternatively, redirect command output: run_terminal_command with "command": "mycommand 2>&1 | tee /tmp/out.txt", then read_file /tmp/out.txt.',
      suggestion: `To capture output: use run_command with the same command. For interactive terminal use, run_terminal_command sends keystrokes.`,
    };
  },

  // Invoke TRAE SOLO agent (via SOLO mode + chat send)
  invoke_solo_agent: async (params: Record<string, unknown>) => {
    const task = params.task as string;
    if (!task) throw new Error('Missing required parameter: task');
    try {
      // Step 1: Ensure SOLO mode is active
      await vscode.commands.executeCommand('trae.solo.mode.toggle');
    } catch {
      // Continue even if toggle fails (might already be in SOLO mode)
    }
    try {
      // Step 2: Focus the chat input
      await vscode.commands.executeCommand('icube.ai-chat.focusInput');
    } catch {
      // Fallback: just try to send the message
    }
    try {
      // Step 3: Send the task as a message to the AI chat
      // The sendMessage command takes a string or structured input
      const result = await vscode.commands.executeCommand('icube.ai-chat.sendMessage', task);
      return { success: true, result, mode: 'solo' };
    } catch (e) {
      // Try alternative: add to chat first
      try {
        await vscode.commands.executeCommand('icube.ai-chat.plainText.addToChat', task);
        await vscode.commands.executeCommand('icube.ai-chat.sendMessage', '');
        return { success: true, mode: 'solo_fallback', task };
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        return {
          success: false,
          mode: 'solo',
          instruction: task,
          error: msg,
          hint: 'SOLO agent could not be reached. Try opening SOLO mode manually in TRAE.'
        };
      }
    }
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveWorkspacePath(relativePath: string): string {
  const workspaces = vscode.workspace.workspaceFolders;
  if (!relativePath || relativePath.startsWith('/')) return relativePath;
  if (workspaces && workspaces.length > 0) {
    return path.join(workspaces[0].uri.fsPath, relativePath);
  }
  return relativePath;
}

function getFirstWorkspace(): string {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : process.cwd();
}

// ─── JSON-RPC Socket Handler ──────────────────────────────────────────────────

function handleJsonRpc(data: string, sendFn: (resp: string) => void): void {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(data);
  } catch {
    const error: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32700, message: 'Parse error' }
    };
    sendFn(JSON.stringify(error));
    return;
  }

  if (request.method === 'tools/list') {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: Object.keys(TOOLS).map(name => ({ name, description: `TRAE MCP tool: ${name}` }))
      }
    };
    sendFn(JSON.stringify(response));
    return;
  }

  if (request.method === 'tools/call') {
    const toolName = request.params?.name as string;
    const toolParams = (request.params?.arguments as Record<string, unknown>) || {};
    if (!toolName || !TOOLS[toolName]) {
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: `Unknown tool: ${toolName}` }
      };
      sendFn(JSON.stringify(response));
      return;
    }

    TOOLS[toolName](toolParams)
      .then(result => {
        const response: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
        };
        sendFn(JSON.stringify(response));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const response: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: msg }
        };
        sendFn(JSON.stringify(response));
      });
    return;
  }

  // Ping
  if (request.method === 'ping') {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: { status: 'ok', tools: Object.keys(TOOLS) }
    };
    sendFn(JSON.stringify(response));
    return;
  }

  // Unknown method
  const response: JsonRpcResponse = {
    jsonrpc: '2.0',
    id: request.id,
    error: { code: -32601, message: `Method not found: ${request.method}` }
  };
  sendFn(JSON.stringify(response));
}

// ─── MCP Socket Server ───────────────────────────────────────────────────────

function startMcpServer() {
  const config = vscode.workspace.getConfiguration('traeOpenclawMcp');
  socketPath = config.get<string>('socketPath', '/tmp/trae-openclaw-mcp.sock');

  // Clean up existing socket
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  mcpServer = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      // Handle complete JSON-RPC messages (split by newline)
      const messages = buffer.split('\n');
      buffer = messages.pop() || '';
      for (const msg of messages) {
        if (msg.trim()) {
          handleJsonRpc(msg.trim(), (response) => {
            socket.write(response + '\n');
          });
        }
      }
    });

    socket.on('close', () => {});

    socket.on('error', (err) => {
      vscode.window.showErrorMessage(`MCP socket error: ${err.message}`);
    });
  });

  mcpServer.listen(socketPath, () => {
    isRunning = true;
    updateStatus();
    vscode.window.showInformationMessage(
      `TRAE OpenClaw MCP Server started on ${socketPath}`
    );
  });

  mcpServer.on('error', (err) => {
    vscode.window.showErrorMessage(`MCP Server error: ${err.message}`);
    isRunning = false;
    updateStatus();
  });
}

function stopMcpServer() {
  if (mcpServer) {
    mcpServer.close();
    mcpServer = null;
  }
  if (fs.existsSync(socketPath)) {
    try { fs.unlinkSync(socketPath); } catch {}
  }
  isRunning = false;
  updateStatus();
  vscode.window.showInformationMessage('TRAE OpenClaw MCP Server stopped');
}

function updateStatus() {
  if (!statusBarItem) return;
  if (isRunning) {
    statusBarItem.text = `$(radio tower) MCP: ${socketPath}`;
    statusBarItem.tooltip = `TRAE MCP running on ${socketPath}`;
    statusBarItem.color = '#4caf50';
  } else {
    statusBarItem.text = '$(circle-slash) MCP: off';
    statusBarItem.tooltip = 'TRAE MCP server not running';
    statusBarItem.color = '#f44336';
  }
}

// ─── Extension Entry Point ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'trae-openclaw-mcp.status';
  context.subscriptions.push(statusBarItem);

  // Register commands
  const startCmd = vscode.commands.registerCommand('trae-openclaw-mcp.start', () => {
    if (!isRunning) {
      startMcpServer();
    } else {
      vscode.window.showInformationMessage('MCP server already running');
    }
  });

  const stopCmd = vscode.commands.registerCommand('trae-openclaw-mcp.stop', () => {
    stopMcpServer();
  });

  const statusCmd = vscode.commands.registerCommand('trae-openclaw-mcp.status', () => {
    if (isRunning) {
      vscode.window.showInformationMessage(
        `TRAE MCP Server running on ${socketPath}\nTools: ${Object.keys(TOOLS).join(', ')}`
      );
    } else {
      vscode.window.showInformationMessage('TRAE MCP Server not running. Run "TRAE MCP: Start Server" to activate.');
    }
  });

  const runTaskCmd = vscode.commands.registerCommand('trae-openclaw-mcp.runTask', async () => {
    const task = await vscode.window.showInputBox({
      prompt: 'Enter task description for TRAE SOLO agent',
      placeHolder: 'Fix the login bug in auth.ts...'
    });
    if (task) {
      const result = await TOOLS['invoke_solo_agent']({ task });
      vscode.window.showInformationMessage(`Task result: ${JSON.stringify(result)}`);
    }
  });

  context.subscriptions.push(startCmd, stopCmd, statusCmd, runTaskCmd);

  // Auto-start MCP server
  startMcpServer();

  vscode.window.showInformationMessage(
    'TRAE OpenClaw MCP Server activated! Tools: ' + Object.keys(TOOLS).join(', ')
  );
}

export function deactivate() {
  stopMcpServer();
}
