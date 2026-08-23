# Graph Report - src  (2026-08-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 34 nodes · 43 edges · 4 communities (3 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]

## God Nodes (most connected - your core abstractions)
1. `formatMoney()` - 6 edges
2. `HomeView()` - 2 edges
3. `InvestView()` - 2 edges
4. `WalletView()` - 2 edges
5. `ProfileView()` - 2 edges
6. `CheckoutView()` - 2 edges
7. `IconButton()` - 2 edges
8. `PrimaryButton()` - 2 edges
9. `SegmentButton()` - 2 edges
10. `BottomNav()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (4 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (6): actionItems, cryptoOptions, navItems, overviewItems, pageMeta, tiers

### Community 1 - "Community 1"
Cohesion: 0.33
Nodes (6): CheckoutView(), formatMoney(), HomeView(), InvestView(), ProfileView(), WalletView()

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (4): IconButton(), PrimaryButton(), SegmentButton(), tones

## Knowledge Gaps
- **7 isolated node(s):** `navItems`, `pageMeta`, `actionItems`, `cryptoOptions`, `overviewItems` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatMoney()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `navItems`, `pageMeta`, `actionItems` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._