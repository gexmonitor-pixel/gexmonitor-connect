'use strict';

const ClaudeCodeClient = require('./claude-code');
const CodexClient = require('./codex');
const CursorClient = require('./cursor');
const OpenCodeClient = require('./opencode');
const OpenClawClient = require('./openclaw');

function getAllClients() {
  return [
    new ClaudeCodeClient(),
    new CodexClient(),
    new CursorClient(),
    new OpenCodeClient(),
    new OpenClawClient()
  ];
}

function getClientById(id) {
  const normalized = (id || '').toLowerCase().trim();
  const clients = getAllClients();
  return clients.find(c => c.id === normalized || c.displayName.toLowerCase() === normalized) || null;
}

module.exports = {
  getAllClients,
  getClientById
};
