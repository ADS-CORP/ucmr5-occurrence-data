// Direct Vercel Blob API - reads data directly from blob storage
export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(request.url);
    const params = {
      zipcode: url.searchParams.get('zipcode'),
      pwsid: url.searchParams.get('pwsid'),
      pws_name: url.searchParams.get('pws_name'),
      state: url.searchParams.get('state'),
      limit: parseInt(url.searchParams.get('limit') || '10'),
      offset: parseInt(url.searchParams.get('offset') || '0')
    };
    
    // Get blob URL from environment or use the one you'll set
    const blobUrl = process.env.UCMR5_BLOB_URL || 'YOUR_BLOB_URL_HERE';
    
    // For large file processing, we'll return instructions
    // In production, you'd process this server-side or use a database
    return new Response(JSON.stringify({
      message: "Data file uploaded to Vercel Blob",
      blob_url: blobUrl,
      next_steps: [
        "1. Run the GitHub Action to process the data into SQLite",
        "2. Upload the processed database to blob storage",
        "3. Update the API to query the database"
      ],
      params: params
    }, null, 2), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

export const config = {
  runtime: 'edge',
};