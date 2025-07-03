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
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0')
    };
    
    // Validate parameters
    if (!params.zipcode && !params.pwsid && !params.pws_name && !params.state) {
      return new Response(JSON.stringify({
        error: 'At least one search parameter required (zipcode, pwsid, pws_name, or state)'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    
    let results = [];
    
    // Handle ZIP code search
    if (params.zipcode) {
      const zipIndexUrl = new URL('/api/data/zip-index.json', request.url);
      const zipResponse = await fetch(zipIndexUrl);
      const zipIndex = await zipResponse.json();
      
      const systems = zipIndex[params.zipcode] || [];
      for (const { pwsid, state } of systems) {
        const stateDataUrl = new URL(`/api/data/${state}.json`, request.url);
        const stateResponse = await fetch(stateDataUrl);
        const stateData = await stateResponse.json();
        
        const system = stateData.find(s => s.pwsid === pwsid);
        if (system) results.push(system);
      }
    }
    
    // Handle state search
    else if (params.state && !params.pws_name && !params.pwsid) {
      const stateDataUrl = new URL(`/api/data/${params.state}.json`, request.url);
      const response = await fetch(stateDataUrl);
      
      if (!response.ok) {
        return new Response(JSON.stringify({
          error: `State ${params.state} not found`
        }), {
          status: 404,
          headers: corsHeaders
        });
      }
      
      results = await response.json();
    }
    
    // Handle other searches (need to search all states)
    else {
      const indexUrl = new URL('/api/data/index.json', request.url);
      const indexResponse = await fetch(indexUrl);
      const stateIndex = await indexResponse.json();
      
      // Search relevant states
      const statesToSearch = params.state ? [params.state] : Object.keys(stateIndex);
      
      for (const state of statesToSearch) {
        const stateDataUrl = new URL(`/api/data/${state}.json`, request.url);
        const response = await fetch(stateDataUrl);
        const stateData = await response.json();
        
        for (const system of stateData) {
          if (params.pwsid && system.pwsid === params.pwsid.toUpperCase()) {
            results.push(system);
          } else if (params.pws_name && system.pws_name.toLowerCase().includes(params.pws_name.toLowerCase())) {
            results.push(system);
          }
        }
      }
    }
    
    // Apply pagination
    const total = results.length;
    const paginatedResults = results.slice(params.offset, params.offset + params.limit);
    
    return new Response(JSON.stringify({
      water_systems: paginatedResults,
      pagination: {
        total,
        limit: params.limit,
        offset: params.offset,
        has_more: params.offset + params.limit < total
      }
    }, null, 2), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('API Error:', error);
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