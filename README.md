# UCMR5 Water Quality API

Simple API for accessing UCMR5 (Unregulated Contaminant Monitoring Rule) water quality data. Search by ZIP code, PWSID, water system name, or state.

## Quick Start

### API Endpoint
```
https://your-app.vercel.app/api/water-quality
```

### Example Queries

```bash
# Search by ZIP code
GET /api/water-quality?zipcode=12345

# Search by PWSID (Public Water System ID)
GET /api/water-quality?pwsid=NY0000123

# Search by water system name (partial match)
GET /api/water-quality?pws_name=Springfield

# Search by state
GET /api/water-quality?state=NY

# Combine parameters
GET /api/water-quality?state=NY&pws_name=City

# Pagination
GET /api/water-quality?state=NY&limit=10&offset=20
```

### Response Format

```json
{
  "water_systems": [
    {
      "pwsid": "NY0000123",
      "name": "Springfield Water District",
      "state": "NY",
      "region": 2,
      "size": "L",
      "zip_codes": ["12345", "12346"],
      "contaminants": {
        "PFOA": {
          "value": 0.005,
          "unit": "μg/L",
          "detected": true,
          "mrl": 0.004,
          "test_count": 4,
          "latest_test": "2024-03-15"
        },
        "PFOS": {
          "value": "<0.004",
          "unit": "μg/L",
          "detected": false,
          "mrl": 0.004,
          "test_count": 4,
          "latest_test": "2024-03-15"
        },
        "Lithium": {
          "value": 12.5,
          "unit": "μg/L",
          "detected": true,
          "mrl": 0.9,
          "test_count": 4,
          "latest_test": "2024-03-15"
        }
      },
      "summary": {
        "contaminants_detected": 2,
        "last_tested": "2024-03-15",
        "total_samples": 16
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

## Setup Instructions

### 1. Fork/Clone Repository
```bash
git clone https://github.com/YOUR_USERNAME/ucmr5-occurrence-data.git
cd ucmr5-occurrence-data
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Download Data & Build Database (Local Testing)
```bash
# Download the UCMR5 data file
node scripts/download-data.js

# Build the SQLite database
npm run build
```

### 4. Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` and follow prompts
3. Update `DATABASE_URL` in `vercel.json` with your GitHub username
4. Set up GitHub secrets:
   - Go to Settings → Secrets → Actions
   - Add `VERCEL_DEPLOY_HOOK` (get from Vercel dashboard)

### 5. Automatic Updates

The GitHub Action will:
- Run monthly to check for new data
- Convert TSV files to SQLite
- Create a new release with compressed database
- Trigger Vercel redeployment

## Data Sources

- **UCMR5_All.txt**: Main water quality test results
- **UCMR5_ZIPCodes.txt**: ZIP code mappings for water systems
- **UCMR5_AddtlDataElem.txt**: Additional treatment information

Data from: [EPA UCMR5 Data](https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule)

## Contaminants Monitored

The API includes data for 30 contaminants, primarily PFAS compounds:
- PFOA, PFOS, PFBA, PFHxA, PFHxS, PFNA, PFBS
- GenX chemicals
- Lithium
- And more...

## Notes

- **City Search**: Currently not implemented. Use ZIP code instead.
- **Detection Limits**: Values below MRL (Minimum Reporting Level) shown as `<MRL`
- **Data Updates**: Automatically processed monthly via GitHub Actions

## Local Development

```bash
# Start local server
npm run dev

# Test endpoint
curl http://localhost:3000/api/water-quality?zipcode=12345
```

## Contributing

1. Update TSV files in repository
2. GitHub Actions will automatically process and deploy
3. API updates within ~5 minutes

## License

Data is public domain from EPA. Code is MIT licensed.