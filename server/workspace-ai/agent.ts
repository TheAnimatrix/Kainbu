import type { AiProgressEvent, AiWorkspaceRequest, AiWorkspaceResponse, WorkspaceAction } from "./types.js";
import { randomUUID } from "crypto";
import {
    buildQueuedTaskCardsContext,
    buildStaticSystemPrompt,
    buildVariableSystemContext,
    resolveMaxModelTurns,
} from "./prompt.js";
import { OpenRouterTools } from "./tools.js";
import {
    cleanupMaterializedWorkspace,
    collectWorkspaceProposals,
    materializeWorkspace,
} from "./sync.js";
import {
    WORKSPACE_AI_BOARD_INDEX_MAX_LINES,
    WORKSPACE_AI_MAX_TOOL_CALLS,
    WORKSPACE_AI_TURN_NOTE_MAX_CHARS,
} from "./constants.js";
import { applyThinkingLevel, resolveWorkspaceAiModel, validateWorkspaceAiRequest } from "./models.js";
import {
    buildBoardRefIndex,
    sanitizeUserFacingReply,
} from "./kanban-ops.js";
import {
    fetchCompletionJson,
    fetchCompletionStream,
    type OpenRouterMessage,
} from "./openrouter-stream.js";
import {
    createToolRunCounters,
    executeWorkspaceTool,
    humanizeToolCall,
    summarizeToolResult,
} from "./tool-handlers.js";

const INTERNAL_TURN_NOTE_PREFIX = "[Internal turn note — do not repeat to user]";

const truncate = (value: string | undefined, maxLength = 300) => {
    if (!value) return "";
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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

const messageContent = (value: unknown) => {
    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .map((part) => {
                if (!part || typeof part !== "object") return "";
                const entry = part as Record<string, unknown>;
                if (entry.type === "text" && typeof entry.text === "string") {
                    return entry.text;
                }
                return "";
            })
            .join("");
    }

    return "";
};

const getCompletionChoice = (response: unknown) => {
    if (!response || typeof response !== "object") {
        throw new Error("OpenRouter returned an empty or invalid response.");
    }

    const payload = response as Record<string, unknown>;
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        const errorMessage =
            typeof payload.error === "object" &&
            payload.error &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
                ? payload.error.message
                : undefined;
        throw new Error(
            errorMessage
                ? `OpenRouter error: ${errorMessage}`
                : "OpenRouter returned no completion choices."
        );
    }

    const choice = choices[0];
    if (!choice || typeof choice !== "object") {
        throw new Error("OpenRouter returned an invalid completion choice.");
    }

    return choice as Record<string, unknown>;
};

const getCompletionMessage = (choice: Record<string, unknown>) => {
    const message = choice.message;
    if (!message || typeof message !== "object") {
        const finishReason =
            typeof choice.finish_reason === "string" ? choice.finish_reason : "unknown";
        throw new Error(`OpenRouter returned no assistant message (finish_reason=${finishReason}).`);
    }

    return message as Record<string, unknown>;
};

const appendInternalTurnNote = (messages: OpenRouterMessage[], turn: number, note: string) => {
    const trimmed = note.trim().slice(0, WORKSPACE_AI_TURN_NOTE_MAX_CHARS);
    if (!trimmed) return;

    messages.push({
        role: "user",
        content: `${INTERNAL_TURN_NOTE_PREFIX}\nTurn ${turn}: ${trimmed}`,
    });
};

