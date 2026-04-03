# Platform Roadmap (Do Not Forget)

Updated: 2026-04-03

## Core Product Direction

This project is not only a planner UI. It evolves into a wedding operations platform with two tiers:

- Free tier: advisor mode (guidance + explanation)
- Premium tier: operator mode (agent executes tasks in user workspace)

## Must-Build Features

### 1) Member Area

- Couple account with persistent profile, preferences, budget, guest model
- Vendor shortlist, offers, communication history, and decision timeline
- Per-guest personal page (invite, seating, route, hotel suggestions)

### 2) Review Platform

- Collect and display vendor/venue quality signals and verified reviews
- Keep strict provenance: source, freshness, and confidence for each signal
- Separate third-party score hints from first-party truth in publication logic

### 3) Vendor Marketplace

- Self-service vendor portal for profile maintenance
- Vendors can update contact, opening hours, pricing, media, and availability
- Moderation pipeline before records become publishable

### 4) Commercial Layer

- Commission model for successful bookings/leads
- Affiliate integrations (e.g., accommodation providers)
- Tiered monetization: free consultant vs premium operator execution

## Data and Agent Guardrails

- Agent can only modify data inside the active user workspace.
- No cross-workspace writes.
- All automated edits must be logged with timestamp + source + reason.

## Pipeline Goals

- Build and maintain the largest Germany-focused wedding vendor database.
- Weekly baseline sweeps for broad coverage.
- Premium deep scan by PLZ/radius with stricter quality checks.
- Continuous dedupe, freshness updates, and source quality scoring.
