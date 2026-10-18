# HR Service Desk

An AI-enabled employee support desk for approved-policy answers, private service requests, and HR escalation with human oversight.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/hr-service-desk run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `OPENAI_API_KEY`
- `HR_ADMIN_EMAILS` is a comma-separated allowlist of HR administrator email addresses; policy management and the private HR queue fail closed until configured.
- Clerk keys are provisioned through Replit-managed Clerk Auth.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vite, semantic HTML, CSS, and JavaScript
- HR backend: Python 3.13, FastAPI, Psycopg, OpenAI Python SDK
- Auth and proxy gateway: Express 5 with Clerk session verification
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/hr-service-desk/` — employee-facing website
- `artifacts/api-server/python/main.py` — HR API, policy retrieval, AI answer validation, requests, and escalation queue
- `artifacts/api-server/src/routes/hr.ts` — authenticated gateway from `/api/hr` to the loopback-only Python service
- `lib/db/src/schema/hr-service-desk.ts` — PostgreSQL schema
- `lib/api-spec/openapi.yaml` — source API contract
- `HR_ADMIN_EMAILS` — server-side allowlist needed to add approved policies and view the HR review queue

## Architecture decisions

- The Python service binds to loopback; the Express gateway verifies the Clerk session and supplies employee identity. Never accept employee IDs from browser payloads.
- Policy answers must use approved policy documents stored by an authorized HR administrator. With no matching source or a failed citation check, return the exact unavailable-information fallback and create an HR escalation.
- Request lists are always scoped to the authenticated employee. The HR review queue is restricted to `HR_ADMIN_EMAILS`.
- AI can draft guidance but cannot approve leave, requests, exceptions, or policy changes.
- No company policy documents or outbound HR email/ticket integration are configured by default; do not invent policy data or promise external delivery.

## Product

- Ask HR questions grounded in cited, administrator-approved policy sources.
- Submit and track private employee service requests.
- Route sensitive, unresolved, or explicitly escalated questions to a human HR review queue.
- Allow authorized HR administrators to manage approved policy text and update queue status.

## User preferences

- Use Python for the backend and HTML, CSS, and JavaScript for the frontend.

## Gotchas

- Set `HR_ADMIN_EMAILS` before trying to add policy documents or open the HR review queue; an unset or unmatched allowlist must deny access.
- The API server starts the Python worker as a child process. Restart `artifacts/api-server: API Server` after backend or Python dependency changes.
- A human queue status change is not an approval decision; use explicit human communication for any approval.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
