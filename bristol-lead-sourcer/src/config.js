// Loads and merges config.json with environment variables for use across the pipeline.

const path = require('path');
const fs = require('fs');
const { createLogger } = require('./utils/logger');

const log = createLogger('config');

const API_KEY_SLOTS = [
  'GOOGLE_PLACES_API_KEY',
  'APOLLO_API_KEY',
  'SERPAPI_KEY',
  'HUNTER_API_KEY',
];

function checkApiKeys() {
  const present = [];
  const missing = [];

  for (const key of API_KEY_SLOTS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  log.debug(`API keys present (${present.length}/4): ${present.length ? present.join(', ') : 'none'}`);
  log.debug(`API keys missing (${missing.length}/4): ${missing.length ? missing.join(', ') : 'none'}`);

  return { present, missing };
}

function loadConfig(cliOverrides = {}) {
  require('dotenv').config();

  const configPath = path.resolve(__dirname, '..', 'config.json');
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    log.error(`Failed to read config.json at ${configPath}: ${err.message}`);
    process.exit(1);
  }

  const config = { ...fileConfig };

  // CLI overrides — states and target are the most common runtime overrides
  if (cliOverrides.states) {
    config.target_states = cliOverrides.states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  if (cliOverrides.target) {
    config.leads_target = parseInt(cliOverrides.target, 10);
  }
  if (cliOverrides.citiesPerState) {
    config.cities_per_state = parseInt(cliOverrides.citiesPerState, 10);
  }

  // Specialty override: if changing to a different specialty, reset search terms to the new value.
  // If the CLI specialty matches config.json, keep the richer search terms from file.
  // For multi-term search on a new specialty, update specialty_search_terms in config.json.
  if (cliOverrides.specialty) {
    if (cliOverrides.specialty !== fileConfig.specialty) {
      config.specialty_search_terms = [cliOverrides.specialty];
    }
    config.specialty = cliOverrides.specialty;
  }
  if (cliOverrides.industry) {
    config.industry = cliOverrides.industry;
  }

  // Ensure required fields have defaults
  config.cities_per_state = config.cities_per_state || 20;
  config.leads_target = config.leads_target || 2000;
  config.output_directory = config.output_directory || './output';
  config.specialty_search_terms = config.specialty_search_terms || [config.specialty];

  log.debug(`Config loaded — industry: ${config.industry}, specialty: ${config.specialty}`);
  log.debug(`States: ${config.target_states.join(', ')}, target: ${config.leads_target}, cities/state: ${config.cities_per_state}`);
  log.debug(`Search terms: ${config.specialty_search_terms.join(', ')}`);

  checkApiKeys();

  return config;
}

module.exports = { loadConfig, checkApiKeys };