export const handleWorkspaceAiRequest = async (
    req: AiWorkspaceRequest,
    auth: string | undefined,
    progressReporter?: (p: AiProgressEvent) => void
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

    const thinkingId = randomUUID();
    const draftId = randomUUID();
    let lastThinkingEmit = 0;
    let lastDraftEmit = 0;
    let accumulatedReasoning = "";

    const emitProgress = (
        kind: AiProgressEvent["kind"],
        message: string,
        detail?: string,
        id?: string
    ) => {
        if (!progressReporter) return;

        progressReporter({
            id: id || randomUUID(),
            kind,
            message,
            ...(detail ? { detail } : {}),
            timestamp: Date.now(),
        } satisfies AiProgressEvent);
    };

    const emitThinking = (text: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastThinkingEmit < 50) return;
        lastThinkingEmit = now;
        emitProgress("thinking", text || "Thinking…", undefined, thinkingId);
    };

    const emitDraft = (text: string, force = false) => {
        const now = Date.now();
        if (!force && now - lastDraftEmit < 50) return;
        lastDraftEmit = now;
        emitProgress("assistant_draft", text, undefined, draftId);
    };

    const baseModelConfig = resolveWorkspaceAiModel(req.modelId);
    const modelConfig = applyThinkingLevel(baseModelConfig, req.thinkingLevel);
    const kanbanFullAllowed = req.scope?.workspaceSummary?.kanbanFullAllowed ?? true;
    const maxTurns = resolveMaxModelTurns(kanbanFullAllowed);

    log("Prompt received", {
        projectId: req.projectId,
        modelId: req.modelId,
        kanbanFullAllowed,
        historyCount: req.history.length,
    });

    emitProgress("status", "Preparing workspace…");
    const workspace = await materializeWorkspace(req.projectId, auth, req.scope);
    workspace.boardRefs = buildBoardRefIndex(
        workspace.board.kanbanData,
        workspace.board.name,
        WORKSPACE_AI_BOARD_INDEX_MAX_LINES
    );

    const staticSystemPrompt = buildStaticSystemPrompt(maxTurns);
    const variableSystemContext = buildVariableSystemContext(req.scope, {
        boardIndexText: kanbanFullAllowed ? workspace.boardRefs.indexText : undefined,
        kanbanFullAllowed,
        kanban: workspace.board.kanbanData,
    });

    const queuedCardsContext = buildQueuedTaskCardsContext(req.scope);
    const lastUserIndex = [...req.history].map((m, i) => ({ m, i })).reverse().find((entry) => entry.m.role === "user")?.i;
    const historyMessages: OpenRouterMessage[] = req.history.map((m, index) => {
        if (m.role !== "user" || !queuedCardsContext || index !== lastUserIndex) {
            return { role: m.role, content: m.text };
        }
        return { role: m.role, content: `${m.text}\n\n${queuedCardsContext}`.trim() };
    });

    let messages: OpenRouterMessage[] = [
        { role: "system", content: staticSystemPrompt },
        ...(variableSystemContext ? [{ role: "system", content: variableSystemContext }] : []),
        ...historyMessages,
    ];

    let reply = "";
    let turns = 0;
    const counters = createToolRunCounters();
    let lastCacheUsage = 0;

    try {
        while (turns < maxTurns) {
            turns++;
            emitProgress("status", "Working…");
            log("AI requesting", { turn: turns, model: modelConfig.model });

            const { response, usage } = await fetchCompletionJson(messages, true, modelConfig, {
                promptCache: true,
            });
            if (usage.cachedTokens) lastCacheUsage = usage.cachedTokens;
            log("OpenRouter usage", { turn: turns, ...usage });

            const choice = getCompletionChoice(response);
            const message = getCompletionMessage(choice);

            const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
            log("AI response received", { turn: turns, toolCalls: toolCalls.length });

            if (toolCalls.length > 0) {
                messages.push(message);
                const toolNames: string[] = [];

                for (const call of toolCalls) {
                    const name =
                        call.function && typeof call.function === "object"
                            ? String((call.function as Record<string, unknown>).name || "")
                            : "";
                    toolNames.push(name);
                    let args: Record<string, unknown>;

                    try {
                        args = parseToolArguments(
                            call.function && typeof call.function === "object"
                                ? (call.function as Record<string, unknown>).arguments
                                : {}
                        );
                    } catch (error) {
                        const result = `{"ok":false,"error":"Invalid tool arguments. ${error instanceof Error ? error.message : ""}"}`;
                        messages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: result,
                        });
                        continue;
                    }

                    const label = humanizeToolCall(name, args, workspace);
                    emitProgress("tool_call", label, truncate(JSON.stringify(args), 180));

                    let result = "";
                    try {
                        result = await executeWorkspaceTool(
                            name,
                            args,
                            workspace,
                            req.scope,
                            counters
                        );
                    } catch (error) {
                        result = JSON.stringify({
                            ok: false,
                            error: error instanceof Error ? error.message : "Tool execution failed.",
                        });
                    }

                    emitProgress(
                        "tool_result",
                        summarizeToolResult(name, result),
                        truncate(result, 180)
                    );

                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result,
                    });
                }

                const reasoningNote = accumulatedReasoning
                    ? ` Reasoning snapshot: ${accumulatedReasoning.slice(0, 200)}`
                    : "";
                appendInternalTurnNote(
                    messages,
                    turns,
                    `Completed tools: ${toolNames.join(", ") || "none"}.${reasoningNote}`
                );
                accumulatedReasoning = "";
                continue;
            }

            emitProgress("status", "Writing reply…");
            accumulatedReasoning = "";
            try {
                const streamed = await fetchCompletionStream(
                    messages,
                    modelConfig,
                    {
                        onContentDelta: (_delta, accumulated) => emitDraft(accumulated),
                        onReasoningDelta: (_delta, accumulated) => {
                            accumulatedReasoning = accumulated;
                            emitThinking(accumulated);
                        },
                    },
                    { promptCache: true }
                );
                reply = streamed.content.trim();
                emitDraft(reply, true);
                if (streamed.reasoning) {
                    accumulatedReasoning = streamed.reasoning;
                    emitThinking(streamed.reasoning, true);
                }
                messages.push({ role: "assistant", content: reply });
            } catch (streamError) {
                log("Stream failed, using non-streamed content", { streamError });
                reply = messageContent(message.content).trim();
                if (reply) emitDraft(reply, true);
            }
            break;
        }

        if (!reply) {
            log("No direct text reply, requesting summary", { turns });
            appendInternalTurnNote(
                messages,
                turns,
                "Summarize what you changed or reviewed. Tell the user to review staged changes in the UI if any."
            );
            emitProgress("status", "Summarizing…");
            const streamed = await fetchCompletionStream(
                messages,
                modelConfig,
                {
                    onContentDelta: (_delta, accumulated) => emitDraft(accumulated),
                    onReasoningDelta: (_delta, accumulated) => emitThinking(accumulated),
                },
                { promptCache: true }
            );
            reply = streamed.content.trim() || "I reviewed the workspace.";
            emitDraft(reply, true);
        }

        reply = sanitizeUserFacingReply(reply);

        const proposals = await collectWorkspaceProposals(workspace, req.scope);
        const toolActions = [...new Set(proposals.map((proposal) => proposal.target as WorkspaceAction))];

        if (proposals.length > 0) {
            const applyLine =
                proposals.length === 1
                    ? "Review the staged change below, then apply it to save it to the project."
                    : "Review the staged changes below, then apply them to save them to the project.";
            reply = reply.trim() ? `${reply.trim()}\n\n${applyLine}` : applyLine;
            emitProgress("status", "Changes are ready to review.");
        } else if (workspace.board.editCallCount > 0 || workspace.page.editCallCount > 0) {
            const noStageLine = "No board or page changes were staged to apply.";
            reply = reply.trim() ? `${reply.trim()}\n\n${noStageLine}` : noStageLine;
            emitProgress("status", "No project changes were staged.");
        }

        log("Final reply", {
            replySnippet: truncate(reply, 300),
            turns,
            proposals: proposals.length,
            cachedTokens: lastCacheUsage,
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
                toolCallsUsed: counters.toolCalls,
                toolCallsMax: WORKSPACE_AI_MAX_TOOL_CALLS,
                kanbanReadsUsed: 0,
                kanbanReadsMax: 0,
                scratchpadReadsUsed: 0,
                scratchpadReadsMax: 0,
                ...(counters.toolCalls >= WORKSPACE_AI_MAX_TOOL_CALLS ? { capReached: true } : {}),
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

void OpenRouterTools;
