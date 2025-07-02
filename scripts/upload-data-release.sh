#!/bin/bash

# This script uploads the UCMR5_All.txt file as a GitHub release asset

echo "Creating GitHub release for data files..."

# Check if the file exists
if [ ! -f "UCMR5_All.txt" ]; then
    echo "Error: UCMR5_All.txt not found in current directory"
    exit 1
fi

# Create a release
gh release create data-files \
    --title "UCMR5 Data Files" \
    --notes "Large data files for UCMR5 Water Quality API. These files are too large for Git but are required for the API to function." \
    --repo ADS-CORP/ucmr5-occurrence-data

# Upload the data file
echo "Uploading UCMR5_All.txt..."
gh release upload data-files UCMR5_All.txt \
    --repo ADS-CORP/ucmr5-occurrence-data \
    --clobber

echo "Done! The data file is now available at:"
echo "https://github.com/ADS-CORP/ucmr5-occurrence-data/releases/download/data-files/UCMR5_All.txt"