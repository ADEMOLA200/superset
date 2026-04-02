import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { NodeWebSocket } from "@hono/node-ws";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { type IPty, spawn } from "node-pty";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";

interface RegisterWorkspaceTerminalRouteOptions {
	app: Hono;
	db: HostDb;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

type TerminalClientMessage =
	| {
			type: "init";
			workspaceId: string;
			sessionKey?: string;
	  }
	| {
			type: "input";
			data: string;
	  }
	| {
			type: "resize";
			cols: number;
			rows: number;
	  }
	| {
			type: "dispose";
	  };

type TerminalServerMessage =
	| {
			type: "data";
			data: string;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "exit";
			exitCode: number;
			signal: number;
	  };

function sendMessage(
	socket: {
		send: (data: string) => void;
		readyState: number;
	},
	message: TerminalServerMessage,
) {
	if (socket.readyState !== 1) {
		return;
	}
	socket.send(JSON.stringify(message));
}

function resolveShell(): string {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "cmd.exe";
	}

	return process.env.SHELL || "/bin/zsh";
}

type TerminalSocket = {
	send: (data: string) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
};

interface TerminalSession {
	paneId: string;
	workspaceId: string;
	sessionKey: string | null;
	terminal: IPty;
	sockets: Set<TerminalSocket>;
	disposed: boolean;
}

const terminalSessions = new Map<string, TerminalSession>();

function broadcastMessage(
	session: TerminalSession,
	message: TerminalServerMessage,
): void {
	for (const socket of session.sockets) {
		sendMessage(socket, message);
	}
}

function detachSocket(
	session: TerminalSession | null,
	socket: TerminalSocket,
): void {
	if (!session) {
		return;
	}

	session.sockets.delete(socket);
}

function closeSessionSockets(
	session: TerminalSession,
	code: number,
	reason: string,
): void {
	for (const socket of session.sockets) {
		try {
			socket.close(code, reason);
		} catch {
			// Best effort close.
		}
	}
	session.sockets.clear();
}

function disposeSession(
	session: TerminalSession,
	options?: {
		closeSockets?: boolean;
		closeCode?: number;
		closeReason?: string;
	},
): void {
	if (session.disposed) {
		return;
	}

	session.disposed = true;
	terminalSessions.delete(session.paneId);

	if (options?.closeSockets) {
		closeSessionSockets(
			session,
			options.closeCode ?? 1000,
			options.closeReason ?? "Terminal closed",
		);
	}

	session.terminal.kill();
}

function createSession(args: {
	db: HostDb;
	paneId: string;
	workspaceId: string;
	sessionKey: string | null;
	initialSocket: TerminalSocket;
}): TerminalSession {
	const workspace = args.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, args.workspaceId) })
		.sync();

	if (!workspace || !existsSync(workspace.worktreePath)) {
		throw new Error("Workspace worktree not found");
	}

	const terminal = spawn(resolveShell(), [], {
		name: "xterm-256color",
		cwd: workspace.worktreePath,
		cols: 120,
		rows: 32,
		env: {
			...process.env,
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			HOME: process.env.HOME || homedir(),
			PWD: workspace.worktreePath,
		},
	});

	const session: TerminalSession = {
		paneId: args.paneId,
		workspaceId: args.workspaceId,
		sessionKey: args.sessionKey,
		terminal,
		sockets: new Set([args.initialSocket]),
		disposed: false,
	};

	terminal.onData((data) => {
		broadcastMessage(session, {
			type: "data",
			data,
		});
	});

	terminal.onExit(({ exitCode, signal }) => {
		broadcastMessage(session, {
			type: "exit",
			exitCode: exitCode ?? 0,
			signal: signal ?? 0,
		});
		disposeSession(session, {
			closeSockets: true,
			closeCode: 1000,
			closeReason: "Terminal exited",
		});
	});

	terminalSessions.set(args.paneId, session);
	return session;
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
	upgradeWebSocket,
}: RegisterWorkspaceTerminalRouteOptions) {
	app.get(
		"/terminal/pane/:paneId",
		upgradeWebSocket((c) => {
			const paneId = c.req.param("paneId");
			let socketSession: TerminalSession | null = null;

			return {
				onOpen: (_event, ws) => {
					if (!paneId) {
						ws.close(1008, "Pane id is required");
						return;
					}

					const existingSession = terminalSessions.get(paneId);
					if (!existingSession) {
						return;
					}

					existingSession.sockets.add(ws);
					socketSession = existingSession;
				},
				onMessage: (event, ws) => {
					if (!paneId) {
						sendMessage(ws, {
							type: "error",
							message: "Pane id is required",
						});
						ws.close(1008, "Pane id is required");
						return;
					}

					let message: TerminalClientMessage;
					try {
						message = JSON.parse(String(event.data)) as TerminalClientMessage;
					} catch {
						sendMessage(ws, {
							type: "error",
							message: "Invalid terminal message payload",
						});
						return;
					}

					if (message.type === "init") {
						const existingSession = terminalSessions.get(paneId);
						if (existingSession) {
							existingSession.workspaceId = message.workspaceId;
							existingSession.sessionKey = message.sessionKey ?? null;
							existingSession.sockets.add(ws);
							socketSession = existingSession;
							return;
						}

						try {
							socketSession = createSession({
								db,
								paneId,
								workspaceId: message.workspaceId,
								sessionKey: message.sessionKey ?? null,
								initialSocket: ws,
							});
						} catch (error) {
							sendMessage(ws, {
								type: "error",
								message:
									error instanceof Error
										? error.message
										: "Failed to start terminal",
							});
							ws.close(1011, "Failed to start terminal");
						}
						return;
					}

					const session = socketSession ?? terminalSessions.get(paneId);
					if (!session) {
						sendMessage(ws, {
							type: "error",
							message: "Terminal session not initialized",
						});
						return;
					}

					socketSession = session;

					if (message.type === "input") {
						session.terminal.write(message.data);
						return;
					}

					if (message.type === "resize") {
						const cols = Math.max(20, Math.floor(message.cols));
						const rows = Math.max(5, Math.floor(message.rows));
						session.terminal.resize(cols, rows);
						return;
					}

					if (message.type === "dispose") {
						disposeSession(session, {
							closeSockets: true,
							closeCode: 1000,
							closeReason: "Terminal disposed",
						});
					}
				},
				onClose: (_event, ws) => {
					detachSocket(socketSession, ws);
				},
				onError: (_event, ws) => {
					detachSocket(socketSession, ws);
				},
			};
		}),
	);
}
