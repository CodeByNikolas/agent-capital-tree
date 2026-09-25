export function rootCodexConfig(upstream, bundlePath) {
  return `model = "gpt-6-sol"
model_reasoning_effort = "medium"
model_provider = "homebox_clip"
approval_policy = "never"
sandbox_mode = "read-only"
[model_providers.homebox_clip]
name = "HomeBox CLIProxyAPI"
base_url = ${JSON.stringify(upstream)}
env_key = "ACT_ROOT_PROXY_TOKEN"
wire_api = "responses"
[mcp_servers.capital_tree_root]
command = "node"
args = [${JSON.stringify(bundlePath)}]
tool_timeout_sec = 300
required = true
env_vars = ["ACT_RUNTIME_URL", "ACT_MCP_TOKEN"]
`;
}
