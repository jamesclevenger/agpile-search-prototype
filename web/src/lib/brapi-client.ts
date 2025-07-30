import { getUserPreference } from './mysql';

// Temporary user ID - matches settings implementation
const TEMP_USER_ID = 1;
const BRAPI_ENDPOINTS_KEY = 'brapi_endpoints';

export interface BrAPIEndpoint {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
}

export interface GermplasmSearchParams {
  germplasmName?: string;
  synonyms?: boolean;
  accessionNumber?: string;
  commonCropName?: string;
  genus?: string;
  species?: string;
  page?: number;
  pageSize?: number;
}

export interface GermplasmEntry {
  germplasmDbId: string;
  germplasmName: string;
  accessionNumber?: string;
  defaultDisplayName: string;
  synonyms?: string[];
  commonCropName?: string;
  genus?: string;
  species?: string;
  subtaxa?: string;
  instituteCode?: string;
  instituteName?: string;
  biologicalStatusOfAccessionCode?: string;
  countryOfOriginCode?: string;
  typeOfGermplasmStorageCode?: string[];
  pedigree?: string;
  seedSource?: string;
  acquisitionDate?: string;
  documentationURL?: string;
  germplasmPreprocessing?: string;
  additionalInfo?: Record<string, unknown>;
  externalReferences?: Array<{
    referenceId: string;
    referenceSource: string;
  }>;
}

export interface BrAPIResponse<T> {
  metadata: {
    datafiles: string[];
    status: Array<{
      message: string;
      messageType: string;
    }>;
    pagination: {
      pageSize: number;
      currentPage: number;
      totalCount: number;
      totalPages: number;
    };
  };
  result: {
    data: T[];
  };
}

export interface BrAPISingleResponse<T> {
  metadata: {
    datafiles: string[];
    status: Array<{
      message: string;
      messageType: string;
    }>;
  };
  result: T;
}

export class BrAPIClient {
  private activeEndpoint: BrAPIEndpoint | null = null;

  async getActiveEndpoint(): Promise<BrAPIEndpoint | null> {
    if (this.activeEndpoint) {
      return this.activeEndpoint;
    }

    try {
      const endpointsData = await getUserPreference(TEMP_USER_ID, BRAPI_ENDPOINTS_KEY);
      if (!endpointsData) {
        return null;
      }

      const endpoints: BrAPIEndpoint[] = JSON.parse(endpointsData);
      const activeEndpoint = endpoints.find(ep => ep.isActive);
      
      this.activeEndpoint = activeEndpoint || null;
      return this.activeEndpoint;
    } catch (error) {
      console.error('Error retrieving active BrAPI endpoint:', error);
      return null;
    }
  }

  private async makeRequest<T>(path: string, params?: Record<string, string>): Promise<BrAPIResponse<T>> {
    const endpoint = await this.getActiveEndpoint();
    if (!endpoint) {
      throw new Error('No active BrAPI endpoint configured. Please configure an endpoint in Settings.');
    }

    // Ensure URL ends with /brapi/v2 if not already present
    let baseUrl = endpoint.url.replace(/\/+$/, ''); // Remove trailing slashes
    if (!baseUrl.includes('/brapi/')) {
      baseUrl += '/brapi/v2';
    }

    const url = new URL(`${baseUrl}${path}`);
    
    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BrAPI request failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  private async makeSingleRequest<T>(path: string, params?: Record<string, string>): Promise<BrAPISingleResponse<T>> {
    const endpoint = await this.getActiveEndpoint();
    if (!endpoint) {
      throw new Error('No active BrAPI endpoint configured. Please configure an endpoint in Settings.');
    }

    // Ensure URL ends with /brapi/v2 if not already present
    let baseUrl = endpoint.url.replace(/\/+$/, ''); // Remove trailing slashes
    if (!baseUrl.includes('/brapi/')) {
      baseUrl += '/brapi/v2';
    }

    const url = new URL(`${baseUrl}${path}`);
    
    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BrAPI request failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  async searchGermplasm(params: GermplasmSearchParams): Promise<BrAPIResponse<GermplasmEntry>> {
    const queryParams: Record<string, string> = {};

    if (params.germplasmName) queryParams.germplasmName = params.germplasmName;
    if (params.accessionNumber) queryParams.accessionNumber = params.accessionNumber;
    if (params.commonCropName) queryParams.commonCropName = params.commonCropName;
    if (params.genus) queryParams.genus = params.genus;
    if (params.species) queryParams.species = params.species;
    if (params.page !== undefined) queryParams.page = params.page.toString();
    if (params.pageSize !== undefined) queryParams.pageSize = params.pageSize.toString();

    return await this.makeRequest<GermplasmEntry>('/germplasm', queryParams);
  }

  async getGermplasmDetails(germplasmDbId: string): Promise<GermplasmEntry> {
    const endpoint = await this.getActiveEndpoint();
    console.log(`Fetching germplasm details for ID: ${germplasmDbId} from endpoint: ${endpoint?.name} (${endpoint?.url})`);
    
    try {
      // Try single item response format first (BrAPI v2 spec)
      const response = await this.makeSingleRequest<GermplasmEntry>(`/germplasm/${germplasmDbId}`);
      console.log('Single item response received:', JSON.stringify(response, null, 2));
      
      if (response.result && typeof response.result === 'object' && 'germplasmDbId' in response.result) {
        return response.result;
      }
      
      throw new Error(`Germplasm with ID '${germplasmDbId}' not found in single item response`);
    } catch (error) {
      console.log('Single item request failed, trying array format:', error instanceof Error ? error.message : 'Unknown error');
      
      // If single item format fails, try array format as fallback
      try {
        const response = await this.makeRequest<GermplasmEntry>(`/germplasm/${germplasmDbId}`);
        console.log('Array response received:', JSON.stringify(response, null, 2));
        
        if (response.result.data && response.result.data.length > 0) {
          return response.result.data[0];
        }
        
        throw new Error(`Germplasm with ID '${germplasmDbId}' does not exist in the database`);
      } catch (fallbackError) {
        console.error('BrAPI germplasm details error (both formats failed):', fallbackError);
        
        // Provide more specific error messages based on HTTP status
        if (fallbackError instanceof Error) {
          if (fallbackError.message.includes('404')) {
            throw new Error(`Germplasm with ID '${germplasmDbId}' does not exist in the database`);
          } else if (fallbackError.message.includes('500')) {
            throw new Error(`Server error when retrieving germplasm '${germplasmDbId}'. The BrAPI endpoint may be experiencing issues.`);
          } else if (fallbackError.message.includes('403') || fallbackError.message.includes('401')) {
            throw new Error(`Access denied when retrieving germplasm '${germplasmDbId}'. Check endpoint permissions.`);
          }
        }
        
        throw new Error(`Failed to retrieve germplasm with ID '${germplasmDbId}': ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; endpointName?: string; url?: string; error?: string }> {
    try {
      const endpoint = await this.getActiveEndpoint();
      if (!endpoint) {
        return { 
          success: false, 
          error: 'No active BrAPI endpoint configured' 
        };
      }

      // Test connection with a simple serverinfo call
      await this.makeRequest('/serverinfo');
      
      return {
        success: true,
        endpointName: endpoint.name,
        url: endpoint.url
      };
    } catch (error) {
      const endpoint = await this.getActiveEndpoint();
      return {
        success: false,
        endpointName: endpoint?.name,
        url: endpoint?.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Clear cached endpoint (useful when settings change)
  clearCache(): void {
    this.activeEndpoint = null;
  }
}

// Singleton instance
export const brapiClient = new BrAPIClient();