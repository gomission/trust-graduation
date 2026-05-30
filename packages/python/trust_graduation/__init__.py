from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


DEFAULT_ACTION_POLICIES = [
    {
        "actionClass": "local.read",
        "lane": "observe",
        "riskClass": "low",
        "minimumLevel": 0,
        "requiresApproval": False,
        "receiptRequired": False,
        "externalSideEffects": "none",
    },
    {
        "actionClass": "draft.response",
        "lane": "prepare",
        "riskClass": "medium",
        "minimumLevel": 1,
        "requiresApproval": False,
        "receiptRequired": False,
        "externalSideEffects": "none",
    },
    {
        "actionClass": "email.send.external",
        "lane": "ask",
        "riskClass": "high",
        "minimumLevel": 5,
        "requiresApproval": True,
        "receiptRequired": True,
        "externalSideEffects": "email_send",
    },
]


def _normalize(value: str) -> str:
    return str(value or "").strip().lower().replace("_", ".")


def _policy_for(action_class: str, policies: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = _normalize(action_class)
    for policy in policies:
        if _normalize(policy.get("actionClass")) == normalized:
            return policy
    high = any(token in normalized for token in ["send", "external", "post", "publish", "payment", "legal"])
    return {
        "actionClass": action_class,
        "lane": "ask" if high else "prepare",
        "riskClass": "high" if high else "medium",
        "minimumLevel": 1,
        "requiresApproval": high,
        "receiptRequired": high,
        "externalSideEffects": "external_write" if high else "none",
    }


def _summarize(evidence: list[dict[str, Any]], action_class: str) -> dict[str, Any]:
    summary = {
        "actionClass": action_class,
        "positive": 0,
        "negative": 0,
        "approvals": 0,
        "edits": 0,
        "rejections": 0,
        "trustIssues": 0,
        "rejectionRate": 0,
    }
    for entry in evidence:
        if entry.get("actionClass") and entry.get("actionClass") != action_class:
            continue
        kind = str(entry.get("type") or entry.get("decision") or "").lower()
        if "approve" in kind or "sent" in kind or "used" in kind:
            summary["approvals"] += 1
            summary["positive"] += 1
        elif "edit" in kind:
            summary["edits"] += 1
            summary["positive"] += 1
        elif "reject" in kind or "override" in kind:
            summary["rejections"] += 1
            summary["negative"] += 1
        elif "trust_issue" in kind:
            summary["trustIssues"] += 1
            summary["negative"] += 1
    total = summary["positive"] + summary["negative"]
    summary["rejectionRate"] = round(summary["negative"] / total, 3) if total else 0
    return summary


def _tier(summary: dict[str, Any]) -> str:
    if summary["trustIssues"] or summary["rejections"] >= 3 or summary["rejectionRate"] >= 0.34:
        return "review"
    if summary["positive"] >= 10 and summary["approvals"] >= 6 and summary["negative"] == 0:
        return "auto_capped"
    if summary["positive"] >= 5 and summary["approvals"] >= 3 and summary["negative"] == 0:
        return "supervised"
    return "gated"


def _level(tier: str) -> int:
    return {"review": 0, "gated": 1, "supervised": 2, "auto_capped": 3}.get(tier, 1)


@dataclass
class TrustGraduation:
    workspace: str = ""
    evidence: list[dict[str, Any]] = field(default_factory=list)
    policies: list[dict[str, Any]] = field(default_factory=lambda: DEFAULT_ACTION_POLICIES.copy())

    def can_execute(self, request: dict[str, Any]) -> dict[str, Any]:
        action_class = request.get("actionClass") or request.get("action_class")
        if not action_class:
            raise ValueError("actionClass is required")
        policy = _policy_for(action_class, self.policies)
        evidence = _summarize(self.evidence, action_class)
        tier = _tier(evidence)
        level = _level(tier)
        approval = request.get("approval") or {}
        approved = approval.get("state") == "approved" or request.get("context", {}).get("approvalState") == "approved"
        high_risk = policy["riskClass"] in ["high", "critical"] or policy["externalSideEffects"] != "none"

        base = {
            "protocol": "trust-graduation",
            "version": "1.0",
            "autonomyLevel": level,
            "tier": tier,
            "policy": policy,
            "evidence": evidence,
        }
        if high_risk and not approved:
            return {
                **base,
                "allowed": False,
                "needsApproval": True,
                "mode": "approval_required",
                "reason": "Human approval required before this action can execute.",
                "packet": {
                    "protocol": "trust-graduation",
                    "version": "1.0",
                    "packetId": f"tg_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                    "workspace": self.workspace,
                    "actionClass": action_class,
                    "riskClass": policy["riskClass"],
                    "approvalRequired": True,
                    "context": request.get("context", {}),
                    "evidence": evidence,
                },
            }
        if high_risk and approved:
            return {**base, "allowed": True, "needsApproval": False, "mode": "approved_once", "reason": "Human approval permits this action once."}
        if tier == "review" or level < policy["minimumLevel"]:
            return {**base, "allowed": False, "needsApproval": True, "mode": "review_only", "reason": "Insufficient or regressed trust evidence."}
        return {**base, "allowed": True, "needsApproval": False, "mode": tier, "reason": "Action is inside the current trust boundary."}


__all__ = ["TrustGraduation", "DEFAULT_ACTION_POLICIES"]

