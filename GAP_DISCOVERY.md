# GAP DISCOVERY

SafeClash is the secure proof portal for Gap Discovery.
It makes trust and authorization legible, but it never becomes the authority that approves or executes follow-up.

## MVP support

SafeClash provides:

- capability registration for the `GAP_DISCOVERY` family
- follow-up class registration for:
  - `operator_review`
  - `proposal_brief`
  - `knowledge_capture`
- minimal attestations for trusted or certified sources and processors
- minimal receipts that bind proof to kernel-approved follow-up
- explicit trust metadata
- future-ready certification and registry hooks

## Trust metadata introduced

SafeClash introduces a shared `TrustMetadata` shape on capability records, attestations, and receipt evidence.

Fields:

- `status`
- `certificationLevel`
- `operatorVisible`
- `evidenceRef`
- `registryVisibility`
- `certificationSurfaces`
- `searchableTerms`

What it proves:

- what trust state SafeClash has recorded
- what certification surface exposed that trust
- where the durable evidence lives

What it does not prove:

- kernel approval
- execution permission
- operator intent

## Capability registration

The `GAP_DISCOVERY` capability record proves:

- the capability family exists
- its current status
- which follow-up classes are recognized
- that each follow-up class still requires kernel approval

It does not prove that any follow-up class may run automatically.

## Attestations

Gap Discovery attestations prove that a `proposal_source` or `proposal_processor` has trust metadata and scope recorded by SafeClash.

They may include:

- supported gap classes
- supported follow-up classes
- issuer and evidence refs
- optional future commercial metadata

They do not approve actions.
They only strengthen the evidence around a kernel-governed path.

## Receipts

Gap Discovery receipt evidence now proves:

- which capability family was involved
- which source and processor attestations were linked
- which follow-up class was authorized
- which kernel proposal and approval the authorization came from
- what trust metadata was attached to that action evidence

It does not prove that SafeClash approved or executed the follow-up.

## Link back to kernel authority

Every authorized follow-up carried by SafeClash receipt evidence must point back to:

- `authority = openclashd-v2`
- the same `proposalId`
- the same `approvalId`

This keeps proof and permission related but clearly separate.

## Why this avoids bypassing governance

- SafeClash records proof only
- follow-up classes remain descriptive, not executable
- attestations can narrow trust but cannot widen authority
- receipts reflect governed decisions; they do not invent new ones
- all Gap Discovery proof remains subordinate to openclashd-v2
