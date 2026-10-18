# People Desk — run locally in VS Code

Open the **project root** in VS Code after extracting the ZIP. It is the folder containing `pnpm-workspace.yaml` and this README. The web app, Python HR service, shared API packages, and database schema are all part of this workspace.

## Requirements

- Node.js 24 and pnpm (Corepack can enable pnpm)
- Python 3.13+
- A local PostgreSQL database
- Clerk development credentials and an OpenAI API key

## Configure local environment

1. Copy `.env.example` to `.env`.
2. Replace the example database URL with your local PostgreSQL connection string.
3. Add your own `OPENAI_API_KEY`.
4. Add matching Clerk development keys to `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`. Configure your Clerk development instance to allow the local Vite origin (`http://localhost:21333`).
5. Put authorized HR administrator emails in `HR_ADMIN_EMAILS`, separated by commas.

The ZIP does not contain Replit secrets or a real `.env` file. Keep your local `.env` private; it is ignored by Git.

## Install dependencies and create the database schema

From the project root:

```bash
corepack enable
pnpm install --frozen-lockfile
python -m pip install "fastapi>=0.146.0" "openai>=3.35.1" "psycopg[binary]>=3.3.6" "uvicorn>=0.54.0"
```

In a Bash terminal, load the environment and create the schema:

```bash
set -a
source .env
set +a
pnpm --filter @workspace/db run push
```

## Run the application

Open two VS Code terminals, both at the project root. The API server starts the Python service automatically.

**Terminal 1 — API and Python backend:**

```bash
set -a
source .env
set +a
PORT=8080 pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — website:**

```bash
set -a
source .env
set +a
pnpm --filter @workspace/hr-service-desk run dev
```

Open `http://localhost:21333`.

The Vite app uses `API_SERVER_ORIGIN` to proxy local `/api` requests to the API server. It defaults to port `21333` and `/` for local development; Replit-provided port and path settings still take precedence in Replit.

## Windows PowerShell

In each terminal, load `.env` and set the appropriate port before running its command:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)$') {
    Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
  }
}
```

For Terminal 1:

```powershell
$env:PORT = "8080"
pnpm --filter @workspace/api-server run dev
```

For Terminal 2:

```powershell
pnpm --filter @workspace/hr-service-desk run dev
```

## First-use notes

- No company policy documents are preloaded. Until an HR administrator adds approved policy sources, policy questions intentionally route to HR rather than receive guessed answers.
- Service requests are private to the signed-in employee. AI does not approve leave or policy exceptions.
- Escalations appear in the internal HR queue; external email or ticket delivery is not configured.
