import * as vscode from "vscode";
import { ExecuteCommandRequest, LanguageClient } from "vscode-languageclient/node";

/**
 * Analysis, asked for and shown.
 *
 * The server offers one code lens per analysis kind and answers the command
 * behind it with a typed report. Two things follow, and this file is both of
 * them: VS Code executes a lens's command through its own registry, so the
 * command has to exist on this side and forward; and an analysis is an
 * observation rather than a mistake, so the report is shown in a document of
 * its own instead of the problems pane.
 *
 * Nothing here analyzes. Every sentence displayed — the method, the
 * assumptions, each finding, each criterion and where it is cited from — is
 * the server's own text, moved into markdown. The one judgement this file
 * makes is the order to read them in.
 */
const ANALYZE = "musa.analyze";
const REPORT_SCHEME = "musa-analysis";

/** The reports rendered so far, keyed by the virtual document showing them. */
const reports = new Map<string, string>();
const changed = new vscode.EventEmitter<vscode.Uri>();

export function registerAnalysis(
  context: vscode.ExtensionContext,
  client: () => LanguageClient | undefined,
): void {
  const provider: vscode.TextDocumentContentProvider = {
    onDidChange: changed.event,
    provideTextDocumentContent: (uri) => reports.get(uri.toString()) ?? "",
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(REPORT_SCHEME, provider),
    vscode.commands.registerCommand(ANALYZE, async (document: string, kind: string) => {
      const running = client();
      if (!running) {
        void vscode.window.showErrorMessage("The musa language server is not running.");
        return;
      }
      let report: AnalysisReport;
      try {
        report = (await running.sendRequest(ExecuteCommandRequest.type, {
          command: ANALYZE,
          arguments: [document, kind],
        })) as AnalysisReport;
      } catch (error) {
        // A refused analysis is a refusal, not an empty report: a reader
        // shown zero findings would conclude the music is clean.
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`musa: ${message}`);
        return;
      }
      const uri = vscode.Uri.parse(`${REPORT_SCHEME}:${kind}.md`);
      reports.set(uri.toString(), render(report));
      changed.fire(uri);
      await vscode.commands.executeCommand("markdown.showPreviewToSide", uri);
    }),
  );
}

/** The shape the server sends. Read, never constructed here. */
interface AnalysisReport {
  kind: string;
  method: string;
  profile?: string;
  assumptions: string[];
  findings: Finding[];
}

interface Finding {
  code: string;
  standing: string;
  summary: string;
  bar: number;
  beat: { numerator: number; denominator: number };
  grounds?: Ground[];
  rule?: { id: string; states: string; strength: string; cites: string };
}

interface Ground {
  criterion: string;
  satisfied: boolean;
  cites: string;
}

/** An exact rational the way a person reads it: `3` or `3/8`, never `0.375`. */
function fraction(value: { numerator: number; denominator: number }): string {
  return value.denominator === 1 ? `${value.numerator}` : `${value.numerator}/${value.denominator}`;
}

/**
 * The report as markdown, in the order a reader needs it: what ran, what it
 * assumed, then what it saw — and under each finding, what it was judged
 * against, because that is what makes a reading arguable.
 */
function render(report: AnalysisReport): string {
  const lines = [`# Analysis: ${report.kind}`, "", report.method + ".", ""];
  if (report.profile) {
    lines.push(`Read against the **${report.profile}** profile.`, "");
  }
  lines.push("## Assumptions", "");
  for (const assumption of report.assumptions) {
    lines.push(`- ${assumption}`);
  }
  lines.push("", `## Findings (${report.findings.length})`, "");
  if (report.findings.length === 0) {
    lines.push("Nothing to report for this reading.");
  }
  for (const finding of report.findings) {
    lines.push(
      `### bar ${finding.bar} · beat ${fraction(finding.beat)} — ${finding.summary}`,
      "",
      `\`${finding.code}\` · *${finding.standing}*`,
      "",
    );
    if (finding.rule) {
      lines.push(
        `Rule \`${finding.rule.id}\` (${finding.rule.strength}): ${finding.rule.states} — ${finding.rule.cites}`,
        "",
      );
    }
    for (const ground of finding.grounds ?? []) {
      lines.push(`- ${ground.satisfied ? "✓" : "✗"} ${ground.criterion} — ${ground.cites}`);
    }
    if ((finding.grounds ?? []).length > 0) {
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}
