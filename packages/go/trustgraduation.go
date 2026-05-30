package trustgraduation

import "strings"

type Evidence struct {
	ActionClass string `json:"actionClass"`
	Type        string `json:"type"`
}

type Policy struct {
	ActionClass         string `json:"actionClass"`
	Lane                string `json:"lane"`
	RiskClass           string `json:"riskClass"`
	MinimumLevel        int    `json:"minimumLevel"`
	RequiresApproval    bool   `json:"requiresApproval"`
	ReceiptRequired     bool   `json:"receiptRequired"`
	ExternalSideEffects string `json:"externalSideEffects"`
}

type Summary struct {
	ActionClass   string  `json:"actionClass"`
	Positive      int     `json:"positive"`
	Negative      int     `json:"negative"`
	Approvals     int     `json:"approvals"`
	Edits         int     `json:"edits"`
	Rejections    int     `json:"rejections"`
	TrustIssues   int     `json:"trustIssues"`
	RejectionRate float64 `json:"rejectionRate"`
}

type Request struct {
	ActionClass string         `json:"actionClass"`
	Context     map[string]any `json:"context,omitempty"`
	Approval    map[string]any `json:"approval,omitempty"`
}

type Decision struct {
	Protocol      string         `json:"protocol"`
	Version       string         `json:"version"`
	Allowed       bool           `json:"allowed"`
	NeedsApproval bool           `json:"needsApproval"`
	Mode          string         `json:"mode"`
	AutonomyLevel int            `json:"autonomyLevel"`
	Tier          string         `json:"tier"`
	Policy        Policy         `json:"policy"`
	Evidence      Summary        `json:"evidence"`
	Reason        string         `json:"reason"`
	Packet        map[string]any `json:"packet,omitempty"`
}

type TrustGraduation struct {
	Workspace string
	Evidence  []Evidence
	Policies  []Policy
}

func New(workspace string, evidence []Evidence) TrustGraduation {
	return TrustGraduation{Workspace: workspace, Evidence: evidence, Policies: DefaultPolicies()}
}

func DefaultPolicies() []Policy {
	return []Policy{
		{ActionClass: "local.read", Lane: "observe", RiskClass: "low", MinimumLevel: 0, ExternalSideEffects: "none"},
		{ActionClass: "draft.response", Lane: "prepare", RiskClass: "medium", MinimumLevel: 1, ExternalSideEffects: "none"},
		{ActionClass: "email.send.external", Lane: "ask", RiskClass: "high", MinimumLevel: 5, RequiresApproval: true, ReceiptRequired: true, ExternalSideEffects: "email_send"},
	}
}

func (tg TrustGraduation) CanExecute(req Request) Decision {
	policy := tg.policyFor(req.ActionClass)
	summary := tg.summarize(req.ActionClass)
	tier := tier(summary)
	level := level(tier)
	approved := req.Approval["state"] == "approved" || req.Context["approvalState"] == "approved"
	highRisk := policy.RiskClass == "high" || policy.RiskClass == "critical" || policy.ExternalSideEffects != "none"
	base := Decision{Protocol: "trust-graduation", Version: "1.0", AutonomyLevel: level, Tier: tier, Policy: policy, Evidence: summary}

	if highRisk && !approved {
		base.Allowed = false
		base.NeedsApproval = true
		base.Mode = "approval_required"
		base.Reason = "Human approval required before this action can execute."
		base.Packet = map[string]any{"protocol": "trust-graduation", "version": "1.0", "workspace": tg.Workspace, "actionClass": req.ActionClass, "approvalRequired": true}
		return base
	}
	if highRisk && approved {
		base.Allowed = true
		base.Mode = "approved_once"
		base.Reason = "Human approval permits this action once."
		return base
	}
	if tier == "review" || level < policy.MinimumLevel {
		base.NeedsApproval = true
		base.Mode = "review_only"
		base.Reason = "Insufficient or regressed trust evidence."
		return base
	}
	base.Allowed = true
	base.Mode = tier
	base.Reason = "Action is inside the current trust boundary."
	return base
}

func (tg TrustGraduation) policyFor(actionClass string) Policy {
	needle := normalize(actionClass)
	for _, policy := range tg.Policies {
		if normalize(policy.ActionClass) == needle {
			return policy
		}
	}
	high := strings.Contains(needle, "send") || strings.Contains(needle, "external") || strings.Contains(needle, "post")
	if high {
		return Policy{ActionClass: actionClass, Lane: "ask", RiskClass: "high", MinimumLevel: 1, RequiresApproval: true, ReceiptRequired: true, ExternalSideEffects: "external_write"}
	}
	return Policy{ActionClass: actionClass, Lane: "prepare", RiskClass: "medium", MinimumLevel: 1, ExternalSideEffects: "none"}
}

func (tg TrustGraduation) summarize(actionClass string) Summary {
	s := Summary{ActionClass: actionClass}
	for _, e := range tg.Evidence {
		if e.ActionClass != "" && e.ActionClass != actionClass {
			continue
		}
		kind := strings.ToLower(e.Type)
		switch {
		case strings.Contains(kind, "approve") || strings.Contains(kind, "sent") || strings.Contains(kind, "used"):
			s.Approvals++
			s.Positive++
		case strings.Contains(kind, "edit"):
			s.Edits++
			s.Positive++
		case strings.Contains(kind, "reject") || strings.Contains(kind, "override"):
			s.Rejections++
			s.Negative++
		case strings.Contains(kind, "trust_issue"):
			s.TrustIssues++
			s.Negative++
		}
	}
	total := s.Positive + s.Negative
	if total > 0 {
		s.RejectionRate = float64(s.Negative) / float64(total)
	}
	return s
}

func tier(s Summary) string {
	if s.TrustIssues > 0 || s.Rejections >= 3 || s.RejectionRate >= 0.34 {
		return "review"
	}
	if s.Positive >= 10 && s.Approvals >= 6 && s.Negative == 0 {
		return "auto_capped"
	}
	if s.Positive >= 5 && s.Approvals >= 3 && s.Negative == 0 {
		return "supervised"
	}
	return "gated"
}

func level(tier string) int {
	switch tier {
	case "review":
		return 0
	case "supervised":
		return 2
	case "auto_capped":
		return 3
	default:
		return 1
	}
}

func normalize(value string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), "_", ".")
}

