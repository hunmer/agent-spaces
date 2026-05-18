"use client";

import { MonacoLanguageClient } from 'monaco-languageclient';
import { MonacoVscodeApiWrapper, type MonacoVscodeApiConfig } from 'monaco-languageclient/vscodeApiWrapper';
import { configureDefaultWorkerFactory } from 'monaco-languageclient/workerFactory';
import { CloseAction, ErrorAction, type MessageTransports } from 'vscode-languageclient/browser.js';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { Uri } from 'vscode';
import { getToken } from './auth';
import { getActiveServerUrl } from './server';

const clients = new Map<string, MonacoLanguageClient>();
let vscodeApiInit: Promise<void> | null = null;

function ensureVscodeApi(): Promise<void> {
  if (vscodeApiInit) return vscodeApiInit;

  const config: MonacoVscodeApiConfig = {
    $type: 'classic',
    viewsConfig: {
      $type: 'EditorService',
    },
    userConfiguration: {
      json: JSON.stringify({
        'editor.wordBasedSuggestions': 'off',
        'typescript.tsserver.useSyntaxServer': 'auto',
      }),
    },
    monacoWorkerFactory: configureDefaultWorkerFactory,
  };

  const wrapper = new MonacoVscodeApiWrapper(config);
  vscodeApiInit = wrapper.start({ caller: 'agent-spaces-monaco-language-client' });
  return vscodeApiInit;
}

function getLanguageServerUrl(workspaceId: string): string {
  const serverUrl = getActiveServerUrl();
  const url = new URL('/ws/lsp/typescript', serverUrl ?? window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('workspaceId', workspaceId);

  const token = getToken();
  if (token) url.searchParams.set('token', token);

  return url.toString();
}

export function startTypeScriptLanguageClient(workspaceId: string, workspaceRoot?: string): void {
  if (typeof window === 'undefined' || clients.has(workspaceId)) return;

  const webSocket = new WebSocket(getLanguageServerUrl(workspaceId));
  webSocket.onopen = async () => {
    console.info('[monaco-language-client] TypeScript websocket opened', {
      workspaceId,
      workspaceRoot,
    });

    await ensureVscodeApi();

    const socket = toSocket(webSocket);
    const messageTransports: MessageTransports = {
      reader: new WebSocketMessageReader(socket),
      writer: new WebSocketMessageWriter(socket),
    };

    const client = new MonacoLanguageClient({
      id: `typescript-${workspaceId}`,
      name: 'TypeScript Language Server',
      clientOptions: {
        documentSelector: [
          { language: 'typescript', scheme: 'file' },
          { language: 'javascript', scheme: 'file' },
        ],
        workspaceFolder: {
          index: 0,
          name: workspaceId,
          uri: workspaceRoot
            ? Uri.file(workspaceRoot)
            : Uri.parse(`file:///workspace/${workspaceId}`),
        },
        errorHandler: {
          error: () => ({ action: ErrorAction.Continue }),
          closed: () => ({ action: CloseAction.DoNotRestart }),
        },
      },
      messageTransports,
    });

    clients.set(workspaceId, client);
    void client.start().catch((error) => {
      console.warn('[monaco-language-client] failed to start TypeScript client:', error);
      clients.delete(workspaceId);
      webSocket.close();
    });
  };

  webSocket.onerror = () => {
    console.warn('[monaco-language-client] TypeScript language server websocket failed');
  };

  webSocket.onclose = () => {
    const client = clients.get(workspaceId);
    clients.delete(workspaceId);
    void client?.stop();
  };
}

export function stopTypeScriptLanguageClient(workspaceId: string): void {
  const client = clients.get(workspaceId);
  if (!client) return;
  clients.delete(workspaceId);
  void client.stop();
}
