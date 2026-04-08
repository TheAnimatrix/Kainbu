import fs from "fs/promises";
import path from "path";
import type { AiProgressEvent, AiWorkspaceRequest, AiWorkspaceResponse, WorkspaceAction } from "./types.js";
type OpenRouterMessage = any;
import { randomUUID } from "crypto";
import { buildSystemPrompt } from "./prompt.js";
import { VirtualFSTools, OpenRouterTools, webSearch } from "./tools.js";
import {
    canMutateWorkspacePath,
    cleanupMaterializedWorkspace,
    collectWorkspaceProposals,
    materializeWorkspace,
    recordWorkspaceMutation,
    resolveWorkspaceFilePath,
    validateWorkspaceFile,
} from "./sync.js";
import { WORKSPACE_AI_MAX_TOKENS } from "./constants.js";
import { applyThinkingLevel, resolveWorkspaceAiModel, validateWorkspaceAiRequest } from "./models.js";
import { getEnv } from "../env.js";

const truncate = (value: string | undefined, maxLength = 300) => {
    if (!value) return "";
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
};

const stripTempDir = (text: string, tempDir: string) => {
    const normalizedTempDir = tempDir.replaceAll("\\", "/");
    return text
        .replaceAll(`${tempDir}${path.sep}`, "")
        .replaceAll(tempDir, "")
        .replaceAll(`${normalizedTempDir}/`, "")
        .replaceAll(normalizedTempDir, "");
};

const parseToolArguments = (rawArguments: unknown) => {
    if (typeof rawArguments === "string") {
        return JSON.parse(rawArguments) as Record<string, unknown>;
    }

    if (rawArguments && typeof rawArguments === "object") {
        return rawArguments as Record<string, unknown>;
    }

    return {};
};

const messageContent = (value: unknown) => (typeof value === "string" ? value : "");

