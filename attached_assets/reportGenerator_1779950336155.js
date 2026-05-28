#!/usr/bin/env node

/**
 * Email Report Generator
 * Reads test results and defects from Excel files and sends formatted HTML email report
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
let mysql;
try {
  mysql = require('mysql2/promise');
} catch (error) {
  console.warn('mysql2 not installed. Database connectivity will not be available.');
  mysql = null;
}

class ReportGenerator {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, 'reportConfig.json');
    this.config = this.loadConfig();
    this.emailConfig = this.loadEmailConfig();
    this.dbConfig = this.loadDatabaseConfig();
    this.sharp = this.loadSharp();
    this.puppeteer = this.loadPuppeteer();
    this.emailAttachments = [];
  }

  loadSharp() {
    try {
      return require('sharp');
    } catch (error) {
      console.warn('Sharp is not installed or failed to load. Pie chart images will fall back to inline SVG.');
      return null;
    }
  }

  loadPuppeteer() {
    try {
      return require('puppeteer');
    } catch (error) {
      console.warn('Puppeteer is not installed or failed to load. Email will fall back to HTML format.');
      return null;
    }
  }

  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }
    return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
  }

  loadEmailConfig() {
    // Load email configuration from DataSheet/SentEmail.xlsx
    const emailConfigPath = path.join(path.dirname(this.configPath), 'DataSheet', 'SentEmail.xlsx');
    
    if (!fs.existsSync(emailConfigPath)) {
      console.warn(`Email config file not found: ${emailConfigPath}. Using defaults from reportConfig.json`);
      return this.config.mail || {};
    }

    try {
      const workbook = XLSX.readFile(emailConfigPath);
      const worksheet = workbook.Sheets['Email'];
      
      if (!worksheet) {
        console.warn('Email sheet not found in SentEmail.xlsx. Using defaults from reportConfig.json');
        return this.config.mail || {};
      }

      // Get all rows as objects
      const rows = XLSX.utils.sheet_to_json(worksheet);
      
      if (rows.length === 0) {
        console.warn('No email configuration found in SentEmail.xlsx. Using defaults from reportConfig.json');
        return this.config.mail || {};
      }

      // Get first data row
      const emailData = rows[0];
      
      // Convert port to number and secure to boolean
      return {
        host: emailData.host || 'smtp.gmail.com',
        port: parseInt(emailData.port) || 587,
        isSSL: emailData.secure === true || emailData.secure === 'true',
        user: emailData.user || '',
        password: emailData.password || '',
        from: emailData.from || '',
        to: emailData.to || '',
        cc: emailData.cc || '',
        bcc: emailData.bcc || '',
        subject: emailData.subject || 'Test Execution & Defect Status Summary for dd/mm/yyyy'
      };
    } catch (error) {
      console.warn(`Error reading email config from SentEmail.xlsx: ${error.message}. Using defaults from reportConfig.json`);
      return this.config.mail || {};
    }
  }

  loadDatabaseConfig() {
    // Load database configuration from the 'Database' sheet in DataSheet/SentEmail.xlsx
    const excelPath = path.join(path.dirname(this.configPath), 'DataSheet', 'SentEmail.xlsx');

    if (!fs.existsSync(excelPath)) {
      console.warn('SentEmail.xlsx not found. Database connection will not be available.');
      return null;
    }

    try {
      const workbook = XLSX.readFile(excelPath);
      const worksheet = workbook.Sheets['Database'];

      if (!worksheet) {
        console.warn(
          'No "Database" sheet found in SentEmail.xlsx. ' +
          'Add a sheet named "Database" with columns: host, port, database, user, password'
        );
        return null;
      }

      const rows = XLSX.utils.sheet_to_json(worksheet);
      if (rows.length === 0) {
        console.warn('Database sheet in SentEmail.xlsx is empty.');
        return null;
      }

      const d = rows[0];
      return {
        host:     d.host     || '10.10.4.130',
        port:     parseInt(d.port) || 3306,
        database: d.database || 'redmine',
        user:     d.user     || '',
        password: String(d.password || '')
      };
    } catch (error) {
      console.warn(`Error reading database config from SentEmail.xlsx: ${error.message}`);
      return null;
    }
  }

  formatReportDate(date = new Date()) {
    // Format date in Malaysia timezone (Asia/Kuala_Lumpur)
    const formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Kuala_Lumpur'
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    return `${day}/${month}/${year}`;
  }

  formatReportDateTime(date = new Date()) {
    // Format date and time in Malaysia timezone (Asia/Kuala_Lumpur, UTC+8)
    const formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kuala_Lumpur'
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    return `${day}/${month}/${year} [${hour}:${minute}]`;
  }

  /**
   * Parse CSV line handling quoted fields
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Double quotes escaped as ""
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());
    return result;
  }

  getCategories(sectionName, defaultCategories = []) {
    const section = this.config[sectionName] || {};
    if (Array.isArray(section.categories) && section.categories.length > 0) {
      return section.categories;
    }
    return defaultCategories;
  }

  findCategory(sectionName, rawStatus) {
    const status = this.normalizeValue(rawStatus);
    const categories = this.getCategories(sectionName);
    return categories.find(category =>
      Array.isArray(category.values) && category.values.some(value => this.normalizeValue(value) === status)
    );
  }

  /**
   * Normalize status values for comparison
   */
  normalizeValue(value) {
    if (!value) return '';
    return value.toString().toLowerCase().trim().replace(/\s+/g, '');
  }

  initStats(categories) {
    const stats = {
      total: 0,
      unknown: 0,
      details: [],
      categories: {}
    };

    categories.forEach(category => {
      stats.categories[category.key] = 0;
    });

    return stats;
  }

  /**
   * Read file content and parse as CSV or XLSX based on extension
   * For XLSX files, reads the specified sheet name or defaults to the first sheet
   */
  readFileContent(filePath, sheetName = null) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.xlsx' || ext === '.xls') {
      // Read XLSX file
      const workbook = XLSX.readFile(filePath);
      let targetSheet = null;
      
      if (sheetName) {
        // Use specified sheet name
        if (!workbook.Sheets[sheetName]) {
          console.warn(`Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`);
          console.warn(`Falling back to first sheet: "${workbook.SheetNames[0]}"`);
          targetSheet = workbook.Sheets[workbook.SheetNames[0]];
        } else {
          console.log(`Reading sheet "${sheetName}" from ${path.basename(filePath)}`);
          targetSheet = workbook.Sheets[sheetName];
        }
      } else {
        // Use first sheet by default
        targetSheet = workbook.Sheets[workbook.SheetNames[0]];
      }
      
      return XLSX.utils.sheet_to_csv(targetSheet);
    } else if (ext === '.csv') {
      // Read CSV file
      return fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error(`Unsupported file format: ${ext}. Supported formats are .csv and .xlsx`);
    }
  }

  /**
   * Read test results from CSV or XLSX
   */
  readTestResults() {
    const filePath = path.join(__dirname, 'DataSheet', this.config.testResults.file);
    const defaultCategories = [
      { key: 'pass', label: 'Passed', values: ['pass'], color: '#27ae60' },
      { key: 'fail', label: 'Failed', values: ['fail'], color: '#e74c3c' },
      { key: 'notExecuted', label: 'Not Executed', values: ['not executed', 'notexecuted', 'not run'], color: '#f39c12' }
    ];

    const categories = this.getCategories('testResults', defaultCategories);

    if (!fs.existsSync(filePath)) {
      console.warn(`Test results file not found: ${filePath}`);
      return this.initStats(categories);
    }

    try {
      // Read file content (auto-detects CSV or XLSX by extension)
      const csvContent = this.readFileContent(filePath, this.config.testResults.sheet);
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        console.warn('Test results CSV has no data rows');
        return this.initStats(categories);
      }

      // Parse header with proper CSV handling
      const header = this.parseCSVLine(lines[0]);
      console.log('CSV Header:', header);

      // Find column indices for aggregated data
      const totalIndex = header.findIndex(col => col.toLowerCase().includes('total'));
      const passedIndex = header.findIndex(col => col.toLowerCase().includes('passed'));
      const failedIndex = header.findIndex(col => col.toLowerCase().includes('failed'));
      const blockedIndex = header.findIndex(col => col.toLowerCase().includes('blocked'));
      const inProgressIndex = header.findIndex(col => col.toLowerCase().includes('in progress'));
      const notExecutedIndex = header.findIndex(col => col.toLowerCase().includes('not executed'));

      console.log(`Found ${lines.length - 1} test result rows`);

      const stats = this.initStats(categories);
      let totalTests = 0;

      // Parse data rows and aggregate totals
      for (let i = 1; i < lines.length; i++) {
        const columns = this.parseCSVLine(lines[i]);
        if (columns.length === 0) continue; // Skip empty rows

        // Skip the TOTAL row for aggregation
        if (columns[0] && columns[0].toLowerCase().includes('total')) {
          continue;
        }

        // Create row object for details
        const row = {};
        header.forEach((colName, index) => {
          row[colName] = columns[index] || '';
        });
        stats.details.push(row);

        // Aggregate counts
        if (passedIndex !== -1 && columns[passedIndex]) {
          const passed = parseInt(columns[passedIndex].replace(/,/g, '')) || 0;
          stats.categories.pass += passed;
          totalTests += passed;
        }

        if (failedIndex !== -1 && columns[failedIndex]) {
          const failed = parseInt(columns[failedIndex].replace(/,/g, '')) || 0;
          stats.categories.fail += failed;
          totalTests += failed;
        }

        if (blockedIndex !== -1 && columns[blockedIndex]) {
          const blocked = parseInt(columns[blockedIndex].replace(/,/g, '')) || 0;
          stats.categories.blocked += blocked;
          totalTests += blocked;
        }

        if (inProgressIndex !== -1 && columns[inProgressIndex]) {
          const inProgress = parseInt(columns[inProgressIndex].replace(/,/g, '')) || 0;
          stats.categories.inProgress += inProgress;
          totalTests += inProgress;
        }

        if (notExecutedIndex !== -1 && columns[notExecutedIndex]) {
          const notExecuted = parseInt(columns[notExecutedIndex].replace(/,/g, '')) || 0;
          stats.categories.notExecuted += notExecuted;
          totalTests += notExecuted;
        }
      }

      stats.total = totalTests;
      console.log('Test stats:', stats.categories, `Total=${stats.total}`);
      return stats;
    } catch (error) {
      console.error('Error reading test results:', error.message);
      return this.initStats(categories);
    }
  }

  /**
   * Parse CSV line handling quoted fields
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Double quotes escaped as ""
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());
    return result;
  }

  /**
   * Fetch defects from Redmine database
   */
  async fetchDefectsFromDatabase(redminePrefix = '34384') {
    if (!mysql) {
      console.warn('mysql2 not available. Skipping database query.');
      return null;
    }

    const dbConfig = this.loadDbConfig();
    if (!dbConfig) {
      console.warn('Database configuration not available. Skipping database query.');
      return null;
    }

    try {
      console.log(`Attempting database connection to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      console.log(`Fetching defects with redmine_prefix: ${redminePrefix}`);
      
      const connection = await mysql.createConnection(dbConfig);
      console.log('Database connection established');
      
      const query = `
        select
            i.id as 'ID',
            i.subject as 'Subject',
            case i.priority_id
                when 1 then 'Low'
                when 2 then 'Normal'
                when 3 then 'High'
                when 4 then 'Urgent'
                else 'Unknown'
            end as 'Priority',
            s.name as 'Status',
            c.name as 'Category',
            concat(u.firstname, ' ', u.lastname) as 'Assignee',
            i.created_on as 'Created'
        from issues i
        left join issue_statuses s on i.status_id = s.id
        left join issue_categories c on i.category_id = c.id
        left join users u on i.assigned_to_id = u.id
        where i.tracker_id = 1
          and i.status_id != 11
          and i.subject like CONCAT('%', ?, '%')
        order by i.created_on asc
      `;
      
      console.log('Executing query...');
      const [rows] = await connection.execute(query, [redminePrefix]);
      console.log(`Query returned ${rows.length} rows`);
      
      await connection.end();
      
      return rows;
    } catch (error) {
      console.error(`Error fetching defects from database: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      return null;
    }
  }

  /**
   * Process defects fetched from database into stats format
   */
  processDefectsFromDatabase(rows) {
    const defaultCategories = [
      { key: 'new', label: 'New', values: ['new'], color: '#f9d77e' },
      { key: 'inProgress', label: 'In Progress', values: ['in progress', 'inprogress'], color: '#1abc9c' },
      { key: 'forQATest', label: 'For QA Test', values: ['for qa test', 'forqatest'], color: '#3498db' },
      { key: 'reopen', label: 'ReOpen', values: ['reopen'], color: '#f4a688' },
      { key: 'done', label: 'Done', values: ['done'], color: '#27ae60' },
      { key: 'roadblock', label: 'Roadblock', values: ['roadblock'], color: '#c7a2d6' },
      { key: 'verified', label: 'Verified', values: ['verified'], color: '#a8d5ba' },
      { key: 'closed', label: 'Closed', values: ['closed'], color: '#bdc3c7' }
    ];

    const categories = this.getCategories('defects', defaultCategories);
    const stats = this.initStats(categories);

    stats.total = rows.length;
    stats.details = rows;

    // Count defects by status
    rows.forEach(row => {
      const status = row.Status || 'Unknown';
      const category = this.findCategory('defects', status);
      if (category) {
        stats.categories[category.key]++;
      }
    });

    return stats;
  }

  /**
   * Read defects from CSV
   */
  readDefects() {
    const filePath = path.join(__dirname, 'DataSheet', this.config.defects.file);
    const defaultCategories = [
      { key: 'open', label: 'Open', values: ['open'], color: '#e74c3c' },
      { key: 'new', label: 'New', values: ['new'], color: '#f9d77e' },
      { key: 'forQATest', label: 'For QA Test', values: ['for qa test', 'forqatest'], color: '#f39c12' },
      { key: 'roadblock', label: 'Roadblock', values: ['roadblock'], color: '#9b59b6' },
      { key: 'reopen', label: 'ReOpen', values: ['reopen'], color: '#e74c3c' },
      { key: 'verified', label: 'Verified', values: ['verified'], color: '#27ae60' },
      { key: 'closed', label: 'Closed', values: ['closed'], color: '#95a5a6' }
    ];

    const categories = this.getCategories('defects', defaultCategories);

    if (!fs.existsSync(filePath)) {
      console.warn(`Defects file not found: ${filePath}`);
      return this.initStats(categories);
    }

    try {
      // Read file content (auto-detects CSV or XLSX by extension)
      const csvContent = this.readFileContent(filePath, this.config.defects.sheet);
      const lines = csvContent.split('\n').filter(line => line.trim());

      
      if (lines.length < 2) {
        console.warn('Defects CSV has no data rows');
        return this.initStats(categories);
      }

      // Parse header with proper CSV handling
      const header = this.parseCSVLine(lines[0]);
      const statusIndex = header.findIndex(col => col.toLowerCase() === this.config.defects.statusColumn.toLowerCase());
      
      if (statusIndex === -1) {
        console.warn(`Status column "${this.config.defects.statusColumn}" not found in CSV header`);
        return this.initStats(categories);
      }

      console.log(`Found ${lines.length - 1} defect rows`);

      const stats = this.initStats(categories);
      stats.total = lines.length - 1;

      // Parse data rows with proper CSV handling
      for (let i = 1; i < lines.length; i++) {
        const columns = this.parseCSVLine(lines[i]);
        if (columns.length > statusIndex) {
          const status = columns[statusIndex];
          const category = this.findCategory('defects', status);
          const normalizedStatus = this.normalizeValue(status);
          console.log(`Row ${i}: Status = "${normalizedStatus}"`);

          if (category) {
            stats.categories[category.key]++;
          } else {
            stats.unknown++;
            console.warn(`Unknown defect status "${status}" found on row ${i}. Add it to reportConfig.json categories to include it in the report.`);
          }

          // Create row object
          const row = {};
          header.forEach((colName, index) => {
            row[colName] = columns[index] || '';
          });
          stats.details.push(row);
        }
      }

      console.log('Defect stats:', stats.categories, `Unknown=${stats.unknown}`);
      return stats;
    } catch (error) {
      console.error('Error reading defects:', error.message);
      return this.initStats(categories);
    }
  }

  /**
   * Generate pie chart SVG markup for the report.
   */
  generatePieChartSvg(values, labels, colors, title, includeXmlDeclaration = true) {
    const total = values.reduce((sum, value) => sum + (value || 0), 0);
    const width = 450;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 80;
    const centerX = width / 2;
    const centerY = height / 2;

    let currentAngle = -Math.PI / 2;
    const elements = [];

    const xmlHeader = includeXmlDeclaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';

    if (total === 0) {
      return `${xmlHeader}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f4f4f4" />
  <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="#e0e0e0" />
  <text x="${centerX}" y="${centerY}" fill="#555" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" dominant-baseline="middle">No Data</text>
</svg>`;
    }

    const positiveValues = values.filter(value => value > 0);
    if (positiveValues.length === 1) {
      const activeIndex = values.findIndex(value => value > 0);
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${colors[activeIndex] || '#999'}" />`);
    } else {
      values.forEach((value, index) => {
        if (!value || value <= 0) return;
        const sliceAngle = (value / total) * Math.PI * 2;
        const endAngle = currentAngle + sliceAngle;
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        const pathData = [
          `M ${centerX} ${centerY}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
          'Z'
        ].join(' ');
        elements.push(`<path d="${pathData}" fill="${colors[index] || '#999'}" />`);
        currentAngle = endAngle;
      });
    }

    return `${xmlHeader}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="border: 1px solid #d1d5da; border-radius: 8px; display: block; margin: 0 auto;">
  <rect width="100%" height="100%" fill="#f7f9fb" />
  ${elements.join('\n  ')}
  <text x="${centerX}" y="28" fill="#2c3e50" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${title}</text>
</svg>`;
  }

  async generatePieChartAttachment(values, labels, colors, title, cid) {
    if (!this.sharp) {
      return null;
    }

    const svg = this.generatePieChartSvg(values, labels, colors, title);
    try {
      const buffer = await this.sharp(Buffer.from(svg)).png().toBuffer();
      return {
        filename: `${cid}.png`,
        content: buffer,
        cid,
        contentType: 'image/png'
      };
    } catch (error) {
      console.warn('Sharp failed to convert SVG to PNG:', error.message);
      return null;
    }
  }

  generatePieChartDataUri(values, labels, colors, title) {
    const svg = this.generatePieChartSvg(values, labels, colors, title, false);
    const encoded = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${encoded}`;
  }

  async generatePieChartHtml(values, labels, colors, title, cid) {
    // Always use inline data URIs so Puppeteer can render the charts.
    // CID references only work inside email clients and cause broken images
    // when a headless browser renders the page for screenshot conversion.
    if (this.sharp) {
      const attachment = await this.generatePieChartAttachment(values, labels, colors, title, cid);
      if (attachment) {
        const dataUri = `data:image/png;base64,${attachment.content.toString('base64')}`;
        return `<img src="${dataUri}" alt="${title}" width="450" style="display:block; margin:0 auto; max-width:100%; height:auto; border:1px solid #d1d5da; border-radius:8px;" />`;
      }
    }

    const dataUri = this.generatePieChartDataUri(values, labels, colors, title);
    return `<img src="${dataUri}" alt="${title}" width="450" style="display:block; margin:0 auto; max-width:100%; height:auto; border:1px solid #d1d5da; border-radius:8px;" />`;
  }

  /**
   * Lighten a hex color by mixing it toward white.
   * factor: 0 = original color, 1 = pure white.
   */
  lightenColor(hex, factor = 0.65) {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return `rgb(${lr},${lg},${lb})`;
  }

  /**
   * Fetch defect data directly from the Redmine MySQL database.
   * redminePrefix is the value passed from Jenkins (e.g. "34384").
   * Returns stats in the same shape as readDefects(), or null on failure.
   */
  async fetchDefectsFromDB(redminePrefix) {
    if (!this.dbConfig) {
      console.warn('No database configuration available. Falling back to file-based defect reading.');
      return null;
    }

    let mysql2;
    try {
      mysql2 = require('mysql2/promise');
    } catch (error) {
      console.warn('mysql2 is not installed (run: npm install mysql2). Falling back to file-based defect reading.');
      return null;
    }

    const defaultCategories = [
      { key: 'open',      label: 'Open',        values: ['open'],                            color: '#e74c3c' },
      { key: 'new',       label: 'New',          values: ['new'],                             color: '#f9d77e' },
      { key: 'inProgress',label: 'In Progress',  values: ['in progress', 'inprogress'],       color: '#1abc9c' },
      { key: 'forQATest', label: 'For QA Test',  values: ['for qa test', 'forqatest'],        color: '#3498db' },
      { key: 'reopen',    label: 'ReOpen',       values: ['reopen'],                          color: '#f4a688' },
      { key: 'done',      label: 'Done',         values: ['done'],                            color: '#27ae60' },
      { key: 'roadblock', label: 'Roadblock',    values: ['roadblock'],                       color: '#c7a2d6' },
      { key: 'verified',  label: 'Verified',     values: ['verified'],                        color: '#a8d5ba' },
      { key: 'closed',    label: 'Closed',       values: ['closed'],                          color: '#bdc3c7' }
    ];
    const categories = this.getCategories('defects', defaultCategories);
    const stats = this.initStats(categories);

    const query = `
      SELECT
        i.id AS \`#\`,
        i.subject AS Subject,
        CASE i.priority_id
          WHEN 1 THEN 'Low'
          WHEN 2 THEN 'Normal'
          WHEN 3 THEN 'High'
          WHEN 4 THEN 'Urgent'
          ELSE 'Unknown'
        END AS Priority,
        s.name AS Status,
        c.name AS Category,
        CONCAT(u.firstname, ' ', u.lastname) AS Assignee,
        i.created_on AS Created
      FROM issues i
      LEFT JOIN issue_statuses s ON i.status_id = s.id
      LEFT JOIN issue_categories c ON i.category_id = c.id
      LEFT JOIN users u ON i.assigned_to_id = u.id
      WHERE i.tracker_id = 1
        AND i.status_id != 11
        AND i.subject LIKE CONCAT('%', ?, '%')
      ORDER BY i.created_on ASC
    `;

    let connection;
    try {
      console.log(`Connecting to database ${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}...`);
      connection = await mysql2.createConnection(this.dbConfig);
      console.log(`Fetching defects with redmine_prefix: "${redminePrefix}"`);
      const [rows] = await connection.execute(query, [redminePrefix]);
      console.log(`Fetched ${rows.length} defects from database.`);

      stats.total = rows.length;

      const dateFormatter = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Kuala_Lumpur'
      });

      for (const row of rows) {
        const formattedDate = row.Created ? dateFormatter.format(new Date(row.Created)) : '';
        const formattedRow = {
          '#':       row['#'],
          Subject:   row.Subject  || '',
          Priority:  row.Priority || '',
          Status:    row.Status   || '',
          Category:  row.Category || '',
          Assignee:  row.Assignee || '',
          Created:   formattedDate
        };
        stats.details.push(formattedRow);

        const category = this.findCategory('defects', row.Status);
        if (category) {
          stats.categories[category.key]++;
        } else {
          stats.unknown++;
          console.warn(`Unknown defect status "${row.Status}" for issue #${row['#']}. Add it to reportConfig.json categories.`);
        }
      }

      console.log('Defect stats from DB:', stats.categories, `Unknown=${stats.unknown}`);
      return stats;
    } catch (error) {
      console.error('Error fetching defects from database:', error.message);
      return null;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Build the list of data file attachments (testResults and defects files
   * referenced in reportConfig.json) to include in the outgoing email.
   * When defects are sourced from the database, the defects file is skipped.
   */
  collectDataFileAttachments(defectsFromDb = false) {
    const attachments = [];
    const sections = ['testResults', 'defects'];

    for (const section of sections) {
      // Skip the defects file when data was fetched live from the database
      if (section === 'defects' && defectsFromDb) {
        console.log('Defects sourced from database — skipping defects file attachment.');
        continue;
      }

      const fileEntry = this.config[section] && this.config[section].file;
      if (!fileEntry) continue;

      const filePath = path.join(__dirname, 'DataSheet', fileEntry);
      if (!fs.existsSync(filePath)) {
        console.warn(`Data file not found, skipping attachment: ${filePath}`);
        continue;
      }

      attachments.push({
        filename: path.basename(filePath),
        path: filePath
      });
      console.log(`Attaching data file: ${path.basename(filePath)}`);
    }

    return attachments;
  }

  /**
   * Render the full HTML report to a PNG image using Puppeteer.
   * Returns a Buffer with the PNG data, or null if Puppeteer is unavailable.
   */
  async generateReportPng(htmlContent) {
    if (!this.puppeteer) return null;
    let browser;
    try {
      browser = await this.puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });
      const page = await browser.newPage();
      // Use a wide viewport so nothing wraps unexpectedly
      await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1.5 });
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      console.log(`Report PNG generated (${Math.round(buffer.length / 1024)} KB)`);
      return buffer;
    } catch (error) {
      console.warn('Puppeteer failed to generate report PNG:', error.message);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTML(testStats, defectStats) {
    // Read stats if not provided
    if (!testStats) {
      testStats = this.readTestResults();
    }
    if (!defectStats) {
      defectStats = this.readDefects();
    }
    const now = new Date();
    const reportDate = this.formatReportDate(now);
    const reportDateTime = this.formatReportDateTime(now);
    const date = reportDateTime;
    const testCategories = this.getCategories('testResults', [
      { key: 'pass', label: 'Passed', values: ['pass'], color: '#a8d5ba' },
      { key: 'fail', label: 'Failed', values: ['fail'], color: '#f4a688' },
      { key: 'blocked', label: 'Blocked', values: ['blocked'], color: '#9b59b6' },
      { key: 'notExecuted', label: 'Not Executed', values: ['not executed', 'notexecuted', 'not run'], color: '#bdc3c7' },
      { key: 'inProgress', label: 'In Progress', values: ['in progress', 'inprogress'], color: '#f9d77e' }
    ]);
    const defectCategories = this.getCategories('defects', [
      { key: 'new', label: 'New', values: ['new'], color: '#f9d77e' },
      { key: 'forQATest', label: 'For QA Test', values: ['for qa test', 'forqatest'], color: '#3498db' },
      { key: 'reopen', label: 'ReOpen', values: ['reopen'], color: '#f4a688' },
      { key: 'done', label: 'Done', values: ['done'], color: '#27ae60' },
      { key: 'roadblock', label: 'Roadblock', values: ['roadblock'], color: '#c7a2d6' },
      { key: 'verified', label: 'Verified', values: ['verified'], color: '#a8d5ba' },
      { key: 'closed', label: 'Closed', values: ['closed'], color: '#bdc3c7' }
    ]).filter(category => category.key !== 'blocker');

    const normalizeLegacyStats = (stats, categories) => {
      if (!stats.categories) {
        stats.categories = {};
      }

      categories.forEach(category => {
        if (typeof stats.categories[category.key] === 'undefined') {
          stats.categories[category.key] = typeof stats[category.key] === 'number' ? stats[category.key] : 0;
        }
      });
    };

    // normalizeLegacyStats(testStats, testCategories);
    // normalizeLegacyStats(defectStats, defectCategories);

    const testItems = testCategories.map(category => {
      const count = testStats.categories[category.key] || 0;
      const percent = testStats.total > 0 ? ((count / testStats.total) * 100).toFixed(1) : '0.0';
      return { ...category, count, percent };
    });

    const defectItems = defectCategories.map(category => {
      const count = defectStats.categories[category.key] || 0;
      const percent = defectStats.total > 0 ? ((count / defectStats.total) * 100).toFixed(1) : '0.0';
      return { ...category, count, percent };
    });

    const passKey = this.config.testResults.successKey || 'pass';
    const passCount = testStats.categories[passKey] || 0;
    const passPercentage = testStats.total > 0 ? ((passCount / testStats.total) * 100).toFixed(2) : '0.00';

    const openStatusKeys = this.config.defects.openKeys || ['new', 'forQATest', 'reopen', 'done', 'inProgress'];
    const defectOpenCount = openStatusKeys.reduce((sum, key) => sum + (defectStats.categories[key] || 0), 0);
    const defectOpenPercent = defectStats.total > 0 ? ((defectOpenCount / defectStats.total) * 100).toFixed(2) : '0.00';

    const testLegendHtml = testItems.map(item => `
                    <div class="legend-item"><span class="legend-color" style="background:${item.color}"></span><span class="legend-spacer"></span>${item.label} (${item.percent}%)</div>`).join('');

    const defectLegendHtml = defectItems.map(item => `
                    <div class="legend-item"><span class="legend-color" style="background:${item.color}"></span><span class="legend-spacer"></span>${item.label} (${item.percent}%)</div>`).join('');

    const testSummaryHtml = testItems.map(item => `
                    <div class="stat-card" style="border-top-color:${item.color};">
                        <div class="label">${item.label.toUpperCase()}</div>
                        <div class="number" style="-webkit-text-stroke:3px ${item.color};color:${this.lightenColor(item.color)};paint-order:stroke fill;">${item.count}</div>
                    </div>`).join('');

    const defectSummaryHtml = defectItems.map(item => `
                    <div class="stat-card" style="border-top-color:${item.color};">
                        <div class="label">${item.label.toUpperCase()}</div>
                        <div class="number" style="-webkit-text-stroke:3px ${item.color};color:${this.lightenColor(item.color)};paint-order:stroke fill;">${item.count}</div>
                    </div>`).join('');

    this.emailAttachments = [];
    const testChartHtml = await this.generatePieChartHtml(
      testItems.map(item => item.count),
      testItems.map(item => item.label),
      testItems.map(item => item.color),
      'Test Results',
      'test-results-chart'
    );

    const defectChartHtml = await this.generatePieChartHtml(
      defectItems.map(item => item.count),
      defectItems.map(item => item.label),
      defectItems.map(item => item.color),
      'Defect Status',
      'defect-status-chart'
    );

    const parseNumber = value => {
      if (value === undefined || value === null) return 0;
      const cleaned = value.toString().replace(/[^0-9-]/g, '');
      return parseInt(cleaned, 10) || 0;
    };

    const moduleRows = (testStats.details || []).filter(module =>
      module.Module && !module.Module.toString().toLowerCase().includes('total')
    );

    const moduleTotals = moduleRows.reduce((totals, module) => {
      totals.total += parseNumber(module.Total || module['Total']);
      totals.passed += parseNumber(module.Passed || module['Passed']);
      totals.failed += parseNumber(module.Failed || module['Failed']);
      totals.blocked += parseNumber(module.Blocked || module['Blocked']);
      totals.inProgress += parseNumber(module['In Progress'] || module['In Progress']);
      totals.notExecuted += parseNumber(module['Not Executed'] || module['Not Executed']);
      return totals;
    }, { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 });

    const moduleSummaryRowsHtml = moduleRows.map(module => `
                    <tr>
                        <td>${module.Module || module['Module'] || ''}</td>
                        <td>${module.Total || module['Total'] || ''}</td>
                        <td>${module.Passed || module['Passed'] || ''}</td>
                        <td>${module.Failed || module['Failed'] || ''}</td>
                        <td>${module.Blocked || module['Blocked'] || ''}</td>
                        <td>${module['In Progress'] || module['In Progress'] || ''}</td>
                        <td>${module['Not Executed'] || module['Not Executed'] || ''}</td>
                        <td>${module['Pass Completion (%)'] || module['Pass Completion (%)'] || ''}</td>
                        <td>${module['Total Test Completion (%)'] || module['Total Test Completion (%)'] || ''}</td>
                    </tr>`).join('');

    const moduleGrandTotalRowHtml = `
                    <tr style="font-weight:bold; background:#f2f2f2;">
                        <td>Grand Total</td>
                        <td>${moduleTotals.total}</td>
                        <td>${moduleTotals.passed}</td>
                        <td>${moduleTotals.failed}</td>
                        <td>${moduleTotals.blocked}</td>
                        <td>${moduleTotals.inProgress}</td>
                        <td>${moduleTotals.notExecuted}</td>
                        <td>${moduleTotals.total ? ((moduleTotals.passed / moduleTotals.total) * 100).toFixed(2) + '%' : '0.00%'}</td>
                        <td>${moduleTotals.total ? '100.00%' : '0.00%'}</td>
                    </tr>`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Execution & Defect Status Summary for ${reportDate}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #2c3e50;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        h1 {
            color: #2c3e50;
            margin: 0;
        }
        .timestamp {
            color: #7f8c8d;
            font-size: 12px;
        }
        .charts-container {
            display: grid;
            grid-template-columns: 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        .chart-section {
            padding: 20px;
            background-color: #ecf0f1;
            border-radius: 5px;
            text-align: center;
        }
        .chart-section h2 {
            color: #2c3e50;
            margin-top: 0;
            font-size: 20px;
            margin-bottom: 30px;
        }
        .chart-legend {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 16px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            color: #000000;
            font-weight: bold;
        }
        .legend-spacer {
            width: 8px;
        }
        .legend-color {
            width: 14px;
            height: 14px;
            border-radius: 3px;
        }
        .metrics-container {
            display: grid;
            grid-template-columns: 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        .metrics-section {
            padding: 20px;
            background-color: #ecf0f1;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }
        .metrics-section h2 {
            color: #2c3e50;
            margin-top: 0;
            font-size: 18px;
        }
        .metric-row {
            display: flex;
            justify-content: space-between;
            margin: 12px 0;
            padding: 8px;
            background-color: white;
            border-radius: 3px;
        }
        .metric-label {
            font-weight: bold;
            color: #34495e;
        }
        .metric-value {
            font-size: 18px;
            font-weight: bold;
        }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        .stat-card {
            background: white;
            padding: 15px;
            text-align: center;
            border-radius: 5px;
            border-top: 3px solid #3498db;
        }
        .stat-card .number {
            font-size: 28px;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-card .label {
            font-size: 14px;
            color: #34495e;
            font-weight: 600;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: #ecf0f1;
            border-radius: 10px;
            overflow: hidden;
            margin-top: 10px;
        }
        .progress-fill {
            height: 100%;
            background-color: #27ae60;
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
        }
        .defect-table {
            margin-top: 30px;
            background-color: white;
            border-radius: 5px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .defect-table h2 {
            color: #2c3e50;
            margin: 0;
            padding: 12px 15px;
            background-color: #ecf0f1;
            border-bottom: 1px solid #bdc3c7;
            font-size: 18px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        .text-outline {
            -webkit-text-stroke: 1.2px rgba(0,0,0,0.5);
            paint-order: stroke fill;
        }
        h1,
        .timestamp,
        .chart-section h2,
        .metric-label,
        .stat-card .label,
        .progress-fill,
        .defect-table h2,
        th,
        .footer {
            text-shadow: 0 0 3px rgba(0,0,0,0.35), 0 0 2px rgba(0,0,0,0.25);
        }
        th, td {
            padding: 6px 8px;
            text-align: left;
            border-bottom: 1px solid #ddd;
            font-size: 13px;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #2c3e50;
            font-size: 12px;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e9ecef;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #bdc3c7;
            color: #5d6d7e;
            font-size: 13px;
            line-height: 1.6;
        }
        @media (max-width: 768px) {
            .summary-stats {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Test Execution & Defect Status Summary as of ${date}</h1>
            <p class="timestamp">Report Generated: ${date}</p>
        </div>

        <div class="charts-container">
            <!-- Test Results Pie Chart -->
            <div class="chart-section">
                <h2>📊 Test Execution Results</h2>
                <div style="max-width: 100%; height: auto; display: flex; justify-content: center;">
                    ${testChartHtml}
                </div>
                <div class="chart-legend">
                    ${testLegendHtml}
                </div>
            </div>
        </div>

        <div class="metrics-container">
            <!-- Test Results Section -->
            <div class="metrics-section">
                <h2>📊 Test Execution Results</h2>
                <div class="metric-row">
                    <span class="metric-label">Total Test Cases:</span>
                    <span class="metric-value">${testStats.total}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Pass Rate:</span>
                    <span class="metric-value" style="-webkit-text-stroke:2.5px #a8d5ba;color:${this.lightenColor('#a8d5ba')};paint-order:stroke fill;">${passPercentage}%</span>
                </div>
                
                <div class="summary-stats">
                    ${testSummaryHtml}
                </div>

                <div style="margin-top: 20px;">
                    <strong style="font-size: 12px;">Success Rate</strong>
                    <div class="progress-bar">
                        <div class="progress-fill text-outline" style="width: ${passPercentage}%">${passPercentage}%</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Test Results Listing Table -->
        <div class="defect-table">
            <h2>📋 Test Execution Details</h2>
            <table>
                <thead>
                    <tr>
                        <th>Module</th>
                        <th>Total Tests</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Blocked</th>
                        <th>In Progress</th>
                        <th>Not Executed</th>
                        <th>Pass Completion</th>
                        <th>Total Completion</th>
                    </tr>
                </thead>
                <tbody>
                    ${moduleSummaryRowsHtml}
                    ${moduleGrandTotalRowHtml}
                </tbody>
            </table>
        </div>

        <div class="charts-container">
            <!-- Defects Pie Chart -->
            <div class="chart-section">
                <h2>🐛 Defect Status Summary</h2>
                <div style="max-width: 100%; height: auto; display: flex; justify-content: center;">
                    ${defectChartHtml}
                </div>
                <div class="chart-legend">
                    ${defectLegendHtml}
                </div>
            </div>
        </div>

        <div class="metrics-container">
            <!-- Defects Section -->
            <div class="metrics-section" style="border-left-color: #f4a688;">
                <h2>🐛 Defect Status Summary</h2>
                <div class="metric-row">
                    <span class="metric-label">Total Defects:</span>
                    <span class="metric-value">${defectStats.total}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Open Rate:</span>
                    <span class="metric-value" style="-webkit-text-stroke:2.5px #f4a688;color:${this.lightenColor('#f4a688')};paint-order:stroke fill;">${defectOpenPercent}%</span>
                </div>

                <div class="summary-stats">
                    ${defectSummaryHtml}
                </div>
            </div>
        </div>

        <!-- Defect Listing Table -->
        <div class="defect-table">
            <h2>📋 Defect Details (Active Defects Only)</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Subject</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Category</th>
                        <th>Assignee</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    ${(defectStats.details || []).filter(defect => {
                        const status = (defect.Status || defect.status || '').toLowerCase().trim();
                        return status !== 'verified' && status !== 'closed' && status !== 'roadblock';
                    }).map(defect => `
                        <tr>
                            <td>${defect['#'] || ''}</td>
                            <td>${defect.Subject || defect.subject || ''}</td>
                            <td>${defect.Priority || defect.priority || ''}</td>
                            <td>${defect.Status || defect.status || ''}</td>
                            <td>${defect.Category || defect.category || ''}</td>
                            <td>${defect.Assignee || defect.assignee || ''}</td>
                            <td>${defect.Created || defect.created || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>This is an automated report generated by Test Automation Framework</p>
            <p>Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Send email report
   */
  async sendEmail(htmlContent, recipients, attachments = []) {
    const transportOptions = {
      host: this.emailConfig.host,
      port: this.emailConfig.port,
      secure: this.emailConfig.isSSL || false,
      auth: {
        user: this.emailConfig.user,
        pass: this.emailConfig.password
      }
    };

    if (this.emailConfig.host && this.emailConfig.host.toLowerCase().includes('office365.com')) {
      transportOptions.requireTLS = true;
      transportOptions.tls = transportOptions.tls || {};
      transportOptions.tls.ciphers = 'SSLv3';
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const subjectTemplate = this.emailConfig.subject || 'Test Execution & Defect Status Summary for dd/mm/yyyy';
    const mailSubject = subjectTemplate.replace(/dd\/mm\/yyyy/g, this.formatReportDate());

    const mailOptions = {
      from: this.emailConfig.from,
      to: recipients || this.emailConfig.to,
      cc: this.emailConfig.cc,
      bcc: this.emailConfig.bcc,
      subject: mailSubject,
      html: htmlContent,
      attachments: attachments.length ? attachments : undefined,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      if (error && error.code === 'EAUTH') {
        console.error('SMTP authentication failed. For Office 365, verify that SMTP AUTH is enabled for the account and that the password is correct or that app passwords are supported by your tenant.');
      }
      throw error;
    }
  }

  /**
   * Generate and send complete report
   */
  async generateAndSendReport(recipients) {
    try {
      console.log('Reading test results...');

      // Override the configured test results file name when Jenkins passes excelTestSummary.
      const excelTestSummary = (process.env.EXCEL_TEST_SUMMARY || process.env.EXCEL_DEFECT_NAME || process.argv[5] || '').trim();
      if (excelTestSummary) {
        console.log(`Overriding test results file from reportConfig.json to: ${excelTestSummary}`);
        this.config.testResults.file = excelTestSummary;
      }

      const testStats = this.readTestResults();

      // Resolve redmine_prefix from Jenkins env var or CLI arg (4th argument).
      // Strip a leading '#' in case Jenkins passes the value as '#34384'.
      const redminePrefix = (process.env.REDMINE_PREFIX || process.argv[4] || '').replace(/^#/, '').trim();
      console.log(`redmine_prefix resolved to: "${redminePrefix}"`);

      let defectStats = null;
      if (redminePrefix) {
        console.log(`Fetching defects from database (redmine_prefix="${redminePrefix}")...`);
        defectStats = await this.fetchDefectsFromDB(redminePrefix);
      }
      if (!defectStats) {
        console.log('Reading defects from file...');
        defectStats = this.readDefects();
      }

      console.log('Generating HTML report...');
      const htmlContent = await this.generateHTML(testStats, defectStats);
      console.log(`Generated HTML content length: ${htmlContent.length} characters`);
      
      // Basic HTML validation
      if (htmlContent.includes('<html') && htmlContent.includes('</html>') && htmlContent.includes('<body') && htmlContent.includes('</body>')) {
        console.log('HTML structure appears valid');
      } else {
        console.error('HTML structure appears invalid');
        console.log('HTML preview:', htmlContent.substring(0, 200));
      }

      // Try to convert the full report to a single PNG image so forwarded emails
      // are never truncated by email clients.
      console.log('Converting report to PNG image...');
      const pngBuffer = await this.generateReportPng(htmlContent);

      let emailBody = htmlContent;
      let emailAttachments = [...this.emailAttachments];

      if (pngBuffer) {
        // Replace the email body with a simple wrapper that embeds the PNG inline.
        // Forwarding a single image keeps the layout pixel-perfect.
        const subjectTemplate = this.emailConfig.subject || 'Test Execution & Defect Status Summary for dd/mm/yyyy';
        const mailSubject = subjectTemplate.replace(/dd\/mm\/yyyy/g, this.formatReportDate());
        emailAttachments = [{
          filename: 'report.png',
          content: pngBuffer,
          cid: 'report-full-image',
          contentType: 'image/png'
        }];
        emailBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mailSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <div style="text-align:center;padding:16px;">
    <img src="cid:report-full-image"
         alt="Test Execution &amp; Defect Status Summary"
         style="max-width:100%;height:auto;display:block;margin:0 auto;border:none;" />
  </div>
</body>
</html>`;
        console.log('Email will be sent as PNG image.');
      } else {
        console.log('Puppeteer unavailable — sending HTML email as fallback.');
      }

      console.log('Sending email...');
      const defectsFromDb = !!(redminePrefix && defectStats && defectStats.details && defectStats.details.length > 0);
      const dataFileAttachments = this.collectDataFileAttachments(defectsFromDb);
      const result = await this.sendEmail(emailBody, recipients, [...emailAttachments, ...dataFileAttachments]);

      return {
        success: true,
        message: 'Report generated and sent successfully',
        testStats,
        defectStats,
        emailInfo: result
      };
    } catch (error) {
      console.error('Error in generateAndSendReport:', error.message);
      return {
        success: false,
        message: 'Failed to generate/send report',
        error: error.message
      };
    }
  }
}

// CLI execution
if (require.main === module) {
  const configPath = process.argv[2];
  const recipients = process.argv[3];
  // Normalise the prefix: strip leading '#' (e.g. Jenkins passes '#34384')
  const redminePrefix = (process.env.REDMINE_PREFIX || process.argv[4] || '').replace(/^#/, '').trim();
  // Make the normalised value available to generateAndSendReport via env
  process.env.REDMINE_PREFIX = redminePrefix;

  const recipientMessage = recipients || 'using recipients from config file';
  console.log('Starting report generator...');
  console.log('Config path:', configPath || 'default reportConfig.json');
  console.log('Recipients:', recipientMessage);
  console.log(`redmine_prefix resolved to: "${redminePrefix}"`);

  try {
    const generator = new ReportGenerator(configPath);
    console.log('Config loaded successfully');
    
    generator.generateAndSendReport(recipients).then(result => {
      console.log('Final result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }).catch(error => {
      console.error('Async error:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

module.exports = ReportGenerator;
