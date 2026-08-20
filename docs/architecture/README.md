# Architecture Docs

This folder holds cross-system architecture notes that affect GrantPipe
implementation decisions.

## Current Maps

- [System design](../../portfolio/ARCHITECTURE.md) — the three deployables, the request path,
  the tenancy model, the data model, and how scheduled and queued work runs.
- Third-party and internal dependency map (not included in this snapshot)
  tracked the sibling repos and external services GrantPipe depended on for
  lead nurture, paid acquisition, social publishing, CRM feedback, AI widgets,
  and outbound email operations.

## Update Rule

Update these docs when a feature changes a cross-repo contract, worker URL,
secret name, owning repo, data flow, deploy order, or regression gate. Treat
the current code and the named source repos as the source of truth.
