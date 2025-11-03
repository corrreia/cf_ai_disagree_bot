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
once the user is logged in "Dissagree Bot" should turn in to "I will dissagree with [user name]" and the sign in button should turn in to a sign out
```

## Prompt 3

```txt
add a dark mode switch button on top of the page www.shadcn-svelte.com/docs/dark-mode/svelte
```

## Manual changes 1

Added a 