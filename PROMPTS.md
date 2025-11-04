# Prompts and thought process

After starting a new project with `wrangler init` I chose SvelteKit as the framework and installed [Ultracite](https://www.ultracite.ai/introduction) right away.

For all the prompts I used _Cursor_ wih the new [Composer 1](https://cursor.com/blog/composer) model.

## Prompt 1

```txt
implement betterauth with google social login

remember you will need to implement the schema, by hand, on @auth.ts 

then the better auth logic in @auth 

https://www.better-auth.com/docs/introduction 
```
Double checked the implementation, all looks good.

## Prompt 2

```txt
implement a simple chatbot ui using https://www.shadcn-svelte.com/docs/components 


it should have a top navbar, a sign in button (google)
a space to have messages and a space for the user to type its message
```

```txt
use the new svelte 5 runes syntax for everything
```

## Prompt 3

```txt
once the user is logged in "Disagree Bot" should turn in to "I will disagree with [user name]" and the sign in button should turn in to a sign out
```

## Prompt 4

Migrated from the "cloudflare:workers" syntax to getting the env and all bindings dynamically from the request with "const event = getRequestEvent();", now `vite dev` works! I do not have the exact prompt but it was a combination of help from ChatGPT and pasting in to the cursor chat.

https://chatgpt.com/c/6908041d-27fc-832a-88c4-ca41d245f1b2

## Prompt 5

```txt
add a dark mode switch button on top of the page www.shadcn-svelte.com/docs/dark-mode/svelte
```

## Prompt 6

```txt
@+page.svelte (116-163) 

make this center section prettier, right spacing etc
```

Just some visual things.

## Manual Changes

`bun add agents` added agents sdk, the plan is to have one agent (DO) for each user, keep chat state memory etc on it.

Added the DO definition to the project `wrangler.jsonc` and very quickly ran in to this problem:

```bash
▲ [WARNING]                             You have defined bindings to the following internal Durable Objects:

                                - {"name":"ChatAgent","class_name":"ChatAgent"}
                                These will not work in local development, but they should work in production.

                                If you want to develop these locally, you can define your DO in a separate Worker, with a
  separate configuration file.
                                For detailed instructions, refer to the Durable Objects section here:
  https://developers.cloudflare.com/workers/wrangler/api#supported-bindings


workerd/server/server.c++:1952: warning: A DurableObjectNamespace in the config referenced the class "ChatAgent", but no such Durable Object class is exported from the worker. Please make sure the class name matches, it is exported, and the class extends 'DurableObject'. Attempts to call to this Durable Object class will fail at runtime, but historically this was not a startup-time error. Future versions of workerd may make this a startup-time error.
```

It was clear I needed to set up a monorepo, multi project setup following this [guide](https://developers.cloudflare.com/workers/wrangler/api/#supported-bindings).

So i configured turborepo with a `/apps/web` where the sveltekit app is located, and `apps/agent` where the agent DO is at. Also lined them together in the wrangler configs.
