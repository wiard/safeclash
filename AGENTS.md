# AGENTS.md — safeclash

## Purpose
Trust, metering, billing, certification, and proof surface for the ecosystem.

## Product role
SafeClash records and presents proof.
It does not govern.
It does not approve.
It does not replace the kernel.

## What this repo owns
- usage atoms
- receipts
- metering
- capability registry
- certifications / attestations
- search and browser projections for certified configurations
- transactional trust surfaces

## Core invariant
All trust artifacts must remain anchored to governance authority from openclashd-v2.

## What SafeClash should become
- safeclash.com trust and transaction site
- receipt browser
- usage atom explorer
- certification browser
- metering / billing dashboard
- capability registry explorer

## What SafeClash should not become
- not the governance kernel
- not the approval cockpit
- not the research portal

## Do not do
- do not introduce approval authority here
- do not detach receipts from governance references
- do not make certification independent of kernel-backed evidence

## Relationship to other repos
- openclashd-v2 remains authority
- Jeeves may show summaries but should deep-link here for trust detail
- CLASHD27 may contribute source signals indirectly but does not govern trust output

## AI instruction
When changing SafeClash, preserve proof integrity and kernel anchoring first.
