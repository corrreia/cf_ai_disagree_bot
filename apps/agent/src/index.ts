import { Agent } from "agents";

export class MyAgent extends Agent {
  // Define methods on the Agent:
  // https://developers.cloudflare.com/agents/api-reference/agents-api/
  //
  // Every Agent has built in state via this.setState and this.sql
  // Built-in scheduling via this.schedule
  // Agents support WebSockets, HTTP requests, state synchronization and
  // can run for seconds, minutes or hours: as long as the tasks need.
}

export default {
  fetch: () => new Response("Agent worker is running", { status: 200 }),
};
