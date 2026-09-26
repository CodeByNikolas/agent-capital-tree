import { Check, CircleDashed, Plug, ShieldCheck } from "lucide-react";
import { CopyBlock } from "@/components/copy-block";
import { InfoHint } from "@/components/info-hint";
import { mcpServerMeta, mcpTools } from "@/lib/mcp-tools";
import type { PublicDeployment } from "@/lib/deployment";
import type { VaultNode } from "@/lib/dashboard-types";

const verifySnippet = `git clone --branch work/rami https://github.com/CodeByNikolas/agent-capital-tree.git
cd agent-capital-tree
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @agent-capital-tree/sdk build
pnpm --filter @agent-capital-tree/plugin build
pnpm mcp:doctor
pnpm mcp:verify`;

export function McpPanel({
  deployment,
  selectedNode,
  runtimeLabel,
}: {
  deployment: PublicDeployment;
  selectedNode: VaultNode | undefined;
  runtimeLabel: string;
}) {
  const statusTone =
    runtimeLabel === "Runtime connected" ? "ok" : runtimeLabel === "Runtime status unknown" ? "warn" : "idle";
  const StatusIcon = statusTone === "ok" ? Check : CircleDashed;

  const serverFacts: [string, string][] = [
    ["Server name", mcpServerMeta.name],
    ["Transport", mcpServerMeta.transport],
    ["Endpoint", mcpServerMeta.endpoint],
    ["Auth", mcpServerMeta.auth],
    ["Timeouts", `${mcpServerMeta.readTimeout} · ${mcpServerMeta.writeTimeout}`],
    ["Verified with", mcpServerMeta.codexVerified],
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
          Agents don&apos;t call the contracts directly — they drive the tree through these MCP tools, served by
          <em> your own</em> local companion runtime. This dashboard holds no wallet key and no runtime token.
        </p>
      </div>

      {/* Identity + connection status */}
      <section className="panel mcp-panel" aria-labelledby="mcp-server-title">
        <div className="panel-heading">
          <span className="panel-overline">Server</span>
          <h2 id="mcp-server-title">
            <Plug size={18} aria-hidden="true" /> capital-tree
          </h2>
        </div>
        <div className={`mcp-status mcp-status-${statusTone}`} role="status">
          <StatusIcon size={16} className="mcp-status-icon" aria-hidden="true" />
          <span>{runtimeLabel}</span>
          <InfoHint term="runtime" />
        </div>
        <p className="mcp-lede">This is dashboard data, not a live check of a Codex MCP process on your laptop.</p>
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

      {/* Tool catalog */}
      <section className="panel mcp-panel" aria-labelledby="mcp-tools-title">
        <div className="panel-heading">
          <span className="panel-overline">Catalog</span>
          <h2 id="mcp-tools-title">Tools ({mcpTools.length})</h2>
        </div>
        <p className="mcp-lede">
          Read tools inspect chain state; write tools request bounded on-chain actions. Every schema is strict — a
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
          <h2 id="mcp-setup-title">Verify the MCP, then enable actions</h2>
        </div>
        <p className="mcp-lede">
          Clone the public repository and run these commands from its root in PowerShell or Bash. The read-only check
          creates a temporary Codex profile, installs the marketplace plugin, discovers all 16 tools, and calls
          <code> getTree</code> on the live USDC Sepolia tree. It uses a local bridge that refuses writes; no wallet,
          operator key, runtime token, Docker, or team laptop is needed.
        </p>

        <ol className="setup-steps mcp-steps">
          <li className="setup-step">
            <span>1</span>
            <div>
              <strong>Read-only verification</strong>
              <small>
                Install Node 22 or newer, pnpm and Codex CLI. Internet access to the published app and Sepolia RPC is
                required. The host Codex version may be newer than the pinned 0.154.0 worker image.
              </small>
              <CopyBlock code={verifySnippet} label="read-only MCP verification commands" />
            </div>
          </li>
          <li className="setup-step">
            <span>2</span>
            <div>
              <strong>Interpret the result</strong>
              <small>
                Look for <code>toolCount: 16</code>, <code>chainId: 11155111</code> and <code>writes: disabled</code>.
                This proves packaging, installation, MCP handshake and a current chain read. The temporary profile
                is removed afterwards; it does not install a persistent personal companion.
              </small>
            </div>
          </li>
          <li className="setup-step">
            <span>3</span>
            <div>
              <strong>Enable agent actions separately</strong>
              <small>
                Financial writes are a separate Linux companion setup with your own Sepolia wallet, RPC and CLIProxyAPI
                access. On Windows, run that Linux setup in WSL2; native PowerShell cannot run the current companion.
                Follow <code>docs/local-setup.md</code> and <code>packages/plugin/README.md</code>. Do not reuse the
                completed demo root or payment runner. Containerized cross-platform onboarding and fresh-laptop write
                verification are still open.
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
          <li>Holds no wallet key and no provider credential — it only forwards requests to your companion.</li>
          <li>In full Linux companion mode, the MCP token is a local <code>0600</code> file, re-issued on every start and never printed to the terminal.</li>
          <li>The companion binds the bearer to the real root/worker context; a model-supplied <code>agentId</code> is rejected.</li>
          <li>On an uncertain write, tools never claim success — reconcile with <code>getOperationStatus</code> or the chain before retrying.</li>
        </ul>
      </section>
    </>
  );
}
