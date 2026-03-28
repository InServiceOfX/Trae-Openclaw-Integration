"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ─── MCP Server State ────────────────────────────────────────────────────────
let mcpServer = null;
let socketPath;
let statusBarItem;
let isRunning = false;
// ─── MCP Tools ───────────────────────────────────────────────────────────────
const TOOLS = {
    // Read a file and return its contents
    read_file: async (params) => {
        const filePath = params.path;
        if (!filePath)
            throw new Error('Missing required parameter: path');
        const absPath = resolveWorkspacePath(filePath);
        try {
            const content = await fs.promises.readFile(absPath, 'utf-8');
            return { path: absPath, content, size: content.length };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to read file ${absPath}: ${msg}`);
        }
    },
    // Write content to a file
    write_file: async (params) => {
        const filePath = params.path;
        const content = params.content;
        if (!filePath)
            throw new Error('Missing required parameter: path');
        if (content === undefined)
            throw new Error('Missing required parameter: content');
        const absPath = resolveWorkspacePath(filePath);
        try {
            await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
            await fs.promises.writeFile(absPath, content, 'utf-8');
            return { path: absPath, written: true, size: content.length };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to write file ${absPath}: ${msg}`);
        }
    },
    // List directory contents
    list_dir: async (params) => {
        const dirPath = params.path || '';
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to list directory ${absPath}: ${msg}`);
        }
    },
    // Search for text in files (grep)
    search_codebase: async (params) => {
        const query = params.query;
        const filePattern = params.pattern || '*';
        const cwd = params.cwd ? resolveWorkspacePath(params.cwd) : getFirstWorkspace();
        if (!query)
            throw new Error('Missing required parameter: query');
        try {
            const { stdout } = await execAsync(`grep -rn --include="${filePattern}" "${query.replace(/"/g, '\\"')}" "${cwd}" 2>/dev/null | head -50`, { timeout: 10000 });
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
        }
        catch {
            return { query, cwd, results: [], count: 0 };
        }
    },
    // Execute a shell command
    run_command: async (params) => {
        const command = params.command;
        const cwd = params.cwd ? resolveWorkspacePath(params.cwd) : getFirstWorkspace();
        if (!command)
            throw new Error('Missing required parameter: command');
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: params.timeout || 30000,
                maxBuffer: 10 * 1024 * 1024,
            });
            return { stdout: stdout.substring(0, 50000), stderr: stderr.substring(0, 10000), exitCode: 0 };
        }
        catch (e) {
            const err = e;
            return { stdout: (err.stdout || '').substring(0, 50000), stderr: (err.stderr || '').substring(0, 10000), exitCode: err.code || 1 };
        }
    },
    // Open a file in the editor
    open_file: async (params) => {
        const filePath = params.path;
        const line = params.line || 1;
        if (!filePath)
            throw new Error('Missing required parameter: path');
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
        }
        catch (e) {
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
    get_symbols: async (params) => {
        const filePath = params.path || '';
        const absPath = resolveWorkspacePath(filePath);
        try {
            const uri = vscode.Uri.file(absPath);
            const document = await vscode.workspace.openTextDocument(uri);
            const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
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
        }
        catch (e) {
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
        const allTabs = [];
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
    run_terminal_command: async (params) => {
        const command = params.command;
        const terminalName = params.terminalName || 'TRAE MCP';
        const waitMs = params.waitMs || 3000;
        if (!command)
            throw new Error('Missing required parameter: command');
        // Find or create a terminal with the given name
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);
        if (!terminal) {
            const cwd = params.cwd ? resolveWorkspacePath(params.cwd) : getFirstWorkspace();
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
    get_terminal_output: async (params) => {
        const terminalName = params.terminalName || 'TRAE MCP';
        const lines = params.lines || 50;
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
            }
            catch {
                // fall through
            }
        }
        // Fallback: list open terminals and their state
        const terminals = vscode.window.terminals.map(t => ({
            name: t.name,
            processId: null, // processId requires async
        }));
        return {
            terminal: terminalName,
            output: null,
            terminals: terminals,
            note: 'VS Code does not expose terminal stdout directly. Use run_command tool for shell commands with captured output. Alternatively, redirect command output: run_terminal_command with "command": "mycommand 2>&1 | tee /tmp/out.txt", then read_file /tmp/out.txt.',
            suggestion: `To capture output: use run_command with the same command. For interactive terminal use, run_terminal_command sends keystrokes.`,
        };
    },
    // Invoke TRAE SOLO agent via AI chat service
    invoke_solo_agent: async (params) => {
        const task = params.task;
        if (!task)
            throw new Error('Missing required parameter: task');
        // Strategy: use the AI chat's setInputText + send approach
        // Try a sequence of approaches
        const approaches = [
            // Approach 1: Try focusInput + typeText via keyboard simulation
            async () => {
                try {
                    await vscode.commands.executeCommand('icube.ai-chat.focusInput');
                    // After focusing, the input should be ready
                    // We can't easily type text, but we can try to send
                    const r = await vscode.commands.executeCommand('icube.ai-chat.sendMessage', task);
                    return { success: true, approach: 'focusInput+sendMessage', result: r };
                }
                catch {
                    return null;
                }
            },
            // Approach 2: Try updateChatInputText if it exists
            async () => {
                try {
                    const r = await vscode.commands.executeCommand('icube.chat.updateCommandState', { type: 'input', text: task });
                    return { success: true, approach: 'updateCommandState', result: r };
                }
                catch {
                    return null;
                }
            },
            // Approach 3: Toggle SOLO mode, then try sendMessage
            async () => {
                try {
                    await vscode.commands.executeCommand('trae.solo.mode.toggle');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const r = await vscode.commands.executeCommand('icube.ai-chat.sendMessage', task);
                    return { success: true, approach: 'soloToggle+sendMessage', result: r };
                }
                catch {
                    return null;
                }
            },
            // Approach 4: Just try sendMessage directly
            async () => {
                try {
                    const r = await vscode.commands.executeCommand('icube.ai-chat.sendMessage', task);
                    return { success: true, approach: 'sendMessageDirect', result: r };
                }
                catch (e) {
                    return { success: false, approach: 'sendMessageDirect', error: String(e) };
                }
            },
        ];
        for (const approach of approaches) {
            const result = await approach();
            if (result && result.success) {
                return result;
            }
        }
        return {
            success: false,
            mode: 'solo',
            instruction: task,
            hint: 'Could not reach SOLO agent. Try opening SOLO mode manually in TRAE, or use file-based tools directly.',
            available_commands: ['trae.solo.mode.toggle', 'icube.ai-chat.focusInput'],
        };
    },
    // Toggle TRAE SOLO mode on/off
    start_solo_mode: async (params) => {
        try {
            await vscode.commands.executeCommand('trae.solo.mode.toggle');
            return { success: true, action: 'solo_mode_toggled' };
        }
        catch (e) {
            return { success: false, error: String(e) };
        }
    },
    // Type text into the SOLO chat input using clipboard paste
    // This is a workaround since icube.ai-chat commands are webview-only
    send_to_solo_chat: async (params) => {
        const text = params.text;
        if (!text)
            throw new Error('Missing required parameter: text');
        try {
            // Copy text to clipboard
            await vscode.env.clipboard.writeText(text);
        }
        catch (e) {
            return { success: false, error: 'Failed to copy to clipboard: ' + String(e) };
        }
        // Try multiple approaches to open chat and paste
        const chatCommands = [
            'icube.ai-chat.focusInput',
            'workbench.action.chat.open',
            'workbench.action.openChat',
            'TRAE.ai-chat.focusInput',
        ];
        for (const cmd of chatCommands) {
            try {
                await vscode.commands.executeCommand(cmd);
                await new Promise(resolve => setTimeout(resolve, 300));
                break;
            }
            catch {
                // Try next command
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            return { success: true, action: 'text_pasted', note: 'Text pasted into SOLO chat. Press Enter to send.' };
        }
        catch (e) {
            return { success: false, error: String(e), hint: 'Could not paste automatically. Try Ctrl+V in the chat input.' };
        }
    },
    // Open the MCP configuration in TRAE settings
    open_mcp_config: async (params) => {
        const scope = params.scope || 'user'; // 'user' or 'workspaceFolder'
        try {
            if (scope === 'workspaceFolder') {
                await vscode.commands.executeCommand('workbench.agentExtensionWorkspaceConfig.open');
            }
            else {
                await vscode.commands.executeCommand('workbench.agentExtensionConfig.open');
            }
            return { success: true, action: 'mcp_config_opened', scope };
        }
        catch (e) {
            // Fallback: try generic settings open
            try {
                await vscode.commands.executeCommand('workbench.action.openSettings', { query: 'MCP' });
                return { success: true, action: 'settings_opened', scope: 'settings' };
            }
            catch (e2) {
                return { success: false, error: String(e), fallback_error: String(e2) };
            }
        }
    },
    // List MCP servers from ALL TRAE MCP configurations (User + Global)
    list_mcp_servers: async (params) => {
        try {
            const configs = [
                { path: path.join(os.homedir(), '.config', 'Trae', 'mcp.json'), scope: 'global' },
                { path: path.join(os.homedir(), '.config', 'Trae', 'User', 'mcp.json'), scope: 'user' },
            ];
            const allServers = {};
            for (const cfg of configs) {
                try {
                    const content = await fs.promises.readFile(cfg.path, 'utf-8');
                    const config = JSON.parse(content);
                    const servers = config.mcpServers || {};
                    for (const [name, serverCfg] of Object.entries(servers)) {
                        allServers[name] = { name, scope: cfg.scope, config: serverCfg };
                    }
                }
                catch {
                    // Config doesn't exist, skip
                }
            }
            return {
                servers: Object.values(allServers),
                note: 'User config overrides global config for same server name'
            };
        }
        catch (e) {
            return { success: false, error: String(e) };
        }
    },
    // Register a new MCP server in TRAE's mcp.json
    add_mcp_server: async (params) => {
        const name = params.name;
        const command = params.command;
        const args = params.args || [];
        if (!name || !command)
            throw new Error('Missing required parameters: name, command');
        try {
            const mcpPath = path.join(os.homedir(), '.config', 'Trae', 'mcp.json');
            let config = {};
            try {
                const content = await fs.promises.readFile(mcpPath, 'utf-8');
                config = JSON.parse(content);
            }
            catch {
                // File doesn't exist yet
            }
            if (!config.mcpServers) {
                config.mcpServers = {};
            }
            config.mcpServers[name] = { command, args };
            await fs.promises.writeFile(mcpPath, JSON.stringify(config, null, 2), 'utf-8');
            return { success: true, action: 'mcp_server_added', name, configPath: mcpPath, note: 'TRAE needs to be reloaded to pick up changes: Ctrl+Shift+P → Developer: Reload Window' };
        }
        catch (e) {
            return { success: false, error: String(e) };
        }
    },
    // Call any MCP server configured in TRAE (memory, github, docker, etc.)
    // OpenClaw uses this to route MCP tool calls through TRAE's MCP infrastructure
    call_mcp_server: async (params) => {
        const serverName = params.server;
        const method = params.method || 'tools/call';
        const toolName = params.tool;
        const toolArgs = params.arguments || {};
        if (!serverName)
            throw new Error('Missing required parameter: server');
        if (!toolName && method === 'tools/call')
            throw new Error('Missing required parameter: tool');
        // Find the server config in User or global mcp.json
        const configs = [
            path.join(os.homedir(), '.config', 'Trae', 'User', 'mcp.json'),
            path.join(os.homedir(), '.config', 'Trae', 'mcp.json'),
        ];
        let serverConfig = null;
        let configPath = '';
        for (const cfgPath of configs) {
            try {
                const content = await fs.promises.readFile(cfgPath, 'utf-8');
                const config = JSON.parse(content);
                if (config.mcpServers && config.mcpServers[serverName]) {
                    serverConfig = config.mcpServers[serverName];
                    configPath = cfgPath;
                    break;
                }
            }
            catch {
                // Skip missing files
            }
        }
        if (!serverConfig) {
            return { success: false, error: `MCP server '${serverName}' not found in TRAE config`, hint: 'Use list_mcp_servers to see available servers' };
        }
        // Build environment with token replacement
        const env = {};
        for (const [k, v] of Object.entries(process.env)) {
            if (v !== undefined) {
                env[k] = v;
            }
        }
        if (serverConfig.env) {
            for (const [k, v] of Object.entries(serverConfig.env)) {
                env[k] = v;
            }
        }
        // Spawn MCP server
        const reqId = Date.now().toString();
        let requestPayload;
        if (method === 'tools/call') {
            requestPayload = { jsonrpc: '2.0', id: reqId, method: 'tools/call', params: { name: toolName, arguments: toolArgs } };
        }
        else if (method === 'tools/list') {
            requestPayload = { jsonrpc: '2.0', id: reqId, method: 'tools/list', params: {} };
        }
        else if (method === 'ping') {
            requestPayload = { jsonrpc: '2.0', id: reqId, method: 'ping', params: {} };
        }
        else {
            requestPayload = { jsonrpc: '2.0', id: reqId, method: method, params: toolArgs };
        }
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)(serverConfig.command, serverConfig.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                // Try to parse complete JSON-RPC response(s)
                const lines = stdout.split('\n');
                stdout = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const resp = JSON.parse(line);
                            proc.kill();
                            resolve({
                                success: true,
                                server: serverName,
                                configPath,
                                request: requestPayload,
                                response: resp,
                            });
                            return;
                        }
                        catch {
                            // Not complete JSON yet
                        }
                    }
                }
            });
            proc.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            proc.on('close', (code) => {
                if (stderr) {
                    resolve({ success: false, server: serverName, error: `Process exited with code ${code}`, stderr: stderr.substring(0, 1000) });
                }
                else {
                    resolve({ success: false, server: serverName, error: `No response from MCP server (exit code ${code})` });
                }
            });
            proc.on('error', (err) => {
                resolve({ success: false, server: serverName, error: `Failed to spawn server: ${err.message}` });
            });
            // Send request
            proc.stdin.write(JSON.stringify(requestPayload) + '\n');
            proc.stdin.end();
            // Timeout after 30s
            setTimeout(() => {
                proc.kill();
                resolve({ success: false, server: serverName, error: 'Timeout after 30s' });
            }, 30000);
        });
    },
};
// ─── Helpers ─────────────────────────────────────────────────────────────────
function resolveWorkspacePath(relativePath) {
    const workspaces = vscode.workspace.workspaceFolders;
    if (!relativePath || relativePath.startsWith('/'))
        return relativePath;
    if (workspaces && workspaces.length > 0) {
        return path.join(workspaces[0].uri.fsPath, relativePath);
    }
    return relativePath;
}
function getFirstWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : process.cwd();
}
// ─── JSON-RPC Socket Handler ──────────────────────────────────────────────────
function handleJsonRpc(data, sendFn) {
    let request;
    try {
        request = JSON.parse(data);
    }
    catch {
        const error = {
            jsonrpc: '2.0',
            id: 0,
            error: { code: -32700, message: 'Parse error' }
        };
        sendFn(JSON.stringify(error));
        return;
    }
    if (request.method === 'tools/list') {
        const response = {
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
        const toolName = request.params?.name;
        const toolParams = request.params?.arguments || {};
        if (!toolName || !TOOLS[toolName]) {
            const response = {
                jsonrpc: '2.0',
                id: request.id,
                error: { code: -32602, message: `Unknown tool: ${toolName}` }
            };
            sendFn(JSON.stringify(response));
            return;
        }
        TOOLS[toolName](toolParams)
            .then(result => {
            const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
            };
            sendFn(JSON.stringify(response));
        })
            .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            const response = {
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
        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { status: 'ok', tools: Object.keys(TOOLS) }
        };
        sendFn(JSON.stringify(response));
        return;
    }
    // Unknown method
    const response = {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` }
    };
    sendFn(JSON.stringify(response));
}
// ─── MCP Socket Server ───────────────────────────────────────────────────────
function startMcpServer() {
    const config = vscode.workspace.getConfiguration('traeOpenclawMcp');
    socketPath = config.get('socketPath', '/tmp/trae-openclaw-mcp.sock');
    // Clean up existing socket
    if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
    }
    mcpServer = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (chunk) => {
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
        socket.on('close', () => { });
        socket.on('error', (err) => {
            vscode.window.showErrorMessage(`MCP socket error: ${err.message}`);
        });
    });
    mcpServer.listen(socketPath, () => {
        isRunning = true;
        updateStatus();
        vscode.window.showInformationMessage(`TRAE OpenClaw MCP Server started on ${socketPath}`);
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
        try {
            fs.unlinkSync(socketPath);
        }
        catch { }
    }
    isRunning = false;
    updateStatus();
    vscode.window.showInformationMessage('TRAE OpenClaw MCP Server stopped');
}
function updateStatus() {
    if (!statusBarItem)
        return;
    if (isRunning) {
        statusBarItem.text = `$(radio tower) MCP: ${socketPath}`;
        statusBarItem.tooltip = `TRAE MCP running on ${socketPath}`;
        statusBarItem.color = '#4caf50';
    }
    else {
        statusBarItem.text = '$(circle-slash) MCP: off';
        statusBarItem.tooltip = 'TRAE MCP server not running';
        statusBarItem.color = '#f44336';
    }
}
// ─── Extension Entry Point ────────────────────────────────────────────────────
function activate(context) {
    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'trae-openclaw-mcp.status';
    context.subscriptions.push(statusBarItem);
    // Register commands
    const startCmd = vscode.commands.registerCommand('trae-openclaw-mcp.start', () => {
        if (!isRunning) {
            startMcpServer();
        }
        else {
            vscode.window.showInformationMessage('MCP server already running');
        }
    });
    const stopCmd = vscode.commands.registerCommand('trae-openclaw-mcp.stop', () => {
        stopMcpServer();
    });
    const statusCmd = vscode.commands.registerCommand('trae-openclaw-mcp.status', () => {
        if (isRunning) {
            vscode.window.showInformationMessage(`TRAE MCP Server running on ${socketPath}\nTools: ${Object.keys(TOOLS).join(', ')}`);
        }
        else {
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
    vscode.window.showInformationMessage('TRAE OpenClaw MCP Server activated! Tools: ' + Object.keys(TOOLS).join(', '));
}
function deactivate() {
    stopMcpServer();
}
