import { Check, CircleDashed, Plug, ShieldCheck } from "lucide-react";
import { CopyBlock } from "@/components/copy-block";
import { InfoHint } from "@/components/info-hint";
import { mcpServerMeta, mcpTools } from "@/lib/mcp-tools";
import type { PublicDeployment } from "@/lib/deployment";
import type { VaultNode } from "@/lib/dashboard-types";

const buildSnippet = `pnpm --filter @agent-capital-tree/plugin build`;

const companionSnippet = `# 1. one-time: prepare the operator key (prints only the public address)
node packages/runtime/cli.mjs prepare-root /absolute/private-config.json

# 2. start the companion — it prints the loopback toolsOrigin and the token file path
node packages/runtime/cli.mjs start /absolute/private-config.json --enable-sepolia-writes`;

const envSnippet = `# Set in the same shell that launches Codex. The bearer is never printed;
# read it straight from the 0600 file the companion wrote.
export ACT_RUNTIME_URL="http://127.0.0.1:<port>"                        # the loopback toolsOrigin
export ACT_MCP_TOKEN="$(< /absolute/runtime-root/root-session.token)"  # 0600 file; do not echo it`;

const tomlSnippet = `[mcp_servers.capital_tree_root]
command = "node"
args = ["/absolute/path/to/packages/plugin/bundle/server.mjs"]
tool_timeout_sec = 300
env_vars = ["ACT_RUNTIME_URL", "ACT_MCP_TOKEN"]`;

const verifyTomlSnippet = `codex mcp get capital_tree_root --json   # tool_timeout_sec = 300, env_vars lists both names`;

const marketplaceSnippet = `codex plugin marketplace add /absolute/path/to/this/repo
codex plugin add agent-capital-tree@agent-capital-tree
codex mcp list --json                    # shows the enabled "capital-tree" server`;

const installCheckSnippet = `node scripts/test-plugin-install.mjs /absolute/private-runtime-config.json`;

const defaultPrompt = "Show my Agent Capital Tree and the effective mandate for each node.";

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
    ["Default root", deployment.defaultRootId ?? "—"],
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
          <h2 id="mcp-setup-title">Wire it into Codex</h2>
        </div>
        <p className="mcp-lede">
          The plugin runs locally and proxies to your companion. Follow the steps in order; the two registration paths in
          step 5 are alternatives — pick one, don&apos;t register both in the same profile.
        </p>

        <ol className="setup-steps mcp-steps">
          <li className="setup-step">
            <span>1</span>
            <div>
              <strong>Prerequisites</strong>
              <small>
                Node ≥ 22, pnpm, Docker, Codex CLI 0.154.0, a funded Sepolia wallet, and your own CLIProxyAPI model
                access. Keep every key local and outside the repo. Canonical docs: <code>packages/runtime/README.md</code>{" "}
                and <code>packages/plugin/README.md</code>.
              </small>
            </div>
          </li>
          <li className="setup-step">
            <span>2</span>
            <div>
              <strong>Build the plugin</strong>
              <small>Produces the bundled stdio server the manifests point at.</small>
              <CopyBlock code={buildSnippet} label="build command" />
            </div>
          </li>
          <li className="setup-step">
            <span>3</span>
            <div>
              <strong>Start the companion</strong>
              <small>
                It binds to 127.0.0.1 and prints the loopback <code>toolsOrigin</code> and the private{" "}
                <code>root-session.token</code> path. Omit <code>--enable-sepolia-writes</code> to keep writes off.
              </small>
              <CopyBlock code={companionSnippet} label="companion commands" />
            </div>
          </li>
          <li className="setup-step">
            <span>4</span>
            <div>
              <strong>Export the two env vars</strong>
              <small>A new bearer is issued on every start — refresh these before launching another Codex process.</small>
              <CopyBlock code={envSnippet} label="environment variables" />
            </div>
          </li>
          <li className="setup-step">
            <span>5</span>
            <div>
              <strong>Register with Codex — pick one path</strong>
              <details className="setup-disclosure mcp-path">
                <summary>Path A · explicit registration (recommended for long writes, 300 s)</summary>
                <small>Add this table to the root profile&apos;s <code>config.toml</code>, then verify the effective setting.</small>
                <CopyBlock code={tomlSnippet} label="config.toml block" />
                <CopyBlock code={verifyTomlSnippet} label="verify command" />
              </details>
              <details className="setup-disclosure mcp-path">
                <summary>Path B · marketplace install (reads / short actions, 60 s default)</summary>
                <small>
                  The installed server keeps Codex&apos;s default 60-second per-tool timeout. Set the same env vars in the
                  launching shell.
                </small>
                <CopyBlock code={marketplaceSnippet} label="marketplace commands" />
              </details>
            </div>
          </li>
          <li className="setup-step">
            <span>6</span>
            <div>
              <strong>Verify</strong>
              <small>
                Ask the agent the default prompt: <em>“{defaultPrompt}”</em>. For a hands-off read-only end-to-end check:
              </small>
              <CopyBlock code={installCheckSnippet} label="install check" />
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
          <li>The MCP token is a local <code>0600</code> file, re-issued on every start, and never printed to the terminal.</li>
          <li>The companion binds the bearer to the real root/worker context; a model-supplied <code>agentId</code> is rejected.</li>
          <li>On an uncertain write, tools never claim success — reconcile with <code>getOperationStatus</code> or the chain before retrying.</li>
        </ul>
      </section>
    </>
  );
}
