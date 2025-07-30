import { NextResponse } from 'next/server';
import { brapiClient } from '@/lib/brapi-client';

export async function POST() {
  try {
    // Clear the cached endpoint so the next request will fetch the updated active endpoint
    brapiClient.clearCache();
    
    return NextResponse.json({ message: 'BrAPI cache cleared successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error clearing BrAPI cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear BrAPI cache' },
      { status: 500 }
    );
  }
}