// Import/Export utility functions for FFXIV Macro Database

window.FFXIVImportExport = {
  // Escape CSV values
  escapeCSV: function(text) {
    if (text == null) return '';
    text = String(text);
    if (text.includes(',') || text.includes('\n') || text.includes('"')) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  },

  // Export database to CSV
  exportToCSV: function() {
    try {
      const data = localStorage.getItem('cosmic-exploration-database');

      if (!data) {
        alert('No FFXIV database found in localStorage!');
        return;
      }

      const macros = JSON.parse(data);

      if (!Array.isArray(macros) || macros.length === 0) {
        alert('Database is empty!');
        return;
      }

      // Create CSV header
      const headers = [
        'Quest Name',
        'Location',
        'Job',
        'Category',
        'Food Required',
        'Food Type',
        'Item Name',
        'Difficulty',
        'Quality',
        'Durability',
        'Data Reward Job',
        'Data I',
        'Data II',
        'Data III',
        'Data IV',
        'Data V',
        'Cosmic Points',
        'Macro',
        'Notes'
      ];

      let csv = headers.join(',') + '\n';

      // Process each macro entry
      macros.forEach(macro => {
        if (macro.items && macro.items.length > 0) {
          macro.items.forEach((item, idx) => {
            const row = [];

            row.push(this.escapeCSV(macro.questName));
            row.push(this.escapeCSV(macro.location));
            row.push(this.escapeCSV(macro.job));
            row.push(this.escapeCSV(macro.category));
            row.push(macro.foodRequired ? 'Yes' : 'No');
            row.push(this.escapeCSV(macro.foodType || 'None'));

            row.push(this.escapeCSV(item.name));
            row.push(item.difficulty || 0);
            row.push(item.quality || 0);
            row.push(item.durability || 0);

            if (macro.dataReward) {
              row.push(this.escapeCSV(macro.dataReward.job || macro.job));
              row.push(macro.dataReward.i || 0);
              row.push(macro.dataReward.ii || 0);
              row.push(macro.dataReward.iii || 0);
              row.push(macro.dataReward.iv || 0);
              row.push(macro.dataReward.v || 0);
              row.push(macro.dataReward.cosmicPoints || 0);
            } else {
              row.push(this.escapeCSV(macro.job));
              row.push(0, 0, 0, 0, 0, 0);
            }

            let macroText = '';
            if (macro.macros && macro.macros[idx]) {
              macroText = macro.macros[idx].macro;
            } else if (idx === 0 && macro.macro) {
              macroText = macro.macro;
            }
            row.push(this.escapeCSV(macroText));
            row.push(this.escapeCSV(macro.notes || ''));

            csv += row.join(',') + '\n';
          });
        } else {
          const row = [
            this.escapeCSV(macro.questName),
            this.escapeCSV(macro.location),
            this.escapeCSV(macro.job),
            this.escapeCSV(macro.category),
            macro.foodRequired ? 'Yes' : 'No',
            this.escapeCSV(macro.foodType || 'None'),
            '', 0, 0, 0,
            this.escapeCSV(macro.dataReward?.job || macro.job),
            macro.dataReward?.i || 0,
            macro.dataReward?.ii || 0,
            macro.dataReward?.iii || 0,
            macro.dataReward?.iv || 0,
            macro.dataReward?.v || 0,
            macro.dataReward?.cosmicPoints || 0,
            this.escapeCSV(macro.macro || ''),
            this.escapeCSV(macro.notes || '')
          ];
          csv += row.join(',') + '\n';
        }
      });

      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const timestamp = now.toISOString().slice(0, 10);

      link.setAttribute('href', url);
      link.setAttribute('download', `ffxiv-macros-${timestamp}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert(`Successfully exported ${macros.length} entries to CSV!`);

    } catch (error) {
      console.error('Export error:', error);
      alert(`Error exporting data: ${error.message}`);
    }
  },

  // Parse CSV text into rows respecting quotes and newlines
  parseCSVRows: function(csvText) {
    const rows = [];
    let currentRow = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        currentRow += char;
        if (inQuotes && nextChar === '"') {
          // Escaped quote - add both quotes
          currentRow += nextChar;
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === '\n' && !inQuotes) {
        // End of row (not inside quotes)
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = '';
      } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
        // Windows line ending
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = '';
        i++; // Skip the \n
      } else {
        currentRow += char;
      }
    }

    // Add last row if not empty
    if (currentRow.trim()) {
      rows.push(currentRow);
    }

    return rows;
  },

  // Detect delimiter (comma or tab)
  detectDelimiter: function(line) {
    // Count commas and tabs outside of quotes
    let commas = 0;
    let tabs = 0;
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes) {
        if (char === ',') commas++;
        if (char === '\t') tabs++;
      }
    }

    // Return the delimiter with more occurrences (default to comma)
    return tabs > commas ? '\t' : ',';
  },

  // Parse CSV/TSV line respecting quotes
  parseCSVLine: function(line, delimiter) {
    // Auto-detect delimiter if not provided
    if (!delimiter) {
      delimiter = this.detectDelimiter(line);
    }

    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current);
    return result;
  },

  // Import database from CSV
  importFromCSV: function(file, callback) {
    const reader = new FileReader();
    const self = this;

    reader.onload = function(e) {
      try {
        const csvText = e.target.result;
        const lines = self.parseCSVRows(csvText);

        if (lines.length < 2) {
          alert('CSV file is empty or invalid!');
          return;
        }

        // Parse header and detect delimiter
        const delimiter = self.detectDelimiter(lines[0]);
        const headers = self.parseCSVLine(lines[0], delimiter);

        console.log('Detected delimiter:', delimiter === '\t' ? 'TAB' : 'COMMA');
        console.log('Headers:', headers);

        // Group rows by quest + location + job to handle duplicate quest names
        const questMap = new Map();

        for (let i = 1; i < lines.length; i++) {
          const values = self.parseCSVLine(lines[i], delimiter);

          // Skip rows with too few columns (need at least quest name)
          if (values.length < 1 || !values[0].trim()) continue;

          const questName = values[0] || '';
          const location = values[1] || '';
          const job = values[2] || '';
          const category = values[3] || '';
          const foodRequired = values[4] === 'Yes';
          const foodType = values[5] || 'None';
          const itemName = values[6] || '';
          const difficulty = parseInt(values[7]) || 0;
          const quality = parseInt(values[8]) || 0;
          const durability = parseInt(values[9]) || 0;
          const dataRewardJob = values[10] || job;
          const dataI = parseInt(values[11]) || 0;
          const dataII = parseInt(values[12]) || 0;
          const dataIII = parseInt(values[13]) || 0;
          const dataIV = parseInt(values[14]) || 0;
          const dataV = parseInt(values[15]) || 0;
          const cosmicPoints = parseInt(values[16]) || 0;
          const macroText = values[17] || '';
          const notes = values[18] || '';

          console.log('Row', i, 'Quest:', questName, 'Job:', job, 'Item:', itemName, 'Macro length:', macroText.length);

          // Create unique key combining quest name, location, and job to handle duplicate quest names
          const questKey = `${questName}|||${location}|||${job}`;
          console.log('Quest Key:', questKey, 'Exists:', questMap.has(questKey));

          // Create or get quest entry
          if (!questMap.has(questKey)) {
            questMap.set(questKey, {
              id: Date.now() + questMap.size,
              questName: questName,
              location: location,
              job: job,
              category: category,
              foodRequired: foodRequired,
              foodType: foodType,
              items: [],
              dataReward: {
                job: dataRewardJob,
                i: dataI,
                ii: dataII,
                iii: dataIII,
                iv: dataIV,
                v: dataV,
                cosmicPoints: cosmicPoints
              },
              notes: notes
            });
          }

          const quest = questMap.get(questKey);

          // Add item if it has a name
          if (itemName) {
            quest.items.push({
              name: itemName,
              difficulty: difficulty,
              quality: quality,
              durability: durability
            });

            // Store macro for this item
            if (!quest.macros) {
              quest.macros = [];
            }
            quest.macros.push({
              itemName: itemName,
              macro: macroText
            });
          }
        }

        // Convert map to array and fix macro structure
        const importedData = Array.from(questMap.values()).map(quest => {
          // If only one item, use single macro field
          if (quest.items.length === 1 && quest.macros && quest.macros.length === 1) {
            quest.macro = quest.macros[0].macro;
            delete quest.macros;
          } else if (quest.items.length === 0) {
            // If no items, add a default one
            quest.items = [{
              name: '',
              difficulty: 0,
              quality: 0,
              durability: 0
            }];
            quest.macro = '';
          }

          return quest;
        });

        if (importedData.length === 0) {
          alert('No valid data found in CSV file!');
          return;
        }

        // Ask for confirmation
        const currentData = localStorage.getItem('cosmic-exploration-database');
        let confirmMessage = `Import ${importedData.length} quests from CSV?`;

        if (currentData) {
          const currentMacros = JSON.parse(currentData);
          confirmMessage = `This will replace your current ${currentMacros.length} entries with ${importedData.length} new entries from CSV. Continue?`;
        }

        if (confirm(confirmMessage)) {
          localStorage.setItem('cosmic-exploration-database', JSON.stringify(importedData));
          alert(`Successfully imported ${importedData.length} entries from CSV!`);

          // Trigger callback to refresh the UI
          if (callback) callback();
        }

      } catch (error) {
        console.error('CSV Import error:', error);
        alert(`Error importing CSV: ${error.message}`);
      }
    };

    reader.readAsText(file);
  }
};
