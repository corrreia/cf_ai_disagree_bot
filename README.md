# cf_ai_disagree_bot

An AI-powered chatbot that disagrees with everything you say. Built on top of the Cloudflare Ecosystem.
This project is my submission for the 2026 Intern Program.

## How It Works:

- **Frontend**: SvelteKit application with svelte-shadcn components running on Workers.
- **Agent**: Cloudflare Durable Objects (`bun i agents`), stateful agents (one per user) that maintain conversation memory.
- **AI**: Cloudflare Workers AI powers the chatbot using the Llama 3.3.
- **Authentication**: Better Auth with Google OAuth social login.
- **Database**: Cloudflare D1 with Drizzle ORM.

## Prerequisites

- [Bun](https://bun.sh/)
- A [Cloudflare account](https://dash.cloudflare.com/) (even though you can deploy locally, we still use CF for AI inference)
- Google OAuth credentials (Client ID and Secret)

## Setup

1. **bun install**
   
2. **Set up environment**

   Create a `.env` file in `apps/web/` directory:
   - GOOGLE_CLIENT_ID=your-google-client-id
   - GOOGLE_CLIENT_SECRET=your-google-client-secret
   - CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
   - CLOUDFLARE_DATABASE_ID=your-d1-database-id
   - CLOUDFLARE_D1_TOKEN=your-d1-api-token

   These last 3 are used for migrations, using drizzle, check `drizzle.config.ts`

   on `wrangler.jsonc` the D1 is ste to `remote: true` so we will be using the online DB.

3. **Run database migrations**
  
```sh
   cd apps/web
   bun run db:push
   ```

4. **Run/Deploy The project**

    ```sh
    # on the root folder
    bun run dev:workers # runs the project locally
    bun run deploy # deploys the project to you CF account
    ```

    You might need to change `"APP_URL":` on the SvelteKit `wrangler.jsonc` so that better auth points to the right endpoint.

## Project Structure

This is a monorepo containing the app and the agent in the same place.

```txt
disagree-bot/
└── apps/
    ├── web/          # SvelteKit frontend application
    └── agent/        # Durable Object agent worker
```

## Development Notes

- The project uses [Turborepo](https://turbo.build/) for monorepo management
- WebSocket connections are handled directly by Durable Objects using Cloudflare's Native WebSocket API
- Chat history is persisted in the Durable Object's state (managed by the `agents` SDK)
- The AI model used is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

## Troubleshooting

**Durable Objects warning in dev**: If you see warnings about Durable Objects not working locally, make sure you're using `bun run dev:workers` instead of `bun run dev`.

**Authentication issues**: Ensure your Google OAuth credentials are correctly set in `.dev.vars` and that your redirect URI matches your `APP_URL`.

**Database connection errors**: Verify your Cloudflare credentials are correct and that the D1 database exists and migrations have been run.
