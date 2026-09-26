import { CircleDashed, Plug, ShieldCheck } from "lucide-react";
import { CopyBlock } from "@/components/copy-block";
import { InfoHint } from "@/components/info-hint";
import { mcpServerMeta, mcpTools } from "@/lib/mcp-tools";
import type { PublicDeployment } from "@/lib/deployment";
import type { VaultNode } from "@/lib/dashboard-types";

const verifySnippet = `pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @agent-capital-tree/sdk build
pnpm --filter @agent-capital-tree/plugin build
pnpm mcp:doctor
pnpm mcp:verify
pnpm mcp:chat-verify
pnpm mcp:settings`;

const cloneSnippet = `git clone --branch work/rami https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree`;

const installPwsh = `$actScript = (Resolve-Path -LiteralPath 'scripts/mcp-readonly-server.mjs').Path
$actNode = (Get-Command node).Source
codex mcp add capital_tree_readonly -- $actNode $actScript
codex mcp get capital_tree_readonly --json`;

const installBash = `test -f "$PWD/scripts/mcp-readonly-server.mjs" || { echo 'Run from checkout root' >&2; exit 1; }
codex mcp add capital_tree_readonly -- "$(command -v node)" "$PWD/scripts/mcp-readonly-server.mjs"
codex mcp get capital_tree_readonly --json`;

const chatPrompt = `Call capital_tree_readonly.getTree with query "hello.agentcapitalusdc.eth". Show the returned tree image in this chat and report its Sepolia block, observed time, Test-USDC balance and actual authorized actions. Do not use shell or web.`;
const imagePrompt = `For a new test vault, call capital_tree_readonly.prepareRootSetup with label "my-demo-agent" and budgetRaw "100000". Give me its wallet-review link; do not claim any transaction was sent.`;

