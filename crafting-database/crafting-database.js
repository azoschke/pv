(function() {
  const { useState, useEffect } = React;
  const { createElement: h } = React;

  const CLASSES = [
    'Carpenter',
    'Alchemist',
    'Armorer',
    'Blacksmith',
    'Culinarian',
    'Goldsmith',
    'Leatherworker',
    'Weaver'
  ];

  const CLASS_ICONS = {
    'Carpenter': 'carpenter',
    'Alchemist': 'science',
    'Armorer': 'shield',
    'Blacksmith': 'hardware',
    'Culinarian': 'restaurant',
    'Goldsmith': 'diamond',
    'Leatherworker': 'straighten',
    'Weaver': 'gesture'
  };

  const FOOD_OPTIONS = [
    'Rroneek Steak (HQ)',
    'Ceviche (HQ)',
    'All i Pebre (HQ)'
  ];

  const POTION_OPTIONS = [
    'Cunning Craftsman\'s Tisane (HQ)'
  ];

  const RATING_STARS = [0, 1, 2, 3, 4];

  // Split macro text into chunks of max 15 lines each
  const splitMacroIntoChunks = (macroText) => {
    if (!macroText) return [''];
    const lines = macroText.split('\n');
    const chunks = [];

    for (let i = 0; i < lines.length; i += 15) {
      chunks.push(lines.slice(i, i + 15).join('\n'));
    }

    return chunks.length > 0 ? chunks : [''];
  };

  // CSV helper functions
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/);
    const result = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++; // Skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField);
          if (currentRow.length > 0) {
            result.push(currentRow);
          }
          currentRow = [];
          currentField = '';
          if (nextChar === '\r') i++; // Skip \r in \r\n
        } else if (char !== '\r') {
          currentField += char;
        }
      }
    }

    // Add last field and row if they exist
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      result.push(currentRow);
    }

    return result.filter(row => row.some(field => field.trim() !== ''));
  };

  const CraftingDatabase = () => {
    const [crafts, setCrafts] = useState([]);
    const [classStats, setClassStats] = useState({});
    const [isAddingCraft, setIsAddingCraft] = useState(false);
    const [editingCraft, setEditingCraft] = useState(null);
    const [isManagingClassStats, setIsManagingClassStats] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterStars, setFilterStars] = useState('');
    const [sortBy, setSortBy] = useState(''); // '', 'name', 'class', 'level'
    const [expandedCrafts, setExpandedCrafts] = useState({});
    const [theme, setTheme] = useState('light');

    // Load data from localStorage on mount
    useEffect(() => {
      const savedCrafts = localStorage.getItem('craftingCrafts');
      const savedClassStats = localStorage.getItem('craftingClassStats');

      if (savedCrafts) {
        setCrafts(JSON.parse(savedCrafts));
      }

      if (savedClassStats) {
        setClassStats(JSON.parse(savedClassStats));
      } else {
        // Initialize default class stats
        const defaultStats = {};
        CLASSES.forEach(cls => {
          defaultStats[cls] = { craftsmanship: 0, control: 0, cp: 0 };
        });
        setClassStats(defaultStats);
      }
    }, []);

    // Save crafts to localStorage
    useEffect(() => {
      localStorage.setItem('craftingCrafts', JSON.stringify(crafts));
    }, [crafts]);

    // Save class stats to localStorage
    useEffect(() => {
      localStorage.setItem('craftingClassStats', JSON.stringify(classStats));
    }, [classStats]);

    // Load theme from localStorage on mount
    useEffect(() => {
      const savedTheme = localStorage.getItem('craftingTheme') || 'light';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }, []);

    // Save theme to localStorage and apply it
    useEffect(() => {
      localStorage.setItem('craftingTheme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const addCraft = (craft) => {
      // Snapshot the current class stats for this craft's class
      const craftClassStats = classStats[craft.class] || { craftsmanship: 0, control: 0, cp: 0 };
      const newCraft = {
        ...craft,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        classStats: { ...craftClassStats }
      };
      setCrafts([...crafts, newCraft]);
      setIsAddingCraft(false);
    };

    const updateCraft = (updatedCraft) => {
      setCrafts(crafts.map(c => c.id === updatedCraft.id ? updatedCraft : c));
      setEditingCraft(null);
    };

    const updateCraftDirect = (updatedCraft) => {
      setCrafts(crafts.map(c => c.id === updatedCraft.id ? updatedCraft : c));
    };

    const deleteCraft = (id) => {
      if (confirm('Are you sure you want to delete this craft?')) {
        setCrafts(crafts.filter(c => c.id !== id));
      }
    };

    const updateClassStats = (className, stats) => {
      setClassStats(prevStats => ({
        ...prevStats,
        [className]: stats
      }));
    };

    const toggleCraft = (id) => {
      setExpandedCrafts(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    };

    const toggleTheme = () => {
      setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    const exportToCSV = () => {
      // Create CSV header
      const headers = [
        'name', 'level', 'rating', 'durability', 'difficulty', 'quality',
        'class', 'craftsmanship', 'control', 'cp',
        'requiresFood', 'food', 'requiresPotion', 'potion',
        'macro', 'notes', 'id', 'createdAt'
      ];

      // Create CSV rows
      const rows = crafts.map(craft => {
        const craftStats = craft.classStats || { craftsmanship: 0, control: 0, cp: 0 };
        return [
          escapeCSV(craft.name),
          escapeCSV(craft.level || ''),
          escapeCSV(craft.rating || 1),
          escapeCSV(craft.durability || ''),
          escapeCSV(craft.difficulty || ''),
          escapeCSV(craft.quality || ''),
          escapeCSV(craft.class),
          escapeCSV(craftStats.craftsmanship),
          escapeCSV(craftStats.control),
          escapeCSV(craftStats.cp),
          escapeCSV(craft.requiresFood || false),
          escapeCSV(craft.food || ''),
          escapeCSV(craft.requiresPotion || false),
          escapeCSV(craft.potion || ''),
          escapeCSV(craft.macro || ''),
          escapeCSV(craft.notes || ''),
          escapeCSV(craft.id),
          escapeCSV(craft.createdAt)
        ].join(',');
      });

      // Combine headers and rows
      const csv = [headers.join(','), ...rows].join('\n');

      // Create download link
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `ffxiv-crafting-${date}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const importFromCSV = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = parseCSV(text);

        if (rows.length < 2) {
          alert('CSV file is empty or invalid');
          return;
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Parse CSV data into craft objects
        const importedCrafts = dataRows.map(row => {
          const craft = {};
          headers.forEach((header, index) => {
            const value = row[index];

            // Handle specific field types
            if (header === 'level' || header === 'rating' || header === 'durability' ||
                header === 'difficulty' || header === 'quality') {
              craft[header] = value ? parseInt(value) : '';
            } else if (header === 'requiresFood' || header === 'requiresPotion') {
              craft[header] = value === 'true';
            } else if (header === 'craftsmanship' || header === 'control' || header === 'cp') {
              if (!craft.classStats) craft.classStats = {};
              craft.classStats[header] = parseInt(value) || 0;
            } else {
              craft[header] = value;
            }
          });

          return craft;
        });

        // Merge with existing crafts (update if name matches, add if new)
        const existingCraftsByName = {};
        crafts.forEach(craft => {
          existingCraftsByName[craft.name] = craft;
        });

        const updatedCrafts = [...crafts];
        let addedCount = 0;
        let updatedCount = 0;

        importedCrafts.forEach(importedCraft => {
          if (!importedCraft.name) return; // Skip if no name

          const existingCraft = existingCraftsByName[importedCraft.name];

          if (existingCraft) {
            // Update existing craft
            const index = updatedCrafts.findIndex(c => c.name === importedCraft.name);
            updatedCrafts[index] = { ...existingCraft, ...importedCraft, id: existingCraft.id };
            updatedCount++;
          } else {
            // Add new craft
            const newCraft = {
              ...importedCraft,
              id: importedCraft.id || Date.now().toString() + Math.random(),
              createdAt: importedCraft.createdAt || new Date().toISOString()
            };
            updatedCrafts.push(newCraft);
            addedCount++;
          }
        });

        setCrafts(updatedCrafts);
        alert(`Import complete!\nAdded: ${addedCount} crafts\nUpdated: ${updatedCount} crafts`);
      };

      reader.readAsText(file);
      // Reset the file input so the same file can be imported again
      event.target.value = '';
    };

    const filteredCrafts = crafts.filter(craft => {
      const matchesSearch = craft.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClass = !filterClass || craft.class === filterClass;
      const matchesStars = !filterStars || craft.rating === parseInt(filterStars);
      return matchesSearch && matchesClass && matchesStars;
    });

    const sortedCrafts = [...filteredCrafts].sort((a, b) => {
      if (!sortBy) return 0;

      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'class') {
        return a.class.localeCompare(b.class);
      } else if (sortBy === 'level') {
        const levelA = parseInt(a.level) || 0;
        const levelB = parseInt(b.level) || 0;
        return levelB - levelA; // Descending order
      }
      return 0;
    });

    return h('div', { className: 'container mx-auto px-4 max-w-7xl' },
      // Theme toggle button in upper left corner
      h('div', { className: 'flex justify-between items-start pt-4 mb-6 top-controls' },
        h('button', {
          onClick: toggleTheme,
          className: 'theme-toggle px-3 py-2 rounded-lg transition-colors flex items-center gap-2',
          style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' },
          title: theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'
        },
          h('span', { className: 'material-icons', style: { fontSize: '20px' } }, theme === 'light' ? 'dark_mode' : 'light_mode'),
          h('span', { className: 'theme-toggle-text text-sm' }, theme === 'light' ? 'Dark Mode' : 'Light Mode')
        ),
        // Top action buttons
        h('div', { className: 'action-buttons-top flex flex-wrap gap-2 items-center' },
        h('button', {
          onClick: () => setIsManagingClassStats(true),
          className: 'px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm',
          style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }
        },
          h('span', { className: 'material-icons', style: { fontSize: '16px' } }, 'settings'),
          'Manage Class Stats'
        ),
        h('button', {
          onClick: exportToCSV,
          className: 'px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm',
          style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
        },
          h('span', { className: 'material-icons', style: { fontSize: '16px' } }, 'download'),
          'Export CSV'
        ),
        h('label', {
          className: 'px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer text-sm',
          style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
        },
          h('span', { className: 'material-icons', style: { fontSize: '16px' } }, 'upload'),
          'Import CSV',
          h('input', {
            type: 'file',
            accept: '.csv',
            onChange: importFromCSV,
            style: { display: 'none' }
          })
        )
        )
      ),
      h('header', { className: 'mb-12' },
        h('h1', { className: 'text-4xl font-bold text-center mb-2 craft-name' }, 'FFXIV Crafting Macro Database'),
        h('p', { className: 'text-center subtitle', style: { color: 'var(--text-secondary)' } }, 'Manage your crafting macros and recipes')
      ),
      h('div', { className: 'mb-6 space-y-3' },
        // Search bar
        h('div', { className: 'w-full' },
          h('input', {
            type: 'text',
            placeholder: 'Search crafts by name...',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            className: 'w-full px-4 py-2 rounded-lg focus:outline-none',
            style: {
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }
          })
        ),
        // Filters and sorting row
        h('div', { className: 'filters-row flex flex-wrap gap-2 items-center' },
          h('select', {
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
            className: 'px-3 py-2 rounded-lg focus:outline-none text-sm',
            style: {
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }
          },
            h('option', { value: '' }, 'Sort By'),
            h('option', { value: 'name' }, 'A-Z'),
            h('option', { value: 'class' }, 'Class'),
            h('option', { value: 'level' }, 'Level')
          ),
          h('select', {
            value: filterClass,
            onChange: (e) => setFilterClass(e.target.value),
            className: 'px-3 py-2 rounded-lg focus:outline-none text-sm',
            style: {
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }
          },
            h('option', { value: '' }, 'All Classes'),
            ...CLASSES.map(cls => h('option', { key: cls, value: cls }, cls))
          ),
          h('select', {
            value: filterStars,
            onChange: (e) => setFilterStars(e.target.value),
            className: 'px-3 py-2 rounded-lg focus:outline-none text-sm',
            style: {
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }
          },
            h('option', { value: '' }, 'All Stars'),
            h('option', { value: '0' }, 'No Stars'),
            h('option', { value: '1' }, '1 Star'),
            h('option', { value: '2' }, '2 Stars'),
            h('option', { value: '3' }, '3 Stars'),
            h('option', { value: '4' }, '4 Stars')
          )
        ),
        // Add New button row
        h('div', { className: 'add-new-row flex items-center' },
          h('button', {
            onClick: () => setIsAddingCraft(true),
            className: 'add-new-btn px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm ml-auto',
            style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
          },
            h('span', { className: 'material-icons', style: { fontSize: '16px' } }, 'add'),
            'Add New'
          )
        )
      ),
      isAddingCraft && h(CraftForm, {
        onSave: addCraft,
        onCancel: () => setIsAddingCraft(false),
        classStats: classStats
      }),
      editingCraft && h(CraftForm, {
        craft: editingCraft,
        onSave: updateCraft,
        onCancel: () => setEditingCraft(null),
        classStats: classStats
      }),
      isManagingClassStats && h(ClassStatsManager, {
        classStats: classStats,
        onUpdate: updateClassStats,
        onClose: () => setIsManagingClassStats(false)
      }),
      h('div', { className: 'space-y-2 pb-8' },
        sortedCrafts.length === 0
          ? h('div', { className: 'text-center py-12', style: { color: 'var(--text-secondary)' } },
              searchTerm || filterClass || filterStars
                ? 'No crafts found matching your filters.'
                : 'No crafts yet. Add your first craft above!'
            )
          : sortedCrafts.map(craft => h(CraftCard, {
              key: craft.id,
              craft: craft,
              classStats: classStats,
              isExpanded: expandedCrafts[craft.id] || false,
              onToggle: () => toggleCraft(craft.id),
              onEdit: (updatedCraft) => updateCraftDirect(updatedCraft),
              onDelete: () => deleteCraft(craft.id)
            }))
      )
    );
  };

  const CraftForm = ({ craft, onSave, onCancel, classStats }) => {
    const [formData, setFormData] = useState(craft || {
      name: '',
      level: '',
      rating: 0,
      durability: '',
      difficulty: '',
      quality: '',
      requiresFood: false,
      food: FOOD_OPTIONS[0],
      requiresPotion: false,
      potion: POTION_OPTIONS[0],
      macro: '',
      class: CLASSES[0],
      notes: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      if (!formData.name.trim()) {
        alert('Please enter a craft name');
        return;
      }
      onSave(formData);
    };

    const updateField = (field, value) => {
      setFormData({ ...formData, [field]: value });
    };

    return h('div', {
      className: 'rounded-lg p-6 mb-6',
      style: {
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)'
      }
    },
      h('h2', { className: 'text-2xl font-bold mb-4 craft-name' }, craft ? 'Edit Craft' : 'Add New Craft'),
      h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
        h('div', null,
          h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Craft Name *'),
          h('input', {
            type: 'text',
            value: formData.name,
            onChange: (e) => updateField('name', e.target.value),
            className: 'w-full px-4 py-2 rounded-lg form-input',
            required: true
          })
        ),
        h('div', { className: 'grid grid-cols-2 md:grid-cols-3 gap-4' },
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Class'),
            h('select', {
              value: formData.class,
              onChange: (e) => updateField('class', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            },
              ...CLASSES.map(cls => h('option', { key: cls, value: cls }, cls))
            )
          ),
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Level'),
            h('input', {
              type: 'number',
              value: formData.level,
              onChange: (e) => updateField('level', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            })
          ),
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Rating'),
            h('select', {
              value: formData.rating,
              onChange: (e) => updateField('rating', parseInt(e.target.value)),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            },
              ...RATING_STARS.map(star => h('option', { key: star, value: star }, star === 0 ? 'No Stars' : `${star} Star${star > 1 ? 's' : ''}`))
            )
          ),
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Durability'),
            h('input', {
              type: 'number',
              value: formData.durability,
              onChange: (e) => updateField('durability', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            })
          ),
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Difficulty'),
            h('input', {
              type: 'number',
              value: formData.difficulty,
              onChange: (e) => updateField('difficulty', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            })
          ),
          h('div', null,
            h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Quality'),
            h('input', {
              type: 'number',
              value: formData.quality,
              onChange: (e) => updateField('quality', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            })
          )
        ),
        h('div', { className: 'grid grid-cols-1 gap-4' },
          h('div', { className: 'space-y-2' },
            h('div', { className: 'flex items-center gap-2' },
              h('input', {
                type: 'checkbox',
                id: 'requiresFood',
                checked: formData.requiresFood,
                onChange: (e) => updateField('requiresFood', e.target.checked),
                className: 'w-4 h-4'
              }),
              h('label', { htmlFor: 'requiresFood', className: 'text-sm font-medium form-label' }, 'Requires Food')
            ),
            formData.requiresFood && h('select', {
              value: formData.food,
              onChange: (e) => updateField('food', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            },
              ...FOOD_OPTIONS.map(food => h('option', { key: food, value: food }, food))
            )
          ),
          h('div', { className: 'space-y-2' },
            h('div', { className: 'flex items-center gap-2' },
              h('input', {
                type: 'checkbox',
                id: 'requiresPotion',
                checked: formData.requiresPotion,
                onChange: (e) => updateField('requiresPotion', e.target.checked),
                className: 'w-4 h-4'
              }),
              h('label', { htmlFor: 'requiresPotion', className: 'text-sm font-medium form-label' }, 'Requires Potion')
            ),
            formData.requiresPotion && h('select', {
              value: formData.potion,
              onChange: (e) => updateField('potion', e.target.value),
              className: 'w-full px-4 py-2 rounded-lg form-input'
            },
              ...POTION_OPTIONS.map(potion => h('option', { key: potion, value: potion }, potion))
            )
          )
        ),
        h('div', null,
          h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Macro (automatically splits into multiple macros after 15 lines)'),
          h('textarea', {
            value: formData.macro,
            onChange: (e) => updateField('macro', e.target.value),
            className: 'w-full px-4 py-2 rounded-lg form-input font-mono text-sm',
            rows: 10,
            placeholder: 'Enter macro lines...'
          })
        ),
        h('div', null,
          h('label', { className: 'block text-sm font-medium mb-2 form-label' }, 'Notes'),
          h('textarea', {
            value: formData.notes,
            onChange: (e) => updateField('notes', e.target.value),
            className: 'w-full px-4 py-2 rounded-lg form-input',
            rows: 3,
            placeholder: 'Additional notes...'
          })
        ),
        h('div', { className: 'flex gap-2 justify-end' },
          h('button', {
            type: 'button',
            onClick: onCancel,
            className: 'px-4 py-2 rounded-lg transition-colors',
            style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)' }
          }, 'Cancel'),
          h('button', {
            type: 'submit',
            className: 'px-4 py-2 rounded-lg transition-colors',
            style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
          }, `${craft ? 'Update' : 'Add'} Craft`)
        )
      )
    );
  };

  const CraftCard = ({ craft, classStats, isExpanded, onToggle, onEdit, onDelete }) => {
    const [isEditingInline, setIsEditingInline] = useState(false);
    const [editFormData, setEditFormData] = useState({
      ...craft,
      classStats: craft.classStats || classStats[craft.class] || { craftsmanship: 0, control: 0, cp: 0 }
    });
    const macroChunks = splitMacroIntoChunks(craft.macro);
    // Use snapshotted stats if available, otherwise fall back to global stats
    const stats = craft.classStats || classStats[craft.class] || { craftsmanship: 0, control: 0, cp: 0 };

    const renderStars = (rating) => {
      if (!rating || rating === 0) return null;
      return h('div', { className: 'flex items-center gap-1' },
        ...[...Array(4)].map((_, i) =>
          h('span', {
            key: i,
            className: `material-icons text-sm ${i < rating ? 'star-filled' : 'star-empty'}`
          }, 'star')
        )
      );
    };

    const copyMacroToClipboard = (macroText) => {
      navigator.clipboard.writeText(macroText).then(() => {
        alert('Macro copied to clipboard!');
      });
    };

    const handleInlineEdit = () => {
      // Expand the craft if it's not already expanded
      if (!isExpanded) {
        onToggle();
      }
      setIsEditingInline(true);
      setEditFormData({
        ...craft,
        classStats: craft.classStats || classStats[craft.class] || { craftsmanship: 0, control: 0, cp: 0 }
      });
    };

    const handleInlineSave = () => {
      if (!editFormData.name.trim()) {
        alert('Please enter a craft name');
        return;
      }
      onEdit(editFormData);
      setIsEditingInline(false);
    };

    const handleInlineCancel = () => {
      setIsEditingInline(false);
      setEditFormData(craft);
    };

    const updateEditField = (field, value) => {
      setEditFormData({ ...editFormData, [field]: value });
    };

    const updateClassStat = (field, value) => {
      setEditFormData({
        ...editFormData,
        classStats: {
          ...editFormData.classStats,
          [field]: parseInt(value) || 0
        }
      });
    };

    // Common header for both collapsed and expanded
    const header = h('div', {
      className: `craft-card-header flex items-center p-4 ${isExpanded ? 'border-b' : ''} hover:opacity-95 transition-colors cursor-pointer`,
      onClick: onToggle,
      style: { borderColor: isExpanded ? '#C5B89A' : 'transparent', paddingRight: '80px', position: 'relative' }
    },
      h('div', { className: 'craft-title-section flex items-center gap-2' },
        h('h3', { className: 'text-lg font-bold craft-name' }, craft.name),
        renderStars(craft.rating)
      ),
      h('div', { className: 'craft-meta-section flex items-center gap-4 ml-auto' },
        h('div', { className: 'craft-class-info flex items-center gap-2' },
          h('span', { className: 'material-icons text-sm', style: { color: 'var(--text-secondary)' } }, CLASS_ICONS[craft.class] || 'build'),
          h('span', { className: 'text-sm uppercase', style: { color: 'var(--text-secondary)' } }, craft.class)
        ),
        craft.level && h('span', { className: 'craft-level text-sm', style: { color: 'var(--text-secondary)' } }, `LVL ${craft.level}`),
        h('span', {
          onClick: (e) => { e.stopPropagation(); handleInlineEdit(); },
          className: 'material-icons cursor-pointer transition-opacity hover:opacity-70',
          style: { color: 'var(--accent-brown)', fontSize: '24px' },
          title: 'Edit'
        }, 'edit'),
        h('span', {
          onClick: (e) => { e.stopPropagation(); onToggle(); },
          className: 'material-icons cursor-pointer transition-opacity hover:opacity-70',
          style: { color: 'var(--accent-brown)', fontSize: '24px' },
          title: isExpanded ? 'Collapse' : 'Expand'
        }, isExpanded ? 'expand_less' : 'expand_more'),
        h('button', {
          onClick: (e) => { e.stopPropagation(); onDelete(); },
          className: 'rounded-lg transition-colors',
          style: {
            backgroundColor: 'var(--accent-red)',
            color: 'white',
            padding: '8px',
            position: 'absolute',
            right: '0',
            top: '50%',
            transform: 'translateY(-50%) translateX(50%)',
            zIndex: 10
          },
          title: 'Delete'
        },
          h('span', { className: 'material-icons', style: { fontSize: '20px' } }, 'delete')
        )
      )
    );

    // Collapsed view
    if (!isExpanded) {
      return h('div', { className: 'craft-card rounded-lg', style: { overflow: 'visible' } },
        header
      );
    }

    // Expanded view
    return h('div', { className: 'craft-card rounded-lg', style: { overflow: 'visible' } },
      header,
      // Class and Class Stats (darker inset row)
      isEditingInline
        ? h('div', {
            className: 'px-4 py-3 space-y-3',
            style: { backgroundColor: 'var(--bg-darker)' }
          },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'material-icons text-sm', style: { color: 'var(--text-primary)' } }, CLASS_ICONS[editFormData.class] || 'build'),
              h('span', { className: 'font-medium uppercase', style: { color: 'var(--text-primary)' } }, editFormData.class),
              h('span', { className: 'text-xs ml-2', style: { color: 'var(--text-secondary)' } }, '(Edit class stats for this craft)')
            ),
            h('div', { className: 'grid grid-cols-3 gap-3' },
              h('div', null,
                h('label', { className: 'block text-xs mb-1', style: { color: 'var(--text-primary)' } }, 'Craftsmanship'),
                h('input', {
                  type: 'number',
                  value: editFormData.classStats?.craftsmanship || 0,
                  onChange: (e) => updateClassStat('craftsmanship', e.target.value),
                  className: 'w-full px-2 py-1 rounded text-sm',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                })
              ),
              h('div', null,
                h('label', { className: 'block text-xs mb-1', style: { color: 'var(--text-primary)' } }, 'Control'),
                h('input', {
                  type: 'number',
                  value: editFormData.classStats?.control || 0,
                  onChange: (e) => updateClassStat('control', e.target.value),
                  className: 'w-full px-2 py-1 rounded text-sm',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                })
              ),
              h('div', null,
                h('label', { className: 'block text-xs mb-1', style: { color: 'var(--text-primary)' } }, 'CP'),
                h('input', {
                  type: 'number',
                  value: editFormData.classStats?.cp || 0,
                  onChange: (e) => updateClassStat('cp', e.target.value),
                  className: 'w-full px-2 py-1 rounded text-sm',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                })
              )
            )
          )
        : h('div', {
            className: 'px-4 py-3 flex items-center gap-4 text-sm',
            style: { backgroundColor: 'var(--bg-darker)' }
          },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'material-icons text-sm', style: { color: 'var(--text-primary)' } }, CLASS_ICONS[craft.class] || 'build'),
              h('span', { className: 'font-medium uppercase', style: { color: 'var(--text-primary)' } }, craft.class)
            ),
            h('div', { className: 'flex items-center gap-4 text-xs', style: { color: 'var(--text-secondary)' } },
              h('span', null,
                h('span', null, 'Craftsmanship: '),
                h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, stats.craftsmanship)
              ),
              h('span', null,
                h('span', null, 'Control: '),
                h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, stats.control)
              ),
              h('span', null,
                h('span', null, 'CP: '),
                h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, stats.cp)
              )
            )
          ),
      // Body
      h('div', { className: 'p-4 space-y-4' },
        isEditingInline
          ? // Inline editing form
            h('div', { className: 'space-y-4' },
              // Craft Name
              h('div', null,
                h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Craft Name *'),
                h('input', {
                  type: 'text',
                  value: editFormData.name,
                  onChange: (e) => updateEditField('name', e.target.value),
                  className: 'w-full px-4 py-2 rounded-lg',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' },
                  required: true
                })
              ),
              // Class, Level, Rating, Durability, Difficulty, Quality
              h('div', { className: 'grid grid-cols-2 md:grid-cols-3 gap-4' },
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Class'),
                  h('select', {
                    value: editFormData.class,
                    onChange: (e) => updateEditField('class', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  },
                    ...CLASSES.map(cls => h('option', { key: cls, value: cls }, cls))
                  )
                ),
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Level'),
                  h('input', {
                    type: 'number',
                    value: editFormData.level,
                    onChange: (e) => updateEditField('level', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  })
                ),
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Rating'),
                  h('select', {
                    value: editFormData.rating,
                    onChange: (e) => updateEditField('rating', parseInt(e.target.value)),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  },
                    ...RATING_STARS.map(star => h('option', { key: star, value: star }, star === 0 ? 'No Stars' : `${star} Star${star > 1 ? 's' : ''}`))
                  )
                ),
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Durability'),
                  h('input', {
                    type: 'number',
                    value: editFormData.durability,
                    onChange: (e) => updateEditField('durability', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  })
                ),
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Difficulty'),
                  h('input', {
                    type: 'number',
                    value: editFormData.difficulty,
                    onChange: (e) => updateEditField('difficulty', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  })
                ),
                h('div', null,
                  h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Quality'),
                  h('input', {
                    type: 'number',
                    value: editFormData.quality,
                    onChange: (e) => updateEditField('quality', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  })
                )
              ),
              // Food and Potion
              h('div', { className: 'grid grid-cols-1 gap-4' },
                h('div', { className: 'space-y-2' },
                  h('div', { className: 'flex items-center gap-2' },
                    h('input', {
                      type: 'checkbox',
                      id: 'editRequiresFood',
                      checked: editFormData.requiresFood,
                      onChange: (e) => updateEditField('requiresFood', e.target.checked),
                      className: 'w-4 h-4'
                    }),
                    h('label', { htmlFor: 'editRequiresFood', className: 'text-sm font-medium', style: { color: 'var(--text-primary)' } }, 'Requires Food')
                  ),
                  editFormData.requiresFood && h('select', {
                    value: editFormData.food,
                    onChange: (e) => updateEditField('food', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  },
                    ...FOOD_OPTIONS.map(food => h('option', { key: food, value: food }, food))
                  )
                ),
                h('div', { className: 'space-y-2' },
                  h('div', { className: 'flex items-center gap-2' },
                    h('input', {
                      type: 'checkbox',
                      id: 'editRequiresPotion',
                      checked: editFormData.requiresPotion,
                      onChange: (e) => updateEditField('requiresPotion', e.target.checked),
                      className: 'w-4 h-4'
                    }),
                    h('label', { htmlFor: 'editRequiresPotion', className: 'text-sm font-medium', style: { color: 'var(--text-primary)' } }, 'Requires Potion')
                  ),
                  editFormData.requiresPotion && h('select', {
                    value: editFormData.potion,
                    onChange: (e) => updateEditField('potion', e.target.value),
                    className: 'w-full px-4 py-2 rounded-lg',
                    style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }
                  },
                    ...POTION_OPTIONS.map(potion => h('option', { key: potion, value: potion }, potion))
                  )
                )
              ),
              // Macro
              h('div', null,
                h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Macro'),
                h('textarea', {
                  value: editFormData.macro,
                  onChange: (e) => updateEditField('macro', e.target.value),
                  className: 'w-full px-4 py-2 rounded-lg font-mono text-sm',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' },
                  rows: 10,
                  placeholder: 'Enter macro lines...'
                })
              ),
              // Notes
              h('div', null,
                h('label', { className: 'block text-sm font-medium mb-2', style: { color: 'var(--text-primary)' } }, 'Notes'),
                h('textarea', {
                  value: editFormData.notes,
                  onChange: (e) => updateEditField('notes', e.target.value),
                  className: 'w-full px-4 py-2 rounded-lg',
                  style: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' },
                  rows: 3,
                  placeholder: 'Additional notes...'
                })
              ),
              // Action buttons
              h('div', { className: 'flex gap-2 justify-end' },
                h('button', {
                  onClick: handleInlineCancel,
                  className: 'px-4 py-2 rounded-lg transition-colors',
                  style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)' }
                }, 'Cancel'),
                h('button', {
                  onClick: handleInlineSave,
                  className: 'px-4 py-2 rounded-lg transition-colors',
                  style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
                }, 'Save')
              )
            )
          : // Display mode
            h('div', { className: 'space-y-4' },
        // Craft Stats and Food/Potion Requirements
        h('div', { className: 'flex flex-wrap gap-6' },
          // Craft Stats
          (craft.durability || craft.difficulty || craft.quality) && h('div', { className: 'flex gap-4 text-sm' },
            craft.durability && h('span', null,
              h('span', { style: { color: 'var(--text-secondary)' } }, 'Durability: '),
              h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, craft.durability)
            ),
            craft.difficulty && h('span', null,
              h('span', { style: { color: 'var(--text-secondary)' } }, 'Difficulty: '),
              h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, craft.difficulty)
            ),
            craft.quality && h('span', null,
              h('span', { style: { color: 'var(--text-secondary)' } }, 'Quality: '),
              h('span', { className: 'font-medium', style: { color: 'var(--text-primary)' } }, craft.quality)
            )
          ),
          // Food and Potion Requirements
          (craft.requiresFood || craft.requiresPotion) && h('div', { className: 'flex gap-4 text-sm' },
            craft.requiresFood && h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'material-icons text-sm', style: { color: 'var(--star-filled)' } }, 'restaurant'),
              h('span', { style: { color: 'var(--text-primary)' } }, craft.food)
            ),
            craft.requiresPotion && h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'material-icons text-sm', style: { color: 'var(--accent-brown)' } }, 'science'),
              h('span', { style: { color: 'var(--text-primary)' } }, craft.potion)
            )
          )
        ),
        // Macros
        craft.macro && h('div', null,
          h('h4', { className: 'font-semibold mb-2 text-sm', style: { color: 'var(--text-primary)' } }, 'Macros:'),
          h('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' },
            ...macroChunks.map((chunk, index) =>
              h('div', { key: index, className: 'relative' },
                h('div', { className: 'flex justify-between items-center mb-1' },
                  h('span', { className: 'text-xs', style: { color: 'var(--text-secondary)' } }, `Macro ${index + 1}`),
                  h('button', {
                    onClick: () => copyMacroToClipboard(chunk),
                    className: 'text-xs px-2 py-1 rounded flex items-center gap-1',
                    style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)' }
                  },
                    h('span', { className: 'material-icons', style: { fontSize: '14px' } }, 'content_copy'),
                    'Copy'
                  )
                ),
                h('pre', {
                  className: 'p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap',
                  style: { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }
                }, chunk)
              )
            )
          )
        ),
        // Notes
        craft.notes && h('div', null,
          h('h4', { className: 'font-semibold mb-2 text-sm', style: { color: 'var(--text-primary)' } }, 'Notes:'),
          h('p', { className: 'text-sm', style: { color: 'var(--text-primary)' } }, craft.notes)
        )
            )
      )
    );
  };

  const ClassStatsManager = ({ classStats, onUpdate, onClose }) => {
    const [stats, setStats] = useState(() => {
      // Initialize with current classStats or defaults
      const initialStats = {};
      CLASSES.forEach(cls => {
        initialStats[cls] = classStats[cls] || { craftsmanship: 0, control: 0, cp: 0 };
      });
      return initialStats;
    });

    const handleSave = () => {
      Object.keys(stats).forEach(className => {
        onUpdate(className, stats[className]);
      });
      onClose();
    };

    const updateStat = (className, field, value) => {
      setStats(prevStats => ({
        ...prevStats,
        [className]: {
          ...prevStats[className],
          [field]: value
        }
      }));
    };

    return h('div', {
      className: 'fixed inset-0 flex items-center justify-center p-4 z-50',
      style: { backgroundColor: 'rgba(62, 56, 50, 0.75)' }
    },
      h('div', {
        className: 'rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto',
        style: {
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)'
        }
      },
        h('h2', { className: 'text-2xl font-bold mb-4 craft-name' }, 'Manage Class Stats'),
        h('p', { className: 'text-sm mb-4', style: { color: 'var(--text-secondary)' } }, 'These stats will be displayed for all crafts using each class.'),
        h('div', { className: 'space-y-4 mb-6' },
          ...CLASSES.map(className =>
            h('div', {
              key: className,
              className: 'p-4 rounded-lg',
              style: { backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }
            },
              h('h3', { className: 'font-semibold mb-3', style: { color: 'var(--text-primary)' } }, className),
              h('div', { className: 'grid grid-cols-3 gap-4' },
                h('div', null,
                  h('label', { className: 'block text-sm mb-1 form-label' }, 'Craftsmanship'),
                  h('input', {
                    type: 'number',
                    value: stats[className]?.craftsmanship || 0,
                    onChange: (e) => updateStat(className, 'craftsmanship', parseInt(e.target.value) || 0),
                    className: 'w-full px-3 py-2 rounded-lg form-input'
                  })
                ),
                h('div', null,
                  h('label', { className: 'block text-sm mb-1 form-label' }, 'Control'),
                  h('input', {
                    type: 'number',
                    value: stats[className]?.control || 0,
                    onChange: (e) => updateStat(className, 'control', parseInt(e.target.value) || 0),
                    className: 'w-full px-3 py-2 rounded-lg form-input'
                  })
                ),
                h('div', null,
                  h('label', { className: 'block text-sm mb-1 form-label' }, 'CP'),
                  h('input', {
                    type: 'number',
                    value: stats[className]?.cp || 0,
                    onChange: (e) => updateStat(className, 'cp', parseInt(e.target.value) || 0),
                    className: 'w-full px-3 py-2 rounded-lg form-input'
                  })
                )
              )
            )
          )
        ),
        h('div', { className: 'flex gap-2 justify-end' },
          h('button', {
            onClick: onClose,
            className: 'px-4 py-2 rounded-lg transition-colors',
            style: { backgroundColor: 'var(--bg-darker)', color: 'var(--text-primary)' }
          }, 'Cancel'),
          h('button', {
            onClick: handleSave,
            className: 'px-4 py-2 rounded-lg transition-colors',
            style: { backgroundColor: 'var(--accent-brown)', color: 'white' }
          }, 'Save Stats')
        )
      )
    );
  };

  window.CraftingDatabase = CraftingDatabase;
})();
