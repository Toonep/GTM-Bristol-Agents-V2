# bristol-lead-sourcer

A dynamic SMB lead sourcing agent that aggregates, deduplicates, and scores local business leads across multiple data sources (Google Places, Apollo, SerpAPI, Hunter.io). Designed for home services verticals targeting configurable US states and cities.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example env file and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your keys (see API Key Sources below).

## API Key Sources

| Key | Where to get it |
|-----|----------------|
| `GOOGLE_PLACES_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials |
| `APOLLO_API_KEY` | [apollo.io](https://app.apollo.io) → Settings → Integrations → API |
| `SERPAPI_KEY` | [serpapi.com](https://serpapi.com) → Dashboard → API Key |
| `HUNTER_API_KEY` | [hunter.io](https://hunter.io) → Dashboard → API |

## Configuration

Edit `config.json` to control the run:

```json
{
  "industry": "home_services",
  "specialty": "plumbing",
  "specialty_search_terms": ["plumber", "plumbing", "plumbing contractor"],
  "target_states": ["TX", "CA", "FL"],
  "cities_per_state": 20,
  "leads_target": 2000,
  "output_directory": "./output"
}
```

## CLI Usage

Run the full pipeline:
```bash
node src/index.js
```

Dry run (no API calls, no output written):
```bash
node src/index.js --dry-run
```

Override specialty and target states at runtime:
```bash
node src/index.js --specialty="hvac" --states="TX,FL"
```
