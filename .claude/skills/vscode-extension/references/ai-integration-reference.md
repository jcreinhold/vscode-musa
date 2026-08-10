# VS Code AI Integration Reference

How to integrate VS Code extensions with AI features: chat participants, language model tools, MCP servers, and Claude
Code.

## Table of contents

1. [Chat Participant API](#chat-participant-api)
1. [Language Model API](#language-model-api)
1. [Language Model Tools](#language-model-tools)
1. [MCP servers in VS Code](#mcp-servers-in-vs-code)
1. [Extension-to-extension communication](#extension-to-extension-communication)
1. [Claude Code integration](#claude-code-integration)
1. [Integration strategy for Musa](#integration-strategy-for-musa)

______________________________________________________________________

## Chat Participant API

Chat participants are domain-specific AI assistants that users invoke with @-mentions in VS Code chat.

### Declaration (package.json)

```json
"contributes": {
  "chatParticipants": [{
    "id": "musa.proof-search",
    "name": "musa",
    "fullName": "Musa Proof Assistant",
    "description": "Search proofs, query types, and explore the Musa type system",
    "isSticky": false,
    "commands": [
      { "name": "prove", "description": "Search for a proof of a proposition" },
      { "name": "type", "description": "Look up the type of a term" },
      { "name": "effects", "description": "Show effect information for an expression" },
      { "name": "expand", "description": "Expand a motif into its occurrences" }
    ]
  }],
  "chatParticipantDisambiguation": [{
    "category": "musa",
    "description": "User wants to search proofs, look up types, explore effects, or query the Musa language",
    "examples": [
      "Find a proof that addition is commutative",
      "What's the type of transport?",
      "What effects does this handler handle?"
    ]
  }]
}
```

### Handler implementation

```typescript
const handler: vscode.ChatRequestHandler = async (request, context, stream, token) => {
  // request.prompt -- the user's message text
  // request.command -- which slash command was used (or undefined)
  // request.model -- the language model instance
  // request.references -- #-mentioned files and selections
  // context.history -- prior messages where @musa was mentioned

  if (request.command === "prove") {
    stream.progress("Searching proofs...");

    // Run proof search using the Musa compiler/prover
    const results = await runKanProver(request.prompt);

    // Optionally use the LLM to interpret results
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `Here are proof search results:\n${results}\nExplain and suggest the best approach.`,
      ),
    ];
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }

    return { metadata: { command: "prove" } };
  }

  if (request.command === "type") {
    // Look up type from the language server
    const typeInfo = await queryType(request.prompt);
    stream.markdown(`\`\`\`musa\n${typeInfo}\n\`\`\``);
    return { metadata: { command: "type" } };
  }

  // Default: use LLM with Musa context
  stream.markdown("I can help with Musa language questions. Use `/prove`, `/type`, or `/effects`.");
};

const participant = vscode.chat.createChatParticipant("musa.proof-search", handler);
participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
```

### Key APIs

- `stream.markdown(text)` -- stream markdown content
- `stream.progress(message)` -- show progress indicator
- `stream.reference(uri)` -- link to a file
- `stream.button(command)` -- show an actionable button
- `stream.filetree(items, baseUri)` -- render a file tree
- `stream.codeblock(code, language)` -- render code block

### Disambiguation

The `chatParticipantDisambiguation` contribution lets VS Code auto-route queries to your participant without explicit
@-mention. Provide category descriptions and example prompts.

______________________________________________________________________

## Language Model API

Use LLMs directly from any extension context (not just chat participants).

### Selecting a model

```typescript
const [model] = await vscode.lm.selectChatModels({
  vendor: "copilot",
  family: "gpt-4o",
});
```

Filter by: `vendor`, `id`, `family`, `version`. Available families include `gpt-4o`, `claude-3.5-sonnet`, `o1`, etc.

### Sending requests

```typescript
const messages = [vscode.LanguageModelChatMessage.User("What is the type of `transport` in HoTT?")];

const response = await model.sendRequest(messages, {}, token);
for await (const fragment of response.text) {
  // Process streaming response
  outputChannel.append(fragment);
}
```

### Error handling

```typescript
try {
  const response = await model.sendRequest(messages, {}, token);
} catch (err) {
  if (err instanceof vscode.LanguageModelError) {
    if (err.code === vscode.LanguageModelError.NotFound.name) {
      // Model not available
    } else if (err.code === vscode.LanguageModelError.NoPermissions.name) {
      // User declined consent
    }
  }
}
```

### Token budgeting

Models expose `maxInputTokens`. Use `model.countTokens(messages)` to estimate usage before sending.

______________________________________________________________________

## Language Model Tools

Extensions can register tools that AI assistants (Copilot, Claude Code agent mode) can invoke.

### Declaration (package.json)

```json
"contributes": {
  "languageModelTools": [{
    "name": "musa_lookupType",
    "displayName": "Look up Musa type",
    "modelDescription": "Looks up the type of a Musa identifier or expression in the current project. Returns the type signature and any associated documentation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "term": {
          "type": "string",
          "description": "The term or identifier to look up"
        },
        "file": {
          "type": "string",
          "description": "Optional file path for context"
        }
      },
      "required": ["term"]
    },
    "canBeReferencedInPrompt": true,
    "toolReferenceName": "musaType"
  }, {
    "name": "musa_motifSearch",
    "displayName": "Search Musa proofs",
    "modelDescription": "Searches for proofs of a given proposition in the Musa project. Uses the type checker to find inhabitants of a type.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "goal": {
          "type": "string",
          "description": "The proposition to prove (as a Musa type)"
        },
        "depth": {
          "type": "number",
          "description": "Search depth limit"
        }
      },
      "required": ["goal"]
    },
    "canBeReferencedInPrompt": true,
    "toolReferenceName": "musaProve"
  }]
}
```

### Implementation

```typescript
class MusaTypeTool implements vscode.LanguageModelTool<{ term: string; file?: string }> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<{ term: string; file?: string }>,
    token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Looking up type of \`${options.input.term}\``,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ term: string; file?: string }>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const typeInfo = await queryKanType(options.input.term, options.input.file);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(typeInfo)]);
  }
}

