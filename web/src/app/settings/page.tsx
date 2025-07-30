'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, EditIcon, TrashIcon, SaveIcon, SettingsIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface BrAPIEndpoint {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
}

interface FormData {
  name: string;
  url: string;
}

export default function SettingsPage() {
  const [endpoints, setEndpoints] = useState<BrAPIEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', url: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setEndpoints(data.endpoints || []);
      } else {
        showMessage('error', 'Failed to load settings');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showMessage('error', 'Error loading settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async (newEndpoints: BrAPIEndpoint[]) => {
    try {
      setSaving(true);
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints: newEndpoints })
      });

      if (response.ok) {
        setEndpoints(newEndpoints);
        
        // Clear BrAPI cache so next MCP query uses the updated active endpoint
        try {
          await fetch('/api/brapi/clear-cache', { method: 'POST' });
        } catch (cacheError) {
          console.warn('Failed to clear BrAPI cache:', cacheError);
          // Don't fail the entire operation if cache clear fails
        }
        
        showMessage('success', 'Settings saved successfully');
      } else {
        showMessage('error', 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showMessage('error', 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      showMessage('error', 'Endpoint name is required');
      return false;
    }
    if (!formData.url.trim()) {
      showMessage('error', 'URL is required');
      return false;
    }
    
    // Basic URL validation
    try {
      new URL(formData.url);
    } catch {
      showMessage('error', 'Please enter a valid URL');
      return false;
    }

    // Check for duplicate names (excluding current editing item)
    const isDuplicate = endpoints.some(endpoint => 
      endpoint.name.toLowerCase() === formData.name.toLowerCase() && 
      endpoint.id !== editingId
    );
    
    if (isDuplicate) {
      showMessage('error', 'An endpoint with this name already exists');
      return false;
    }

    return true;
  };

  const handleAddEndpoint = async () => {
    if (!validateForm()) return;

    const newEndpoint: BrAPIEndpoint = {
      id: uuidv4(),
      name: formData.name.trim(),
      url: formData.url.trim(),
      isActive: endpoints.length === 0 // First endpoint is active by default
    };

    await saveSettings([...endpoints, newEndpoint]);
    setFormData({ name: '', url: '' });
    setShowAddForm(false);
  };

  const handleEditEndpoint = async () => {
    if (!validateForm() || !editingId) return;

    const updatedEndpoints = endpoints.map(endpoint =>
      endpoint.id === editingId
        ? { ...endpoint, name: formData.name.trim(), url: formData.url.trim() }
        : endpoint
    );

    await saveSettings(updatedEndpoints);
    setEditingId(null);
    setFormData({ name: '', url: '' });
  };

  const handleDeleteEndpoint = async (id: string) => {
    const endpointToDelete = endpoints.find(e => e.id === id);
    if (!endpointToDelete) return;

    const updatedEndpoints = endpoints.filter(endpoint => endpoint.id !== id);
    
    // If we deleted the active endpoint and there are others, make the first one active
    if (endpointToDelete.isActive && updatedEndpoints.length > 0) {
      updatedEndpoints[0].isActive = true;
    }

    await saveSettings(updatedEndpoints);
  };

  const handleSetActive = async (id: string) => {
    const updatedEndpoints = endpoints.map(endpoint => ({
      ...endpoint,
      isActive: endpoint.id === id
    }));

    await saveSettings(updatedEndpoints);
  };

  const startEdit = (endpoint: BrAPIEndpoint) => {
    setEditingId(endpoint.id);
    setFormData({ name: endpoint.name, url: endpoint.url });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', url: '' });
  };

  const cancelAdd = () => {
    setShowAddForm(false);
    setFormData({ name: '', url: '' });
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading settings...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <SettingsIcon className="w-8 h-8 text-gray-700" />
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          </div>
          <p className="text-gray-600">Manage your BrAPI endpoints and application preferences</p>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* BrAPI Endpoints Section */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">BrAPI Endpoints</h2>
                <p className="text-sm text-gray-600 mt-1">Configure breeding API endpoints for your data sources</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                disabled={saving || showAddForm}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Add Endpoint
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Add Form */}
            {showAddForm && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Add New BrAPI Endpoint</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Production BrAPI"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://api.example.com/brapi/v2"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddEndpoint}
                    disabled={saving}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    <SaveIcon className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelAdd}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Endpoints List */}
            {endpoints.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No BrAPI endpoints configured yet.</p>
                <p className="text-sm text-gray-400 mt-1">Add your first endpoint to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {endpoints.map((endpoint) => (
                  <div key={endpoint.id} className="border border-gray-200 rounded-lg p-4">
                    {editingId === endpoint.id ? (
                      // Edit Form
                      <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                            <input
                              type="url"
                              value={formData.url}
                              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleEditEndpoint}
                            disabled={saving}
                            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
                          >
                            <SaveIcon className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Display Mode
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <input
                              type="radio"
                              name="activeEndpoint"
                              checked={endpoint.isActive}
                              onChange={() => handleSetActive(endpoint.id)}
                              className="w-4 h-4 text-primary-500 focus:ring-primary-500"
                            />
                            <h3 className="text-lg font-medium text-gray-900">{endpoint.name}</h3>
                            {endpoint.isActive && (
                              <span className="px-2 py-1 text-xs bg-primary-100 text-primary-800 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 ml-7">{endpoint.url}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(endpoint)}
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                            title="Edit endpoint"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEndpoint(endpoint.id)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                            title="Delete endpoint"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}