export function McpPanel({
  deployment,
  selectedNode,
  runtimeLabel,
}: {
  deployment: PublicDeployment;
  selectedNode: VaultNode | undefined;
  runtimeLabel: string;
}) {
  const serverFacts: [string, string][] = [
    ["Server name", mcpServerMeta.name],
    ["Transport", mcpServerMeta.transport],
    ["Endpoint", mcpServerMeta.endpoint],
    ["Auth", mcpServerMeta.auth],
    ["Timeouts", `${mcpServerMeta.readTimeout} · ${mcpServerMeta.writeTimeout}`],
    ["Verified with", mcpServerMeta.codexVerified],
    ["Vault runtime", runtimeLabel],
  ];

  const deploymentFacts: [string, string][] = [
    ["Network", `${deployment.network} (chainId ${deployment.chainId})`],
    ["Controller", deployment.controllerAddress ?? "not deployed yet"],
    ["ENS namespace", deployment.namespaceName],
    ["Selected vault", selectedNode?.ensName ?? "—"],
  ];

  return (
    <>
      <div className="page-heading">
        <span className="page-kicker">Agent interface</span>
        <h1>MCP integration</h1>
        <p>
          Codex can read the capital tree through a local MCP. The dashboard reads Sepolia independently; it cannot
          see a local Codex session. Financial actions require a separate companion and your own wallet authority.
        </p>
      </div>

      {/* Identity + connection status */}
      <section className="panel mcp-panel" aria-labelledby="mcp-server-title">
        <div className="panel-heading">
          <span className="panel-overline">Full companion</span>
          <h2 id="mcp-server-title">
            <Plug size={18} aria-hidden="true" /> capital-tree
          </h2>
        </div>
        <div className="mcp-status mcp-status-idle" role="status">
          <CircleDashed size={16} className="mcp-status-icon" aria-hidden="true" />
          <span>Local Codex MCP connection not observable here</span>
        </div>
        <p className="mcp-lede">Vault runtime state comes from dashboard data <InfoHint term="runtime" />; it does not prove your Codex MCP is connected.</p>
        <div className="mcp-facts-groups">
          <dl className="mcp-facts">
            {serverFacts.map(([key, value]) => (
              <div key={key} className="mcp-fact">
                <dt>{key}</dt>
                <dd><code>{value}</code></dd>
              </div>
            ))}
          </dl>
          <dl className="mcp-facts">
            {deploymentFacts.map(([key, value]) => (
              <div key={key} className="mcp-fact">
                <dt>{key}</dt>
                <dd><code>{value}</code></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="panel mcp-panel" aria-labelledby="mcp-connection-title">
        <div className="panel-heading">
          <span className="panel-overline">Connection path</span>
          <h2 id="mcp-connection-title">What actually connects</h2>
        </div>
        <div className="mcp-connection-flow" aria-label="Codex uses the local MCP to read Sepolia; the dashboard reads Sepolia independently">
          <div className="mcp-connection-node"><strong>Codex chat</strong><span>Check <code>/mcp</code> in the desktop app</span></div>
          <span className="mcp-connection-arrow" aria-hidden="true">→</span>
          <div className="mcp-connection-node"><strong>Local read-only MCP</strong><span><code>getTree</code> + <code>visualizeTree</code> · no signer</span></div>
          <span className="mcp-connection-arrow" aria-hidden="true">→</span>
          <div className="mcp-connection-node"><strong>Sepolia</strong><span>Current block and vaults</span></div>
        </div>
        <p className="mcp-lede">This website also reads Sepolia. A successful <code>getTree</code> call in Codex and a matching vault here demonstrate the shared chain state; there is no browser-to-Codex connection or automatic live badge.</p>
      </section>

      {/* Tool catalog */}
      <section className="panel mcp-panel" aria-labelledby="mcp-tools-title">
        <div className="panel-heading">
          <span className="panel-overline">Catalog</span>
          <h2 id="mcp-tools-title">Full companion tools ({mcpTools.length})</h2>
        </div>
        <p className="mcp-lede">
          The simple Codex chat setup below exposes only <code>getTree</code> and <code>visualizeTree</code>. These 16 tools belong to the separate
          authenticated Linux companion; discovery in the temporary verifier does not make them all usable. Read tools
          inspect chain state; write tools request bounded on-chain actions. Every schema is strict — a
          model-supplied <code>agentId</code> is rejected, and node IDs in arguments are targets, never proof of authority.
        </p>
        <ul className="mcp-tools" aria-label="MCP tools">
          {mcpTools.map((tool) => (
            <li key={tool.name} className="mcp-tool">
              <div className="mcp-tool-head">
                <code>{tool.name}</code>
                <span className={tool.readOnly ? "mcp-tag mcp-tag-read" : "mcp-tag mcp-tag-write"}>
                  {tool.readOnly ? "Read" : "Write"}
                </span>
              </div>
              <p>{tool.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Setup guide */}
      <section className="panel mcp-panel" aria-labelledby="mcp-setup-title">
        <div className="panel-heading">
          <span className="panel-overline">Setup guide</span>
          <h2 id="mcp-setup-title">Use it in a Codex chat</h2>
        </div>
        <p className="mcp-lede">
          Run these commands from a checkout containing <code>package.json</code>. If you are already in the project,
          do not clone it again. The automated checks are temporary; the next step registers a persistent keyless
          MCP for Codex in the ChatGPT desktop app.
        </p>

        <ol className="setup-steps mcp-steps">
          <li className="setup-step">
            <span>1</span>
            <div>
              <strong>Build and verify</strong>
              <small>
                Install Node 22 or newer, pnpm and Codex CLI. Internet access to the public app and Sepolia RPC is
                required. No wallet, Docker, runtime token or team laptop is needed.
              </small>
              <details className="setup-disclosure mcp-path">
                <summary>New laptop only: clone the project once</summary>
                <small>If you already see <code>package.json</code> in this folder, skip this step.</small>
                <CopyBlock code={cloneSnippet} label="clone the current branch once" />
              </details>
              <CopyBlock code={verifySnippet} label="read-only MCP verification commands" />
            </div>
          </li>
          <li className="setup-step">
            <span>2</span>
            <div>
              <strong>Register in your personal Codex profile</strong>
              <small>
                Run one shell-specific block from the checkout root. CLI and ChatGPT desktop share MCP configuration.
                Alternatively use desktop Settings → MCP servers → Add server → STDIO with the command and argument
                printed by <code>pnpm mcp:settings</code>, then restart. Do not register both routes under different names.
              </small>
              <span className="mcp-shell-tag">PowerShell · Windows</span>
              <CopyBlock code={installPwsh} label="register read-only MCP in PowerShell" />
              <span className="mcp-shell-tag">Bash · macOS / Linux</span>
              <CopyBlock code={installBash} label="register read-only MCP in Bash" />
            </div>
          </li>
          <li className="setup-step">
            <span>3</span>
            <div>
              <strong>Call it from a new Codex chat</strong>
              <small>
                Type <code>/mcp</code> in Codex and confirm <code>capital_tree_readonly</code>, then send this prompt.
                Expect chain 11155111, the hello root and a recent block. This is a real MCP tool call, not a dashboard
                connection indicator.
              </small>
              <CopyBlock code={chatPrompt} label="read-only Codex chat prompt" />
              <CopyBlock code={imagePrompt} label="prepare a wallet-approved root from chat" />
              <small>
                Every Tree result contains a PNG and Mermaid fallback from the same block. For an independent foreground connection status
                window, run <code>pnpm mcp:desktop</code>; Codex and Claude start their own STDIO connections.
              </small>
            </div>
          </li>
          <li className="setup-step">
            <span>4</span>
            <div>
              <strong>Financial actions are a separate setup</strong>
              <small>
                Root creation and funding are signed in the browser wallet opened from the chat link. Later Child creation,
                delegation and recovery use the 16-tool Linux companion, an authorized operator and CLIProxyAPI; no
                owner-wallet popup is needed for each Child. On Windows use WSL2. ChatGPT web cannot run this local STDIO MCP.
              </small>
            </div>
          </li>
        </ol>
      </section>

      {/* Security posture */}
      <section className="panel mcp-panel mcp-security" aria-labelledby="mcp-security-title">
        <div className="panel-heading">
          <span className="panel-overline">Security</span>
          <h2 id="mcp-security-title">
            <ShieldCheck size={18} aria-hidden="true" /> What the plugin cannot do
          </h2>
        </div>
        <ul className="mcp-security-list">
          <li>The keyless chat server holds no wallet key or provider credential. Its setup link never signs a transaction.</li>
          <li>In full Linux companion mode, the MCP token is a local <code>0600</code> file, re-issued on every start and never printed to the terminal.</li>
          <li>The companion binds the bearer to the real root/worker context; a model-supplied <code>agentId</code> is rejected.</li>
          <li>On an uncertain write, tools never claim success — reconcile with <code>getOperationStatus</code> or the chain before retrying.</li>
        </ul>
      </section>
    </>
  );
}