// Register during activation
context.subscriptions.push(vscode.lm.registerTool("musa_lookupType", new MusaTypeTool()));
```

### Invocation flow

In agent mode, the LLM sees tool definitions (including `modelDescription`), decides to call them based on the user's
prompt, VS Code validates parameters against `inputSchema`, then invokes the tool. Users can also explicitly reference
tools via `#musaType` in chat.

______________________________________________________________________

## MCP servers in VS Code

Extensions can contribute MCP (Model Context Protocol) server definitions. MCP tools appear in agent mode alongside
Language Model Tools.

### Extension-contributed MCP servers

```json
"contributes": {
  "mcpServerDefinitionProviders": [{
    "id": "musaMcpProvider",
    "label": "Musa Language Server MCP"
  }]
}
```

```typescript
class KanMcpProvider implements vscode.McpServerDefinitionProvider {
  provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
    return [
      {
        label: "Musa Compiler",
        serverDefinition: {
          type: "stdio",
          command: "musa-mcp",
          args: ["--project", workspaceRoot],
        },
      },
    ];
  }

  resolveMcpServerDefinition(def: vscode.McpServerDefinition): vscode.McpServerDefinition {
    return def;
  }

  onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>().event;
}
```

### User-configured MCP servers

Users can also configure MCP servers in `.vscode/mcp.json`:

```json
{
  "servers": {
    "musa-prover": {
      "type": "stdio",
      "command": "musa-prover-mcp",
      "args": ["--workspace", "${workspaceFolder}"]
    }
  }
}
```

### MCP vs Language Model Tools

| Feature      | Language Model Tools                | MCP Servers                        |
| ------------ | ----------------------------------- | ---------------------------------- |
| Runs in      | Extension Host (VS Code API access) | Separate process                   |
| Cross-client | VS Code only                        | Any MCP client (Claude Code, etc.) |
| Setup        | Extension dependency                | Configuration or extension         |
| Best for     | VS Code-specific queries            | Reusable compiler/prover tools     |

______________________________________________________________________

## Extension-to-extension communication

### Exported API via activate()

