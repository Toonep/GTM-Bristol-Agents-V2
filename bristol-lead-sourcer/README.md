# bristol-lead-sourcer

A dynamic SMB lead sourcing agent that aggregates, deduplicates, and scores local business leads across Google Places, Apollo.io, SerpAPI, and Hunter.io. Designed for home services verticals (plumbing, HVAC, electrical, roofing, etc.) with zero hardcoded industry logic — everything is driven by `config.json`.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env and add API keys
cp .env.example .env
```

Edit `.env`:
```
GOOGLE_PLACES_API_KEY=your_key_here
APOLLO_API_KEY=your_key_here
SERPAPI_KEY=your_key_here
HUNTER_API_KEY=your_key_here
```

---

## API Key Sources

| Key | Where to get it |
|-----|----------------|
| `GOOGLE_PLACES_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create Key → enable Places API |
| `APOLLO_API_KEY` | [apollo.io](https://app.apollo.io) → Settings → Integrations → API Keys |
| `SERPAPI_KEY` | [serpapi.com](https://serpapi.com) → Dashboard → API Key |
| `HUNTER_API_KEY` | [hunter.io](https://hunter.io) → Dashboard → API |

All four keys are optional — missing sources are skipped gracefully. Google Places is the primary source and required for any leads to be collected.

---

## Configuration (`config.json`)

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

| Field | Description |
|-------|-------------|
| `industry` | Recorded on every lead record. No search logic depends on this. |
| `specialty` | Recorded on every lead record and used in output filenames. |
| `specialty_search_terms` | What gets sent to Google Places. Add as many terms as needed. |
| `target_states` | Default states for runs with no `--states` flag. |
| `cities_per_state` | How many cities to query per state (max 30). |
| `leads_target` | Stop collecting after this many clean leads. |
| `output_directory` | Where JSON, CSV, and log files are written. |

---

## Switching Industries and Specialties

The agent has zero hardcoded industry logic. To switch verticals, edit `config.json` only:

**HVAC:**
```json
{
  "specialty": "hvac",
  "specialty_search_terms": ["hvac", "heating and cooling", "air conditioning", "furnace repair"]
}
```

**Electrical:**
```json
{
  "specialty": "electrical",
  "specialty_search_terms": ["electrician", "electrical contractor", "electrical repair"]
}
```

**Roofing:**
```json
{
  "specialty": "roofing",
  "specialty_search_terms": ["roofer", "roofing contractor", "roof repair", "roof replacement"]
}
```

No code changes required. Output filenames and lead records will automatically reflect the new specialty.

---

## CLI Commands

**Validate setup before any live calls (always run this first):**
```bash
node src/index.js --dry-run
```
Checks API key presence, validates city lists, writes a sample record to output, confirms schema.

**Full run using config.json defaults:**
```bash
node src/index.js
```

**Constrained test — single state, low target:**
```bash
node src/index.js --states="TX" --target=50
```

**Multi-state production run:**
```bash
node src/index.js --states="TX,CA,FL,OH,PA" --target=2000
```

**Override specialty at runtime (uses single search term; for multi-term, update config.json):**
```bash
node src/index.js --specialty="hvac" --states="TX,FL"
```

**Override industry:**
```bash
node src/index.js --industry="construction" --specialty="general_contractor" --states="TX"
```

**Reduce cities per state for a faster run:**
```bash
node src/index.js --states="TX" --cities-per-state=5 --target=100
```

**Show debug output including API key status:**
```bash
LOG_LEVEL=debug node src/index.js --dry-run
```

---

## Output Files

Every run writes files to `output/` (or the configured directory):

| File | Description |
|------|-------------|
| `leads_{specialty}_{states}_{timestamp}.json` | Full lead records as JSON array — all 27 schema fields |
| `leads_{specialty}_{states}_{timestamp}.csv` | Same data as CSV, headers match schema field names |
| `duplicates_{timestamp}.json` | Records removed by deduplicator, with `duplicate_reason` field |
| `output/pipeline.log` | Persistent log of all runs |

**Lead record schema (27 fields):**
```
id, business_name, owner_first_name, owner_last_name, owner_title,
phone_primary, phone_secondary, email_primary, email_secondary,
website, street_address, city, state, zip,
google_place_id, google_rating, google_review_count,
employee_count_estimate, revenue_estimate, years_in_business, linkedin_url,
industry, specialty, source_primary, source_secondary,
confidence_score, date_sourced
```
Every field is always present. Unpopulated fields are `null`, never omitted.

---

## Estimated API Costs per 1,000 Leads

| Source | What it does | Free tier | Paid cost est. |
|--------|-------------|-----------|---------------|
| **Google Places** | Base record (name, phone, address, rating) | $200/mo credit | ~$3–5 per 1,000 leads (Text Search + Details calls) |
| **Apollo.io** | Owner name, email, employee count | 50 exports/mo | ~$0.07–0.15 per enriched lead (Basic plan) |
| **SerpAPI** | Owner name gap-fill only (fires when Apollo misses) | 100 searches/mo | ~$0.005–0.02 per search (only ~20–30% of leads trigger this) |
| **Hunter.io** | Email fallback only (fires when email still missing) | 25 searches/mo | ~$0.005–0.02 per search (only ~30–40% of leads trigger this) |

**Rough total per 1,000 leads: $10–25** depending on Apollo hit rate and how many records reach SerpAPI/Hunter.

Google Places is the only required paid call per lead. Apollo, SerpAPI, and Hunter only fire on records that need enrichment.

---

## Source Priority Chain

```
Google Places  →  Apollo  →  SerpAPI (owner missing?)  →  Hunter (email missing + website present?)
    ↓                ↓              ↓                              ↓
base record      enrichment     gap fill                    email fallback
```

Deduplication runs before enrichment (saves API quota on duplicates).
Scoring runs after all enrichment (0–100 based on field completeness).

---

## Cron Scheduling

To run on a schedule, wrap the pipeline in a `node-cron` job. Create `src/scheduler.js`:

```javascript
const cron = require('node-cron');
const { execSync } = require('child_process');

// Run every Sunday at 2am
cron.schedule('0 2 * * 0', () => {
  console.log('Scheduled lead run starting...');
  try {
    execSync('node src/index.js --states="TX,CA,FL" --target=2000', {
      cwd: __dirname + '/..',
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Scheduled run failed:', err.message);
  }
});

console.log('Scheduler active — next run: Sunday 2am');
```

Run the scheduler:
```bash
node src/scheduler.js
```

Alternatively, use a system crontab or a process manager like PM2:
```bash
pm2 start src/scheduler.js --name bristol-scheduler
pm2 save
```

---

## Full Run Pre-Flight Checklist

Before running `--target=2000` across 5 states:

1. `node src/index.js --dry-run` — confirms keys, city lists, schema
2. `LOG_LEVEL=debug node src/index.js --dry-run` — verify all 4 keys show as **present**
3. `node src/index.js --states="TX" --target=50` — small live test, check output files
4. Review `output/pipeline.log` for any rate-limit warnings
5. Approve full run: `node src/index.js --states="TX,CA,FL,OH,PA" --target=2000`
