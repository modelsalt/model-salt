// The two edits setup makes in a user's own files: the Codex config table and the old instructions line.
// usage: node --test checks/setup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOmit, dropLine, LINE } from '../src/setup.mjs';

const toml = 'model = "x"\n\n[mcp_servers.model-salt]\ncommand = "npx"\nargs = ["-y", "model-salt", "openai"]\n\n[mcp_servers.model-salt.env]\nA = "1"\n\n[mcp_servers.other]\ncommand = "o"\n';

test('omit_tools_from goes into the model-salt table only, once', () => {
  const once = addOmit(toml);
  assert.equal(once, toml.replace('[mcp_servers.model-salt]\n', '[mcp_servers.model-salt]\nomit_tools_from = ["deferred"]\n'));
  assert.equal(addOmit(once), once);
  assert.equal(addOmit('[mcp_servers.other]\ncommand = "o"\n'), null);
  assert.ok(addOmit('[mcp_servers."model-salt"]\ncommand = "npx"\n').includes('omit_tools_from'));
});

test('the line goes, the user\'s own text stays', () => {
  assert.equal(dropLine(`# Mine\nKeep this.\n\n${LINE}\n`), '# Mine\nKeep this.\n');
  assert.equal(dropLine(`${LINE}\n`), '');
  assert.equal(dropLine(`A\n\n${LINE}\n\nB\n`), 'A\n\nB\n');
  assert.equal(dropLine('Before any task, call model_salt once and do X.\n'), 'Before any task, call model_salt once and do X.\n');
});
