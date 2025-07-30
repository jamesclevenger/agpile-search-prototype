import { NextRequest, NextResponse } from 'next/server';
import { getUserPreference, setUserPreference, ensureDefaultUser } from '@/lib/mysql';

// Temporary user ID - replace with actual authentication later
const TEMP_USER_ID = 1;
const BRAPI_ENDPOINTS_KEY = 'brapi_endpoints';

export async function GET() {
  try {
    // Ensure default user exists
    await ensureDefaultUser();
    
    // Get BrAPI endpoints from database
    const endpointsData = await getUserPreference(TEMP_USER_ID, BRAPI_ENDPOINTS_KEY);
    
    let endpoints = [];
    if (endpointsData) {
      try {
        endpoints = JSON.parse(endpointsData);
      } catch (parseError) {
        console.error('Error parsing endpoints data:', parseError);
        endpoints = [];
      }
    }

    return NextResponse.json({ endpoints }, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure default user exists
    await ensureDefaultUser();
    
    const body = await request.json();
    const { endpoints } = body;

    // Validate the endpoints data
    if (!Array.isArray(endpoints)) {
      return NextResponse.json(
        { error: 'Endpoints must be an array' },
        { status: 400 }
      );
    }

    // Validate each endpoint
    for (const endpoint of endpoints) {
      if (!endpoint.id || !endpoint.name || !endpoint.url) {
        return NextResponse.json(
          { error: 'Each endpoint must have id, name, and url' },
          { status: 400 }
        );
      }

      // Validate URL format
      try {
        new URL(endpoint.url);
      } catch {
        return NextResponse.json(
          { error: `Invalid URL format for endpoint: ${endpoint.name}` },
          { status: 400 }
        );
      }

      // Ensure isActive is boolean
      if (typeof endpoint.isActive !== 'boolean') {
        return NextResponse.json(
          { error: 'isActive must be a boolean value' },
          { status: 400 }
        );
      }
    }

    // Ensure only one endpoint is active
    const activeEndpoints = endpoints.filter(ep => ep.isActive);
    if (activeEndpoints.length > 1) {
      return NextResponse.json(
        { error: 'Only one endpoint can be active at a time' },
        { status: 400 }
      );
    }

    // If no endpoint is active but endpoints exist, make the first one active
    if (endpoints.length > 0 && activeEndpoints.length === 0) {
      endpoints[0].isActive = true;
    }

    // Ensure no duplicate names
    const names = endpoints.map(ep => ep.name.toLowerCase());
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      return NextResponse.json(
        { error: 'Endpoint names must be unique' },
        { status: 400 }
      );
    }

    // Save to database
    await setUserPreference(
      TEMP_USER_ID,
      BRAPI_ENDPOINTS_KEY,
      JSON.stringify(endpoints)
    );

    return NextResponse.json(
      { message: 'Settings saved successfully', endpoints },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}