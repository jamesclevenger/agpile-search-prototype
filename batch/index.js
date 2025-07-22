const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

class UnityCatalogIndexer {
  constructor() {
    this.databricksToken = process.env.DATABRICKS_TOKEN;
    this.databricksUrl = process.env.DATABRICKS_WORKSPACE_URL;
    this.solrUrl = `http://${process.env.SOLR_HOST}:${process.env.SOLR_PORT}`;
    this.solrCore = process.env.SOLR_CORE;
    
    this.dbConfig = {
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB
    };
  }

  async createIndexingJob() {
    const connection = await mysql.createConnection(this.dbConfig);
    try {
      const [result] = await connection.execute(
        'INSERT INTO indexing_jobs (job_type, status, started_at) VALUES (?, ?, ?)',
        ['unity_catalog_sync', 'running', new Date()]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating indexing job:', error);
      throw error;
    } finally {
      await connection.end();
    }
  }

  async updateIndexingJob(jobId, status, recordsProcessed = 0, errorMessage = null) {
    const connection = await mysql.createConnection(this.dbConfig);
    try {
      await connection.execute(
        'UPDATE indexing_jobs SET status = ?, completed_at = ?, records_processed = ?, error_message = ? WHERE id = ?',
        [status, new Date(), recordsProcessed, errorMessage, jobId]
      );
    } catch (error) {
      console.error('Error updating indexing job:', error);
    } finally {
      await connection.end();
    }
  }

  async fetchFromDatabricks(endpoint) {
    try {
      const response = await axios.get(`${this.databricksUrl}/api/2.1/unity-catalog/${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.databricksToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching from Databricks ${endpoint}:`, error.message);
      throw error;
    }
  }

  async fetchVolumeFiles(volumePath) {
    try {
      const response = await axios.get(`${this.databricksUrl}/api/2.0/fs/directories${volumePath}`, {
        headers: {
          'Authorization': `Bearer ${this.databricksToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching volume files from ${volumePath}:`, error.message);
      throw error;
    }
  }

  async fetchVolumeFilesRecursive(volumePath, catalog, schema, volume, documents, maxDepth = 10, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      console.warn(`Max depth reached for ${volumePath}, skipping deeper traversal`);
      return;
    }

    try {
      const filesResponse = await this.fetchVolumeFiles(volumePath);
      
      for (const file of filesResponse.contents || []) {
        const fileName = file.name;
        const filePath = file.path;
        const relativePath = filePath.replace(`/Volumes/${catalog}/${schema}/${volume}/`, '');
        
        // Create document for this file/directory
        documents.push({
          id: `file_${catalog}_${schema}_${volume}_${relativePath}`.replace(/[^a-zA-Z0-9_\-]/g, '_'),
          name: fileName,
          full_name: `${catalog}.${schema}.${volume}/${relativePath}`,
          type: file.is_directory ? 'directory' : 'file',
          catalog_name: catalog,
          schema_name: schema,
          volume_name: volume,
          file_name: fileName,
          file_path: relativePath,
          file_size: file.size || 0,
          is_directory: file.is_directory || false,
          comment: '',
          description: file.is_directory ? `Directory in volume ${volume}` : `File in volume ${volume}`,
          owner: '',
          created_at: this.formatTimestamp(file.modification_time),
          updated_at: this.formatTimestamp(file.modification_time),
          tags: [],
          last_modified: this.formatTimestamp(file.modification_time)
        });

        // If it's a directory, recursively fetch its contents
        if (file.is_directory) {
          const subPath = filePath.endsWith('/') ? filePath : `${filePath}/`;
          await this.fetchVolumeFilesRecursive(subPath, catalog, schema, volume, documents, maxDepth, currentDepth + 1);
        }
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`  └─ Path not accessible: ${volumePath} (404)`);
      } else {
        console.warn(`  └─ Error fetching files from ${volumePath}: ${error.message}`);
      }
    }
  }

  async indexToSolr(documents) {
    try {
      const response = await axios.post(
        `${this.solrUrl}/solr/${this.solrCore}/update/json/docs`,
        documents,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            commit: 'true'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error indexing to Solr:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      console.error('Sample document:', JSON.stringify(documents[0], null, 2));
      throw error;
    }
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return new Date().toISOString();
    // If it's a Unix timestamp (number), convert to ISO string
    if (typeof timestamp === 'number') {
      return new Date(timestamp).toISOString();
    }
    // If it's already a string, return as is
    if (typeof timestamp === 'string') {
      return timestamp;
    }
    return new Date().toISOString();
  }

  async syncCatalogs() {
    console.log('Starting catalog sync...');
    const documents = [];
    const excludedCatalogs = ['system', 'hive_metastore'];
    
    try {
      // Fetch catalogs
      const catalogsResponse = await this.fetchFromDatabricks('catalogs');
      
      for (const catalog of catalogsResponse.catalogs || []) {
        // Skip excluded catalogs
        if (excludedCatalogs.includes(catalog.name)) {
          console.log(`Skipping excluded catalog: ${catalog.name}`);
          continue;
        }
        console.log(`Processing catalog: ${catalog.name}`);
        
        // Add catalog document
        documents.push({
          id: `catalog_${catalog.name}`,
          name: catalog.name,
          full_name: catalog.name,
          type: 'catalog',
          catalog_name: catalog.name,
          comment: catalog.comment || '',
          description: catalog.comment || '',
          owner: catalog.owner || '',
          created_at: this.formatTimestamp(catalog.created_at),
          updated_at: this.formatTimestamp(catalog.updated_at),
          tags: catalog.tags || []
        });

        // Fetch schemas for this catalog
        try {
          const schemasResponse = await this.fetchFromDatabricks(`schemas?catalog_name=${catalog.name}`);
          
          for (const schema of schemasResponse.schemas || []) {
            // Skip information_schema as it doesn't support column queries
            if (schema.name === 'information_schema') {
              console.log(`Skipping information_schema: ${schema.name}`);
              continue;
            }
            console.log(`Processing schema: ${schema.name}`);
            
            // Add schema document
            documents.push({
              id: `schema_${catalog.name}_${schema.name}`,
              name: schema.name,
              full_name: `${catalog.name}.${schema.name}`,
              type: 'schema',
              catalog_name: catalog.name,
              schema_name: schema.name,
              comment: schema.comment || '',
              description: schema.comment || '',
              owner: schema.owner || '',
              created_at: this.formatTimestamp(schema.created_at),
              updated_at: this.formatTimestamp(schema.updated_at),
              tags: schema.tags || []
            });

            // Fetch volumes for this schema
            try {
              const volumesResponse = await this.fetchFromDatabricks(`volumes?catalog_name=${catalog.name}&schema_name=${schema.name}`);
              
              for (const volume of volumesResponse.volumes || []) {
                console.log(`Processing volume: ${volume.name}`);
                
                // Add volume document
                documents.push({
                  id: `volume_${catalog.name}_${schema.name}_${volume.name}`,
                  name: volume.name,
                  full_name: `${catalog.name}.${schema.name}.${volume.name}`,
                  type: 'volume',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  volume_name: volume.name,
                  volume_type: volume.volume_type || '',
                  comment: volume.comment || '',
                  description: volume.comment || '',
                  owner: volume.owner || '',
                  created_at: this.formatTimestamp(volume.created_at),
                  updated_at: this.formatTimestamp(volume.updated_at),
                  tags: volume.tags || [],
                  storage_location: volume.storage_location || ''
                });

                // Fetch files for this volume recursively using the Files API
                try {
                  const volumePath = `/Volumes/${catalog.name}/${schema.name}/${volume.name}/`;
                  const initialCount = documents.length;
                  
                  await this.fetchVolumeFilesRecursive(volumePath, catalog.name, schema.name, volume.name, documents);
                  
                  const filesIndexed = documents.length - initialCount;
                  console.log(`  └─ Indexed ${filesIndexed} files/directories for volume ${volume.name}`);
                } catch (error) {
                  if (error.response && error.response.status === 404) {
                    console.log(`  └─ Files not available for volume ${volume.name} (404 - normal for some volume types)`);
                  } else {
                    console.warn(`  └─ Error fetching files for volume ${volume.name}: ${error.message}`);
                  }
                }
              }
            } catch (error) {
              console.warn(`Error fetching volumes for ${schema.name}:`, error.message);
            }

            // Fetch tables for this schema
            try {
              const tablesResponse = await this.fetchFromDatabricks(`tables?catalog_name=${catalog.name}&schema_name=${schema.name}`);
              
              for (const table of tablesResponse.tables || []) {
                console.log(`Processing table: ${table.name}`);
                
                // Add table document
                documents.push({
                  id: `table_${catalog.name}_${schema.name}_${table.name}`,
                  name: table.name,
                  full_name: `${catalog.name}.${schema.name}.${table.name}`,
                  type: 'table',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  table_name: table.name,
                  comment: table.comment || '',
                  description: table.comment || '',
                  owner: table.owner || '',
                  created_at: this.formatTimestamp(table.created_at),
                  updated_at: this.formatTimestamp(table.updated_at),
                  tags: table.tags || [],
                  storage_format: table.storage_format || '',
                  location: table.storage_location || ''
                });

                // Fetch columns for this table (many tables don't support columns API)
                try {
                  const columnsResponse = await this.fetchFromDatabricks(`tables/${catalog.name}.${schema.name}.${table.name}/columns`);
                  
                  for (const column of columnsResponse.columns || []) {
                    documents.push({
                      id: `column_${catalog.name}_${schema.name}_${table.name}_${column.name}`,
                      name: column.name,
                      full_name: `${catalog.name}.${schema.name}.${table.name}.${column.name}`,
                      type: 'column',
                      catalog_name: catalog.name,
                      schema_name: schema.name,
                      table_name: table.name,
                      column_name: column.name,
                      data_type: column.type_name || '',
                      comment: column.comment || '',
                      description: column.comment || '',
                      is_nullable: column.nullable || false,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      tags: column.tags || []
                    });
                  }
                  console.log(`  └─ Indexed ${columnsResponse.columns?.length || 0} columns for ${table.name}`);
                } catch (error) {
                  // Many tables don't support the columns API, so just log as debug info
                  if (error.response && error.response.status === 404) {
                    console.log(`  └─ Columns not available for ${table.name} (404 - normal for some table types)`);
                  } else {
                    console.warn(`  └─ Error fetching columns for ${table.name}: ${error.message}`);
                  }
                }
              }
            } catch (error) {
              console.warn(`Error fetching tables for ${schema.name}:`, error.message);
            }
          }
        } catch (error) {
          console.warn(`Error fetching schemas for ${catalog.name}:`, error.message);
        }
      }

      return documents;
    } catch (error) {
      console.error('Error during catalog sync:', error);
      throw error;
    }
  }

  async run() {
    console.log('Starting Unity Catalog indexing job...');
    
    let jobId;
    try {
      // Create job record
      jobId = await this.createIndexingJob();
      
      // Clear existing index
      await axios.post(
        `${this.solrUrl}/solr/${this.solrCore}/update`,
        '<delete><query>*:*</query></delete>',
        {
          headers: { 'Content-Type': 'application/xml' },
          params: { commit: 'true' }
        }
      );
      
      // Sync catalogs and get documents
      const documents = await this.syncCatalogs();
      
      // Index documents to Solr in batches
      const batchSize = 100;
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        await this.indexToSolr(batch);
        console.log(`Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
      }
      
      // Update job status
      await this.updateIndexingJob(jobId, 'completed', documents.length);
      
      console.log(`Indexing job completed successfully. Processed ${documents.length} documents.`);
      
    } catch (error) {
      console.error('Indexing job failed:', error);
      
      if (jobId) {
        await this.updateIndexingJob(jobId, 'failed', 0, error.message);
      }
      
      process.exit(1);
    }
  }
}

// Run the indexer
const indexer = new UnityCatalogIndexer();
indexer.run();