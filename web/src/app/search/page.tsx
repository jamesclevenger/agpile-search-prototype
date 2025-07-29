'use client';

import { useState, useEffect, useCallback } from 'react';
import { SearchIcon, FilterIcon, XIcon } from 'lucide-react';
import Image from 'next/image';

interface SearchResult {
  id: string;
  name: string;
  full_name: string;
  type: string;
  catalog_name?: string;
  schema_name?: string;
  table_name?: string;
  volume_name?: string;
  file_name?: string;
  column_name?: string;
  description?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  file_size?: number;
  is_directory?: boolean;
  data_type?: string;
  storage_location?: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  facets?: {
    types: Record<string, number>;
    catalogs: Record<string, number>;
    schemas: Record<string, number>;
    owners: Record<string, number>;
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    catalog: '',
    schema: '',
    owner: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  const searchCatalog = useCallback(async (searchQuery: string = query, currentFilters = filters, page = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery || '*',
        page: page.toString(),
        size: '20'
      });
      
      if (currentFilters.type) params.append('type', currentFilters.type);
      if (currentFilters.catalog) params.append('catalog', currentFilters.catalog);
      if (currentFilters.schema) params.append('schema', currentFilters.schema);
      if (currentFilters.owner) params.append('owner', currentFilters.owner);

      const response = await fetch(`/api/search?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setResults(data);
      } else {
        console.error('Search failed:', data.error);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchCatalog();
  };

  const handleFilterChange = (filterType: string, value: string) => {
    const newFilters = { ...filters, [filterType]: value };
    setFilters(newFilters);
    searchCatalog(query, newFilters);
  };

  const clearFilters = () => {
    const newFilters = { type: '', catalog: '', schema: '', owner: '' };
    setFilters(newFilters);
    searchCatalog(query, newFilters);
  };

  const clearSearch = () => {
    setQuery('');
    const newFilters = { type: '', catalog: '', schema: '', owner: '' };
    setFilters(newFilters);
    searchCatalog('*', newFilters);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'catalog': return '📂';
      case 'schema': return '📋';
      case 'table': return '🗂️';
      case 'column': return '📊';
      case 'volume': return '💾';
      case 'file': return '📄';
      case 'directory': return '📁';
      default: return '📄';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Load initial results
  useEffect(() => {
    searchCatalog('*');
  }, [searchCatalog]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Image 
              src="/fairgrounds_logo.jpg" 
              alt="Fairgrounds Logo" 
              width={32} 
              height={32}
              className="rounded"
            />
            <h1 className="text-3xl font-bold text-gray-900">Fairgrounds Search</h1>
          </div>
          <p className="text-gray-600">Search across catalogs, schemas, tables, columns, volumes, and files</p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search catalogs, tables, files..."
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-gray-600"
                      title="Clear search"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <FilterIcon className="w-4 h-4" />
                Filters
              </button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={filters.type}
                      onChange={(e) => handleFilterChange('type', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">All Types</option>
                      <option value="catalog">Catalogs</option>
                      <option value="schema">Schemas</option>
                      <option value="table">Tables</option>
                      <option value="column">Columns</option>
                      <option value="volume">Volumes</option>
                      <option value="file">Files</option>
                      <option value="directory">Directories</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catalog</label>
                    <select
                      value={filters.catalog}
                      onChange={(e) => handleFilterChange('catalog', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">All Catalogs</option>
                      {results?.facets?.catalogs && Object.entries(results.facets.catalogs).map(([catalog, count]) => (
                        <option key={catalog} value={catalog}>{catalog} ({count})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schema</label>
                    <select
                      value={filters.schema}
                      onChange={(e) => handleFilterChange('schema', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">All Schemas</option>
                      {results?.facets?.schemas && Object.entries(results.facets.schemas).map(([schema, count]) => (
                        <option key={schema} value={schema}>{schema} ({count})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                    <select
                      value={filters.owner}
                      onChange={(e) => handleFilterChange('owner', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">All Owners</option>
                      {results?.facets?.owners && Object.entries(results.facets.owners).map(([owner, count]) => (
                        <option key={owner} value={owner}>{owner} ({count})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Results */}
        {results && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Search Results ({results.total} total)
                </h2>
                {results.facets && (
                  <div className="flex gap-4 text-sm text-gray-600">
                    {Object.entries(results.facets.types).map(([type, count]) => (
                      <span key={type} className="flex items-center gap-1">
                        {getTypeIcon(type)} {type}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {results.results.map((result) => (
                <div key={result.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getTypeIcon(result.type)}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900">{result.name}</h3>
                        <span className="px-2 py-1 text-xs bg-primary-100 text-primary-800 rounded-full">
                          {result.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{result.full_name}</p>
                      {result.description && (
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">{result.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {result.owner && <span>Owner: {result.owner}</span>}
                        {result.data_type && <span>Type: {result.data_type}</span>}
                        {result.file_size !== undefined && result.file_size > 0 && (
                          <span>Size: {formatFileSize(result.file_size)}</span>
                        )}
                        {result.created_at && <span>Created: {formatDate(result.created_at)}</span>}
                      </div>
                      {result.tags && result.tags.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {result.tags.map((tag, index) => (
                            <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {results.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex justify-center">
                  <div className="flex gap-2">
                    {Array.from({ length: Math.min(results.totalPages, 10) }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => searchCatalog(query, filters, i)}
                        className={`px-3 py-1 rounded ${
                          i === results.page
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {results && results.results.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <SearchIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600">Try adjusting your search query or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}