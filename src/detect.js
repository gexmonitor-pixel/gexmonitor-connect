'use strict';

const { getAllClients } = require('./clients');

/**
 * Detects all supported AI clients present on the system.
 * @param {Record<string, any>} [env]
 * @returns {Promise<{ detected: Array<{ client: import('./clients/base'), evidence: string[] }> }>}
 */
async function detectClients(env = process.env) {
  const clients = getAllClients();
  const detected = [];

  for (const client of clients) {
    const res = await client.detect(env);
    if (res.detected) {
      detected.push({
        client,
        evidence: res.evidence
      });
    }
  }

  return { detected };
}

module.exports = {
  detectClients
};
