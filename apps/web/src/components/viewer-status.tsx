import { Eye, ShieldCheck, UserCog, Wallet2, WifiOff } from "lucide-react";
import type { DataSource } from "@/lib/dashboard-types";

export interface ViewerStatusProps {
  source: DataSource;
  vaultLabel: string;
  walletConnected: boolean;
  walletOnSepolia: boolean;
  liveStateReady: boolean;
  ownerConnected: boolean;
  selectedAgentConnected: boolean;
  parentCanRestrict: boolean;
}

interface ViewerState {
  tone: "neutral" | "visitor" | "warning" | "authorized";
  role: string;
  detail: string;
  icon: React.ReactNode;
}

function resolveState(props: ViewerStatusProps): ViewerState {
  if (props.source === "preview") {
    return {
      tone: "neutral",
      role: "Preview data (illustrative)",
      detail: "These are labeled sample records. Load a live root to see real chain state and unlock wallet actions.",
      icon: <Eye size={15} aria-hidden="true" />,
    };
  }
  if (props.source === "local-diagnostic") {
    return {
      tone: "neutral",
      role: "Local diagnostic view",
      detail: "Data comes from a local diagnostic source, not live Sepolia.",
      icon: <Eye size={15} aria-hidden="true" />,
    };
  }
  if (!props.walletConnected) {
    return {
      tone: "visitor",
      role: "Viewing as visitor (read-only)",
      detail: "Everything here is public. Connect a wallet to act as the owner or an authorized agent.",
      icon: <Eye size={15} aria-hidden="true" />,
    };
  }
  if (!props.walletOnSepolia) {
    return {
      tone: "warning",
      role: "Wrong network — switch to Sepolia",
      detail: "Your wallet is on another network. Actions stay locked until you switch to Sepolia.",
      icon: <WifiOff size={15} aria-hidden="true" />,
    };
  }
  if (!props.liveStateReady) {
    return {
      tone: "neutral",
      role: "Reading live authority…",
      detail: "Checking whether your connected account is the owner or an agent for this vault.",
      icon: <Wallet2 size={15} aria-hidden="true" />,
    };
  }
  if (props.ownerConnected) {
    return {
      tone: "authorized",
      role: "Connected as OWNER",
      detail: "Owner actions — fund, bind operator, tighten the root, and independent recovery — are unlocked.",
      icon: <ShieldCheck size={15} aria-hidden="true" />,
    };
  }
  if (props.selectedAgentConnected) {
    return {
      tone: "authorized",
      role: `Connected as this vault's AGENT`,
      detail: `You can delegate to child vaults and manage capital for ${props.vaultLabel} within its mandate.`,
      icon: <UserCog size={15} aria-hidden="true" />,
    };
  }
  if (props.parentCanRestrict) {
    return {
      tone: "authorized",
      role: "Connected as the parent agent",
      detail: `You hold restrict authority over ${props.vaultLabel}: you can tighten its policy or revoke it.`,
      icon: <UserCog size={15} aria-hidden="true" />,
    };
  }
  return {
    tone: "visitor",
    role: "Connected, but no authority here",
    detail: `This account is neither the owner nor an authorized agent for ${props.vaultLabel}. That is why its actions are disabled.`,
    icon: <Wallet2 size={15} aria-hidden="true" />,
  };
}

/**
 * A one-line "who am I and what can I do" bar. It names the exact authority gap
 * the wallet logic already computes, so the many disabled action buttons make sense.
 */
export function ViewerStatusBar(props: ViewerStatusProps) {
  const state = resolveState(props);
  return (
    <div className={`viewer-status viewer-status-${state.tone}`} role="status">
      <span className="viewer-status-icon" aria-hidden="true">{state.icon}</span>
      <span className="viewer-status-role">{state.role}</span>
      <span className="viewer-status-detail">{state.detail}</span>
    </div>
  );
}
