package trustgraduation

import "testing"

func TestUnknownEffectsAndPlainFlagsFailClosed(t *testing.T) {
	gate := New("audit", nil)
	for _, action := range []string{"email.send.external", "files.delete", "calendar.create", "payment.initiate", "permission.change", ""} {
		for _, request := range []Request{{ActionClass: action}, {ActionClass: action, Approval: map[string]any{"state": "approved"}}, {ActionClass: action, Context: map[string]any{"approvalState": "approved"}}} {
			if gate.CanExecute(request).Allowed {
				t.Errorf("unauthorized effect allowed: %s", action)
			}
		}
	}
}
func TestKnownReadRemainsAvailable(t *testing.T) {
	if !New("audit", nil).CanExecute(Request{ActionClass: "local.read"}).Allowed {
		t.Fatal("local read denied")
	}
}
func TestApprovalPolicyFailsClosed(t *testing.T) {
	gate := New("audit", nil)
	gate.Policies = []Policy{{ActionClass: "custom.change", RiskClass: "low", MinimumLevel: 0, RequiresApproval: true, ExternalSideEffects: "none"}}
	if gate.CanExecute(Request{ActionClass: "custom.change", Approval: map[string]any{"state": "approved"}}).Allowed {
		t.Fatal("policy approval bypass")
	}
}
