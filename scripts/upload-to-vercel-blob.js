#!/usr/bin/env node

const { put } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

async function uploadToVercelBlob() {
  // Check for Vercel Blob token
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.error('Get your token from: https://vercel.com/dashboard/stores');
    process.exit(1);
  }

  const filePath = path.join(__dirname, '..', 'UCMR5_All.txt');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('Error: UCMR5_All.txt not found');
    console.error('Please download it first using: node scripts/download-data.js');
    process.exit(1);
  }

  console.log('Uploading UCMR5_All.txt to Vercel Blob Storage...');
  
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = await put('ucmr5/UCMR5_All.txt', fileBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    console.log('Upload successful!');
    console.log('Blob URL:', blob.url);
    console.log('\nAdd this URL to your environment variables:');
    console.log(`UCMR5_DATA_URL=${blob.url}`);
    
    // Save URL to file for reference
    fs.writeFileSync(
      path.join(__dirname, '..', '.blob-urls.json'),
      JSON.stringify({ UCMR5_All: blob.url }, null, 2)
    );
    
  } catch (error) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }
}

uploadToVercelBlob();