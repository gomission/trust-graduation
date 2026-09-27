import unittest
from trust_graduation import TrustGraduation

class AuthoritySafety(unittest.TestCase):
    def test_plain_flags_and_unknown_effects_fail_closed(self):
        gate = TrustGraduation(workspace='audit')
        for action in ('email.send.external','files.delete','calendar.create','payment.initiate','permission.change'):
            for request in ({'actionClass':action},{'actionClass':action,'approval':{'state':'approved'}},{'actionClass':action,'context':{'approvalState':'approved'}}):
                with self.subTest(request=request):
                    self.assertFalse(gate.can_execute(request)['allowed'])
    def test_known_local_read_still_works(self):
        self.assertTrue(TrustGraduation(workspace='audit').can_execute({'actionClass':'local.read'})['allowed'])
    def test_explicit_approval_policy_fails_closed(self):
        gate=TrustGraduation(workspace='audit',policies=[{'actionClass':'custom.change','riskClass':'low','minimumLevel':0,'requiresApproval':True,'externalSideEffects':'none'}])
        self.assertFalse(gate.can_execute({'actionClass':'custom.change','approval':{'state':'approved'}})['allowed'])
if __name__ == '__main__': unittest.main()
