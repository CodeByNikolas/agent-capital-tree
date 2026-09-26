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

const cloneSnippet = `git clone https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree`;

const installPwsh = `$actScript = (Resolve-Path -LiteralPath 'scripts/mcp-readonly-server.mjs').Path
$actNode = (Get-Command node).Source
codex mcp add kanoki -- $actNode $actScript
codex mcp get kanoki --json`;

const installBash = `test -f "$PWD/scripts/mcp-readonly-server.mjs" || { echo 'Run from checkout root' >&2; exit 1; }
codex mcp add kanoki -- "$(command -v node)" "$PWD/scripts/mcp-readonly-server.mjs"
codex mcp get kanoki --json`;

const imagePrompt = `For a new test vault, call kanoki.prepareRootSetup with label "my-demo-agent" and budgetRaw "100000". Show its dashboard graphic. Let the MCP open my normal system browser with my existing wallet extension; do not open a separate chat browser. I will review and sign there.`;

export function McpPanel({
  deployment,
  selectedNode,
  runtimeLabel,
}: {
  deployment: PublicDeployment;
  selectedNode: VaultNode | undefined;
  runtimeLabel: string;
}) {
  const demoRoot = `capital.${deployment.namespaceName}`;
  // The separate keyless server always uses the canonical current deployment.
  const chatPrompt = 'Call kanoki.getTree with query "capital.kanoki.eth". Show the returned tree image in this chat and report its Sepolia block, observed time, Test-USDC balance and actual authorized actions. Do not use shell or web.';
  const capitalSnippet = `pnpm --filter @agent-capital-tree/multibaas build
pnpm --filter @agent-capital-tree/runtime build
pnpm mcp:capital check ${demoRoot}
pnpm mcp:capital settings ${demoRoot} --enable-sepolia-writes`;
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
        <span className="page-kicker">Kanoki</span>
        <h1>Kanoki in your chat.</h1>
        <p>
          Codex can read the capital tree through a local MCP. The dashboard reads Sepolia independently; it cannot
          see a local Codex session. Chat-managed capital needs one wallet authorization, but no Docker or model API key.
        </p>
      </div>

      <section className="panel mcp-panel" aria-labelledby="mcp-capital-title">
        <div className="panel-heading"><span className="panel-overline">Recommended demo</span><h2 id="mcp-capital-title">Authorize once. Manage capital in chat.</h2></div>
        <p>Build the SDK and plugin with the commands below first, then use capital mode. It starts the local signing companion automatically. No private JSON configuration, CLIProxyAPI account or separate companion terminal.</p>
        <CopyBlock code={capitalSnippet} label="Capital demo setup — Linux or Windows with WSL2 and Node 22+" />
        <p>Add the printed STDIO entry in Codex or Claude settings and restart that MCP once after updating its code. The capital connection exposes 23 tools. Use <code>selectCapitalRoot</code> to choose a confirmed root inside the same session; a tree read never changes the write target. No restart is needed for that selection.</p>
        <p>Flow: create root in your normal wallet browser → select its ENS in chat → <code>getCapitalSetup</code> → <code>prepareCapitalSetup</code> → review wallet authorization and remaining funding/gas → create child vaults. If the root is bound to your owner wallet instead of the local signer, <code>prepareOperatorRecovery</code> prepares an explicit owner-reviewed change; it never replaces the operator automatically.</p>
        <p>The demo input maximum is <strong>100000 raw units = 0.10 Test-USDC for the entire tree</strong>, not per child and not a contract balance cap. Two child vaults with 20000 raw units each leave 60000 at the root. Existing deposits are counted; do not fund again. Native Sepolia ETH for the local signer is separate. <code>createChildVault</code> launches no autonomous model process.</p>
        <p>Your wallet remains owner. It authorizes a separate local agent signing key once, with explicit vault limits. The agent needs native Sepolia-ETH for gas as well as Test-USDC in the vault. Wallet login or USDC approval alone is not that authorization or gas payment.</p>
        <p>Ask the chat to check all requirements, then create a child vault, delegate a small budget, show the tree, restrict/revoke and reclaim. <code>createChildVault</code> does not launch an autonomous model worker. Autonomous <code>spawnChild</code> also needs Docker and a model credential; the preferred setup uses a private OpenAI API key and works without CLIProxyAPI.</p>
      </section>

      {/* Identity + connection status */}
      <section className="panel mcp-panel" aria-labelledby="mcp-server-title">
        <div className="panel-heading">
          <span className="panel-overline">Full companion</span>
          <h2 id="mcp-server-title">
            <Plug size={18} aria-hidden="true" /> kanoki
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
          <div className="mcp-connection-node"><strong>Local keyless MCP</strong><span>Tree images + wallet-browser setup · no signer</span></div>
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
          The keyless Codex chat setup below exposes <code>getTree</code>, <code>visualizeTree</code> and <code>prepareRootSetup</code>. These 17 tools belong to the
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
                Type <code>/mcp</code> in Codex and confirm <code>kanoki</code>, then send this prompt.
                Expect chain 11155111, the current capital root and a recent block. This is a real MCP tool call, not a dashboard
                connection indicator.
              </small>
              <CopyBlock code={chatPrompt} label="read-only Codex chat prompt" />
              <CopyBlock code={imagePrompt} label="prepare a wallet-approved root from chat" />
              <small>
                Every tool response includes a dashboard-style PNG and a real image link, including setup, actions and errors.
                Tree data and image pages use the same block. Codex is instructed to show them in the chat; Mermaid is the fallback.
                For an independent foreground connection status
                window, run <code>pnpm mcp:desktop</code>; Codex and Claude start their own STDIO connections.
              </small>
            </div>
          </li>
          <li className="setup-step">
            <span>4</span>
            <div>
              <strong>Authorize your chat agent once</strong>
              <small>
                Setup automatically opens your normal system browser with its existing wallet extensions. Use that profile to connect and sign;
                a separate chat-controlled browser may have no wallet injection. Root creation and funding require your approval there. Later Child creation,
                delegation and recovery use capital mode above: a local authorized agent key, no Docker or CLIProxyAPI. No
                owner-wallet popup is needed for each Child. On Windows use WSL2 with Node. ChatGPT web cannot run this local STDIO MCP.
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
