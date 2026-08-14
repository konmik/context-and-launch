// Stands in for the Herdr CLI so e2e tests can exercise the code paths that only
// run when Herdr reports a live agent. The test owns the state file: it decides
// which workspace, pane, and agent Herdr reports, and reads back the prompts
// this script was asked to deliver.
import fs from "node:fs";

const statePath = process.env.CONTEXT_FAKE_HERDR_STATE;
if (!statePath) {
  console.error("CONTEXT_FAKE_HERDR_STATE is not set.");
  process.exit(1);
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

const [command, subcommand, ...rest] = process.argv.slice(2);
const state = readState();

if (command === "workspace" && subcommand === "list") {
  console.log(JSON.stringify({ result: { workspaces: state.workspaces } }));
} else if (command === "agent" && subcommand === "list") {
  console.log(JSON.stringify({ result: { agents: state.agents } }));
} else if (command === "pane" && subcommand === "list") {
  console.log(JSON.stringify({ result: { panes: state.panes } }));
} else if (command === "pane" && subcommand === "run") {
  const [paneId, ...promptParts] = rest;
  state.delivered.push({ paneId, prompt: promptParts.join(" ") });
  // A real agent starts working on the prompt it was just handed, and the test
  // decides when it reports back as idle.
  for (const agent of state.agents) {
    if (agent.pane_id === paneId) agent.agent_status = "working";
  }
  writeState(state);
  console.log(JSON.stringify({ result: {} }));
} else if (command === "agent" && subcommand === "prompt") {
  const [paneId, ...promptParts] = rest;
  state.delivered.push({ paneId, prompt: promptParts.join(" ") });
  // Submitting a prompt through the agent surface starts the agent working on
  // it, just like pane run, and the test decides when it reports back idle.
  for (const agent of state.agents) {
    if (agent.pane_id === paneId) agent.agent_status = "working";
  }
  writeState(state);
  console.log(JSON.stringify({ result: { agent: { agent_status: "working" } } }));
} else {
  console.error(`fake-herdr received an unsupported command: ${process.argv.slice(2).join(" ")}`);
  process.exit(1);
}