Whatever an extension returns from `activate()` becomes available via `vscode.extensions.getExtension()`:

```typescript
// Provider extension (e.g., musa extension)
export function activate(context: vscode.ExtensionContext) {
  return {
    getProofState: (uri: string, position: Position) => {
      /* ... */
    },
    getType: (uri: string, term: string) => {
      /* ... */
    },
  };
}

// Consumer extension
const musaExt = vscode.extensions.getExtension("publisher.vscode-musa");
if (musaExt) {
  await musaExt.activate();
  const api = musaExt.exports;
  const state = api.getProofState(uri, pos);
}
```

Declare hard dependencies via `extensionDependencies` to ensure activation order.

### Commands

Most robust cross-extension mechanism. Commands are automatically routed regardless of extension host location:

```typescript
// Register
vscode.commands.registerCommand("musa.getType", async (uri, position) => {
  return await getTypeAtPosition(uri, position);
});

// Invoke from another extension
const type = await vscode.commands.executeCommand("musa.getType", uri, pos);
```

### Shared state

- `ExtensionContext.globalState` -- key-value store, can sync across machines
- `ExtensionContext.workspaceState` -- workspace-scoped
- `ExtensionContext.secrets` -- encrypted secret storage

______________________________________________________________________

## Claude Code integration

### Current state

Claude Code (`anthropic.claude-code`) does not expose a public extension API. Other extensions cannot programmatically
send prompts or receive responses.

### Available integration points

1. **IDE MCP server:** Claude Code runs a local MCP server with tools including `mcp__ide__getDiagnostics` (reads VS
    Code's Problems panel). The Musa extension contributes diagnostics automatically -- Claude Code can see them.

1. **URI handler:** `vscode://anthropic.claude-code/open?prompt=<encoded>` pre-fills the chat with a prompt. Extensions
    can open this URI programmatically.

1. **MCP server consumption:** Claude Code consumes MCP servers configured in `~/.claude/settings.json`. A Musa MCP
    server registered there would be available to Claude Code in all projects.

1. **Plugin system:** Claude Code plugins package slash commands, subagents, hooks, and MCP servers. A Musa plugin could
    provide `/prove`, `/type`, etc.

1. **Context mechanisms:** Claude Code picks up `@file` mentions, selected text, and diagnostics automatically. The best
    integration path is ensuring the Musa extension produces rich diagnostics, hover info, and code actions that Claude
    Code can observe.

### Practical integration

The most impactful integration: **ensure the Musa LSP produces excellent diagnostics and code actions.** Claude Code
already reads VS Code diagnostics. If the Musa server reports "Expected type `Int64` at line 5, got `String`" with a code
action to fix it, Claude Code can see and act on that.

For deeper integration, an MCP server wrapping `musa-prover` or compiler queries works with both VS Code agent mode and
Claude Code.

______________________________________________________________________

## Integration strategy for Musa

Three layers, from most reusable to most VS Code-specific:

### Layer 1: MCP server (highest reusability)

Build an MCP server wrapping Musa compiler queries and `musa-prover`. Works with VS Code agent mode, Claude Code, and any
MCP client.

Tools to expose:

- `musa_compile` -- elaborate and compile a document
- `musa_motif_expansions` -- show a motif definition's expansions
- `musa_diagnostics` -- get compiler diagnostics for a file
- `musa_timeline` -- show the elaborated kernel timeline
- `musa_render_plan` -- show the notation plan for a score

### Layer 2: Language Model Tools (VS Code-specific)

Register tools in the extension that use the VS Code API and language client:

- `musa_lookupType` -- type lookup with editor context (current file, cursor position)
- `musa_motifSearch` -- proof search with project context
- `musa_motifExpansions` -- expansions of a motif definition

These tools can access the language client directly and provide richer context than the MCP server.

### Layer 3: Chat participant (richest UX)

Register `@musa` chat participant for interactive proof search and domain questions. Uses the Language Model API
internally, calls the language server for domain knowledge, and streams rich responses.

These layers are complementary. The MCP server is the foundation (works everywhere), Language Model Tools add VS Code
context, and the chat participant provides the richest interaction.