const fetchCompletion = async (
    messages: OpenRouterMessage[],
    useTools: boolean,
    modelConfig: ReturnType<typeof resolveWorkspaceAiModel>
) => {
    const apiKey = getEnv("OPENROUTER_API_KEY", "");
    if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

    const body: Record<string, unknown> = {
        model: modelConfig.model,
        max_tokens: WORKSPACE_AI_MAX_TOKENS,
        messages,
    };
    if (modelConfig.thinking) {
        body.reasoning = modelConfig.thinking;
    }

    if (useTools) {
        body.tools = OpenRouterTools;
        body.tool_choice = "auto";
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://kainbu.test",
            "X-Title": "Kainbu"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error("OpenRouter error: " + await res.text());
    return res.json();
};

export const handleWorkspaceAiRequest = async (
    req: AiWorkspaceRequest,
    auth: string | undefined,
    progressReporter?: (p: any) => void
): Promise<AiWorkspaceResponse> => {
    validateWorkspaceAiRequest(req);
    const requestId = randomUUID();
    const startedAt = Date.now();
    const log = (message: string, data?: unknown) => {
        if (data !== undefined) {
            console.log(`[WorkspaceAI][${requestId}] ${message}`, data);
        } else {
            console.log(`[WorkspaceAI][${requestId}] ${message}`);
        }
    };
    const emitProgress = (
        kind: AiProgressEvent["kind"],
        message: string,
        detail?: string
    ) => {
        if (!progressReporter) return;

        progressReporter({
            id: randomUUID(),
            kind,
            message,
            ...(detail ? { detail } : {}),
            timestamp: Date.now(),
        } satisfies AiProgressEvent);
    };

    const baseModelConfig = resolveWorkspaceAiModel(req.modelId);
    const modelConfig = applyThinkingLevel(baseModelConfig, req.thinkingLevel);
    log("Prompt received", {
        projectId: req.projectId,
        modelId: req.modelId,
        scope: req.scope,
        historyCount: req.history.length,
        historySnippet: req.history.map((m) => ({ role: m.role, text: truncate(m.text, 200) }))
    });

    emitProgress("status", "Preparing the current board and page for review.");
    const workspace = await materializeWorkspace(req.projectId, auth, req.scope);

    let messages: OpenRouterMessage[] = [
        { role: "system", content: buildSystemPrompt(req.scope) },
        ...req.history.map(m => ({ role: m.role, content: m.text } as OpenRouterMessage))
    ];

    let reply = "";
    let turns = 0;
    let toolCallCount = 0;
    const maxTurns = 5;

    try {
        while (turns < maxTurns) {
            turns++;
            emitProgress("status", "AI is reviewing the current board and page.");
            log("AI requesting", {
                turn: turns,
                useTools: true,
                model: modelConfig.model,
                messagesSent: messages.length
            });

            const response = await fetchCompletion(messages, true, modelConfig);
            const choice = response.choices[0];
            const message = choice.message;

            log("AI response received", {
                turn: turns,
                role: message.role,
                contentSnippet: truncate(messageContent(message.content), 300),
                toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.length : 0,
                finishReason: choice.finish_reason,
                responseUsage: response.usage ? {
                    prompt_tokens: response.usage.prompt_tokens,
                    completion_tokens: response.usage.completion_tokens,
                    total_tokens: response.usage.total_tokens
                } : undefined
            });

            messages.push(message);

            if (message.tool_calls && message.tool_calls.length > 0) {
                for (const call of message.tool_calls) {
                    toolCallCount += 1;
                    const name = call.function.name;
                    let args: Record<string, unknown>;

                    try {
                        args = parseToolArguments(call.function.arguments);
                    } catch (error) {
                        const result = `Error: Invalid tool arguments. ${error instanceof Error ? error.message : ""}`.trim();
                        messages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: result
                        });
                        continue;
                    }

                    log("Tool call requested", {
                        turn: turns,
                        tool: name,
                        args
                    });
                    emitProgress("tool_call", `Using ${name}.`, truncate(JSON.stringify(args), 180));

                    let result = "";

                    try {
                        if (name === "read") {
                            const filepath = resolveWorkspaceFilePath(workspace, String(args.filepath || ""));
                            result = await VirtualFSTools.read(
                                filepath,
                                typeof args.startLine === "number" ? args.startLine : undefined,
                                typeof args.endLine === "number" ? args.endLine : undefined
                            );
                        } else if (name === "bash") {
                            result = await VirtualFSTools.bash(workspace.tempDir, String(args.command || ""));
                        } else if (name === "edit") {
                            const filepath = resolveWorkspaceFilePath(workspace, String(args.filepath || ""));
                            if (!canMutateWorkspacePath(workspace, filepath)) {
                                result = "Error: Only the current board and current page can be edited in this request.";
                            } else {
                                const previousContent = await fs.readFile(filepath, "utf8");
                                result = await VirtualFSTools.edit(
                                    filepath,
                                    String(args.searchString || ""),
                                    String(args.replaceString || "")
                                );

                                if (result === "File edited successfully.") {
                                    try {
                                        await validateWorkspaceFile(workspace, filepath);
                                        recordWorkspaceMutation(workspace, filepath);
                                    } catch (error) {
                                        await fs.writeFile(filepath, previousContent, "utf8");
                                        result = `Error: ${error instanceof Error ? error.message : "Invalid file content."}`;
                                    }
                                }
                            }
                        } else if (name === "write") {
                            const filepath = resolveWorkspaceFilePath(workspace, String(args.filepath || ""));
                            if (!canMutateWorkspacePath(workspace, filepath)) {
                                result = "Error: Only the current board and current page can be written in this request.";
                            } else {
                                const previousContent = await fs.readFile(filepath, "utf8");
                                result = await VirtualFSTools.write(filepath, String(args.content || ""));

                                if (result === "File written successfully.") {
                                    try {
                                        await validateWorkspaceFile(workspace, filepath);
                                        recordWorkspaceMutation(workspace, filepath);
                                    } catch (error) {
                                        await fs.writeFile(filepath, previousContent, "utf8");
                                        result = `Error: ${error instanceof Error ? error.message : "Invalid file content."}`;
                                    }
                                }
                            }
                        } else if (name === "search") {
                            result = await VirtualFSTools.search(workspace.tempDir, String(args.query || ""));
                        } else if (name === "web_search") {
                            result = await webSearch(String(args.query || ""));
                        } else {
                            result = `Unknown tool: ${name}`;
                        }
                    } catch (error) {
                        result = `Error: ${error instanceof Error ? error.message : "Tool execution failed."}`;
                    }

                    result = stripTempDir(result, workspace.tempDir);
                    log("Tool call response", {
                        turn: turns,
                        tool: name,
                        resultSnippet: truncate(result, 500)
                    });
                    emitProgress("tool_result", `${name} finished.`, truncate(result, 180));

                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result
                    });
                }
            } else {
                reply = messageContent(message.content);
                break;
            }
        }

        if (!reply) {
            log("No direct text reply from AI, requesting summary response", { turns });
            messages.push({
                role: "system",
                content: "Summarize what you changed or reviewed for the user. If changes were staged, tell the user to review and apply them in the UI. Do not mention file names, file paths, or extensions."
            });
            const summaryResponse = await fetchCompletion(messages, false, modelConfig);
            const summaryMessage = summaryResponse.choices?.[0]?.message;
            log("Summary response received", {
                contentSnippet: truncate(messageContent(summaryMessage?.content), 300),
                responseUsage: summaryResponse.usage ? {
                    prompt_tokens: summaryResponse.usage.prompt_tokens,
                    completion_tokens: summaryResponse.usage.completion_tokens,
                    total_tokens: summaryResponse.usage.total_tokens
                } : undefined
            });
            reply = messageContent(summaryMessage?.content) || "I reviewed the workspace.";
        }

        const proposals = await collectWorkspaceProposals(workspace);
        const toolActions = [...new Set(proposals.map((proposal) => proposal.target as WorkspaceAction))];

        if (proposals.length > 0) {
            const applyLine =
                proposals.length === 1
                    ? "Review the staged change below, then apply it to save it to the project."
                    : "Review the staged changes below, then apply them to save them to the project.";
            reply = reply.trim() ? `${reply.trim()}\n\n${applyLine}` : applyLine;
            emitProgress("status", "Changes are staged and ready to review.");
        } else if (workspace.board.editCallCount > 0 || workspace.page.editCallCount > 0) {
            const noStageLine = "No board or page changes were staged to apply.";
            reply = reply.trim() ? `${reply.trim()}\n\n${noStageLine}` : noStageLine;
            emitProgress("status", "No project changes were staged.");
        }

        reply = stripTempDir(reply, workspace.tempDir);
        log("Final reply", {
            replySnippet: truncate(reply, 300),
            turns,
            modelId: modelConfig.id,
            proposals: proposals.map((proposal) => ({
                id: proposal.id,
                target: proposal.target,
                scope: proposal.scope,
                editCallCount: proposal.editCallCount,
            }))
        });

        return {
            reply,
            modelId: modelConfig.id,
            model: modelConfig.model,
            latencyMs: Date.now() - startedAt,
            requestId,
            proposals,
            usage: {
                modelTurnsUsed: turns,
                modelTurnsMax: maxTurns,
                toolCallsUsed: toolCallCount,
                toolCallsMax: 0,
                kanbanReadsUsed: 0,
                kanbanReadsMax: 0,
                scratchpadReadsUsed: 0,
                scratchpadReadsMax: 0
            },
            highlightedTaskIds: proposals
                .filter((proposal) => proposal.target === "kanban")
                .flatMap((proposal) => proposal.proposalSafety.touchedTaskIds),
            annotations: [],
            toolActions,
        };
    } finally {
        await cleanupMaterializedWorkspace(workspace);
    }
};
