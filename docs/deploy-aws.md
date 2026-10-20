# Deploying on AWS (PLANNED, not deployed)

> Status: **planned**. Nothing in this repo is deployed, and every feature flag is off. This is the target layout once the team has an AWS account set up. No account ids, hostnames or keys belong in this file.

## Region
`eu-west-2` (London) for UK data residency (UK GDPR).

## 1. Static tiles: S3 + CloudFront (planned)
- Build: `npm run build:tiles` (or the batch builder for all of GB), output `{z}/{x}/{y}.c3dt` (or one PMTiles archive per region).
- Store in a **private** S3 bucket in eu-west-2 with Block Public Access on and versioning enabled.
- Serve through **CloudFront** with Origin Access Control. Cache policy: long TTL plus versioned path prefixes (`/v1/…`), with `Content-Type: application/octet-stream`. Enable Brotli/gzip.
- CORS: allow only the HeyCoits app origins.
- PMTiles option: one archive per region, served with HTTP range requests through CloudFront (`PMTilesSource`).
- Budget: tiles for all of Great Britain at z14–16 are expected to be tens of GB, which is fine for S3.

## 2. API: ECS Fargate or Lambda (planned)
- Bot query API (`docs/bot-api.md`) and spectrum ingest (`src/spectrum/endpoint.ts`).
- **Lambda + API Gateway (HTTP API)** for low or bursty traffic, or **ECS Fargate behind an ALB** for steady traffic and long-lived connections. Both run the same Node 20 handler.
- WAF with rate limiting on the ingest route. Do not log request bodies or source IPs on ingest (turn off API Gateway/ALB access-log IP fields or truncate them).
- Secrets go in AWS Secrets Manager. Never use env files in the repo.
- Feature flags come in through `COITS3D_FLAGS` per environment (staging first).

## 3. Data: Aurora PostgreSQL + PostGIS (planned)
- Aurora PostgreSQL (Serverless v2) in eu-west-2, in private subnets, encrypted at rest with KMS.
- PostGIS tables:
  - `spectrum_contributions` (sanitised, id-free, `received_day`) with a scheduled retention purge (`DELETE … WHERE received_day < now() - interval '90 days'`) via EventBridge + Lambda.
  - `spectrum_aggregates` (per tile/cell, only rows with contributors ≥ k are published).
  - `businesses` (verified only; roadmap step 4) and `robot_graph` (roadmap step 3).
- Aggregator job: scheduled (EventBridge) and writes published aggregates into the tile build so tiles are re-published to S3.

## 4. Pipeline (planned)
GitHub Actions → OIDC role (no long-lived keys) → build tiles → `aws s3 sync` → CloudFront invalidation of changed prefixes. Staging and production use separate accounts.

## Checklist before go-live
- DPIA for spectrum data collection, consent text versioned, privacy notice published
- Retention job verified, k-threshold reviewed
- Attribution shown in the app (© OpenStreetMap contributors, imagery provider)
- Load test the tile CDN path, alarms on 5xx and cost
