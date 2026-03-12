# Security Certification

## What `security_remediation` Means

`security_remediation` is the SafeClash capability used when a governed security finding has already passed through:

`signal -> proposal -> approval -> bounded remediation`

This capability does not approve remediation. It certifies that the remediation request arrived with explicit governance context and that SafeClash emitted a traceable `execution_receipt`.

For this capability to proceed:

- an explicit `approval_decision` must be present
- the approval decision must be affirmative
- the remediation must remain bounded and attributable
- auto-remediation must remain forbidden

If the approval decision is missing, malformed, or non-affirmative, SafeClash rejects the request and no execution receipt is produced.

## What a Security `execution_receipt` Proves

A security `execution_receipt` proves that:

- a specific governed proposal was approved by a human
- the remediation was tied to a specific security signal
- the remediation capability used was `security_remediation`
- the approved operator identity is attributable via `approved_by`
- the remediation event is time-bound via `timestamp`

The receipt projection used for governed security remediation is:

- `receipt_id`
- `proposal_id`
- `capability`
- `security_signal_id`
- `remediation_applied`
- `approved_by`
- `timestamp`

This is the compliance-oriented projection. It is intentionally narrower than full kernel-internal governance state.

## How the Audit Trail Supports Compliance Reporting

SafeClash is not the governance kernel. It records trust artifacts anchored to kernel approval.

For security remediation, the audit trail supports compliance reporting by showing:

- which proposal authorized the remediation
- which signal triggered the remediation path
- who approved it
- when it occurred
- what bounded remediation was applied

This makes it possible to answer common audit questions:

- Was there explicit human approval?
- Was the change attributable to a governed proposal?
- Can the remediation be traced back to a security finding?
- Was the action bounded rather than autonomous?

## Why Auto-Remediation Is Architecturally Forbidden

Auto-remediation is forbidden because it collapses discovery, decision, and execution into a single uncontrolled path.

In this architecture:

- `clashd27` discovers
- `openclashd-v2` governs
- `jeeves` presents approval context
- `safeclash` receipts approved remediation

If remediation were allowed to occur automatically:

- the approval boundary would be bypassed
- attribution would become unreliable
- compliance evidence would be weaker
- the trust root would no longer remain explicit

For that reason, SafeClash rejects `security_remediation` requests marked as automatic. Detection may be autonomous. Remediation never is.

## How SafeClash Certification Applies to Security Findings

SafeClash certification for security findings is evidence-oriented, not authority-oriented.

It certifies that:

- governance context was attached
- approval was explicit
- the remediation capability was constrained
- a receipt was emitted for downstream audit and reporting

It does not certify that:

- the finding was safe to ignore
- the operator decision was correct in substance
- the governance kernel can be bypassed

Certification remains anchored to kernel-backed approval and proposal state.

## What an Auditor Would Look For

An auditor reviewing security remediation receipts would look for:

- a stable `receipt_id`
- a valid `proposal_id`
- the `security_signal_id` that motivated the remediation
- the exact `remediation_applied`
- the `approved_by` operator identity
- a trustworthy `timestamp`
- evidence that auto-remediation was not used

In practice, the auditor wants to reconstruct a governed chain:

`security_signal -> proposal -> approval_decision -> bounded remediation -> execution_receipt`

If any link is missing, the remediation should be treated as non-compliant.
