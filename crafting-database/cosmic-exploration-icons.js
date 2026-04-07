(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["exports", "react"], factory);
  } else if (typeof exports !== "undefined") {
    factory(exports, require("react"));
  } else {
    var mod = { exports: {} };
    factory(mod.exports, global.React);
    global.repl = mod.exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this,
  function (_exports, _react) {
    "use strict";

    // Force React global mapping
    var _react = React;

    // Create React wrapper components for Material Icons
    var _lucideReact = {};

    // Map icon names to Material Symbols names
    var iconNameMap = {
      'Search': 'search',
      'Filter': 'filter_list',
      'Plus': 'add',
      'X': 'close',
      'Edit2': 'edit',
      'Globe': 'language',
      'Check': 'check',
      'Copy': 'content_copy',
      'Coffee': 'restaurant',
      'ChevronUp': 'expand_less',
      'ChevronDown': 'expand_more',
      'Save': 'save',
      'Trash2': 'delete'
    };

    // Create React components for each icon using Material Symbols
    Object.keys(iconNameMap).forEach(function(iconName) {
      var materialIconName = iconNameMap[iconName];

      _lucideReact[iconName] = function MaterialIcon(props) {
        var className = 'material-symbols-outlined';
        if (props.className) {
          className += ' ' + props.className;
        }

        var style = {};
        if (props.size) {
          style.fontSize = props.size + 'px';
        }

        return React.createElement('span', {
          className: className,
          style: style
        }, materialIconName);
      };
    });

  Object.defineProperty(_exports, "__esModule", {
    value: true
  });
  _exports.default = void 0;
  _react = _interopRequireWildcard(_react);
  function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
  // Job Icons Component
  const JobIcon = ({
    job,
    size = 16,
    className = ""
  }) => {
    const jobIcons = {
      Carpenter: "🪚",
      Alchemist: "⚗️",
      Armorer: "🛡️",
      Blacksmith: "🗡️",
      Culinarian: "🍳",
      Goldsmith: "💍",
      Leatherworker: "🧤",
      Weaver: "🧵"
    };

    return _react.default.createElement("span", {
      className: className,
      style: {
        fontSize: size
      }
    }, jobIcons[job] || "🔧");
  };
  const CosmicExplorationDatabase = () => {
    // Job list for filters and dropdowns
    const jobList = ["Carpenter", "Alchemist", "Armorer", "Blacksmith", "Culinarian", "Goldsmith", "Leatherworker", "Weaver"];
    const foodList = ["None", "Rroneek Steak HQ", "Ceviche HQ"];

    // Load data from localStorage
    const loadMacros = () => {
      const saved = localStorage.getItem('ffxiv-macro-database');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved data:', e);
          return [];
        }
      }
      return [];
    };
    const [macros, setMacrosState] = (0, _react.useState)(loadMacros);

    // Wrapper for setMacros that saves to localStorage
    const setMacros = newMacros => {
      const macrosToSave = typeof newMacros === 'function' ? newMacros(macros) : newMacros;
      setMacrosState(macrosToSave);
      localStorage.setItem('ffxiv-macro-database', JSON.stringify(macrosToSave));
    };

    // Save to localStorage whenever macros change
    (0, _react.useEffect)(() => {
      localStorage.setItem('ffxiv-macro-database', JSON.stringify(macros));
    }, [macros]);
    const [searchTerm, setSearchTerm] = (0, _react.useState)('');
    const [searchMode, setSearchMode] = (0, _react.useState)('numeric');
    const [sortBy, setSortBy] = (0, _react.useState)('questName');
    const [filterCategory, setFilterCategory] = (0, _react.useState)('all');
    const [filterLocation, setFilterLocation] = (0, _react.useState)('all');
    const [filterJob, setFilterJob] = (0, _react.useState)('all');
    const [difficultySearch, setDifficultySearch] = (0, _react.useState)('');
    const [qualitySearch, setQualitySearch] = (0, _react.useState)('');
    const [durabilitySearch, setDurabilitySearch] = (0, _react.useState)('');
    const [expandedMacros, setExpandedMacros] = (0, _react.useState)({});
    const [copiedId, setCopiedId] = (0, _react.useState)(null);
    const [copiedItemId, setCopiedItemId] = (0, _react.useState)(null);
    const [editingId, setEditingId] = (0, _react.useState)(null);
    const [editedMacro, setEditedMacro] = (0, _react.useState)('');
    const [editingMacroIndex, setEditingMacroIndex] = (0, _react.useState)(0);
    const [editingGeneral, setEditingGeneral] = (0, _react.useState)(null);
    const [editingNotes, setEditingNotes] = (0, _react.useState)(null);
    const [editedNotes, setEditedNotes] = (0, _react.useState)('');
    const [deleteConfirm, setDeleteConfirm] = (0, _react.useState)(null);
    const [showAddForm, setShowAddForm] = (0, _react.useState)(false);
    const [newMacro, setNewMacro] = (0, _react.useState)({
      questName: '',
      location: 'Sinus Ardorum',
      job: 'Carpenter',
      items: [{
        name: '',
        difficulty: '',
        quality: '',
        durability: ''
      }],
      macro: '',
      notes: '',
      category: 'Class D',
      dataReward: {
        job: 'Carpenter',
        i: 0,
        ii: 0,
        iii: 0,
        iv: 0,
        v: 0,
        cosmicPoints: 0
      },
      foodRequired: false,
      foodType: 'None'
    });

    // Get unique categories, locations, and jobs
    const categories = (0, _react.useMemo)(() => {
      const cats = new Set(macros.map(m => m.category));
      return ['all', ...Array.from(cats).sort()];
    }, [macros]);
    const locations = (0, _react.useMemo)(() => {
      const locs = new Set();
      macros.forEach(m => {
        if (m.location.includes('/')) {
          m.location.split('/').forEach(l => locs.add(l.trim()));
        } else {
          locs.add(m.location);
        }
      });
      return ['all', ...Array.from(locs).sort()];
    }, [macros]);
    const jobs = (0, _react.useMemo)(() => {
      const jobSet = new Set(macros.map(m => m.job));
      return ['all', ...Array.from(jobSet).sort()];
    }, [macros]);

    // Filter and sort macros
    const filteredMacros = (0, _react.useMemo)(() => {
      let filtered = macros;

      // Apply search based on mode
      if (searchMode === 'text' && searchTerm) {
        filtered = filtered.filter(macro => macro.questName.toLowerCase().includes(searchTerm.toLowerCase()) || macro.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase())) || macro.notes.toLowerCase().includes(searchTerm.toLowerCase()) || macro.dataReward.job && macro.dataReward.job.toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (searchMode === 'numeric') {
        if (difficultySearch) {
          const difficulty = parseInt(difficultySearch);
          filtered = filtered.filter(macro => macro.items.some(item => item.difficulty === difficulty));
        }
        if (qualitySearch) {
          const quality = parseInt(qualitySearch);
          filtered = filtered.filter(macro => macro.items.some(item => item.quality === quality));
        }
        if (durabilitySearch) {
          const durability = parseInt(durabilitySearch);
          filtered = filtered.filter(macro => macro.items.some(item => item.durability === durability));
        }
      }

      // Apply filters
      if (filterCategory !== 'all') {
        filtered = filtered.filter(macro => macro.category === filterCategory);
      }
      if (filterLocation !== 'all') {
        filtered = filtered.filter(macro => macro.location.includes(filterLocation));
      }
      if (filterJob !== 'all') {
        filtered = filtered.filter(macro => macro.job === filterJob);
      }

      // Apply sorting
      filtered.sort((a, b) => {
        switch (sortBy) {
          case 'questName':
            return a.questName.localeCompare(b.questName);
          case 'difficulty':
            const maxDiffA = Math.max(...a.items.map(i => i.difficulty));
            const maxDiffB = Math.max(...b.items.map(i => i.difficulty));
            return maxDiffB - maxDiffA;
          case 'quality':
            const maxQualA = Math.max(...a.items.map(i => i.quality));
            const maxQualB = Math.max(...b.items.map(i => i.quality));
            return maxQualB - maxQualA;
          case 'category':
            const categoryOrder = ['Class A Expert', 'Class A', 'Class B', 'Class C', 'Class D', 'Sequential', 'Time-Restricted', 'Critical'];
            return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
          default:
            return 0;
        }
      });
      return filtered;
    }, [macros, searchTerm, searchMode, sortBy, filterCategory, filterLocation, filterJob, difficultySearch, qualitySearch, durabilitySearch]);
    const toggleExpanded = id => {
      setExpandedMacros(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    };
    const copyMacro = (id, macroText) => {
      navigator.clipboard.writeText(macroText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };
    const copyItemMacro = (macroId, itemIdx) => {
      const macro = macros.find(m => m.id === macroId);
      if (!macro) return;
      let macroText = '';
      if (macro.macros && macro.macros[itemIdx]) {
        macroText = macro.macros[itemIdx].macro;
      } else {
        macroText = macro.macro;
      }
      navigator.clipboard.writeText(macroText);
      setCopiedItemId(`${macroId}-${itemIdx}`);
      setTimeout(() => setCopiedItemId(null), 2000);
    };
    const startEditing = (id, currentMacro) => {
      setEditingId(id);
      setEditedMacro(currentMacro);
    };
    const saveEdit = id => {
      setMacros(prev => prev.map(macro => macro.id === id ? {
        ...macro,
        macro: editedMacro
      } : macro));
      setEditingId(null);
      setEditedMacro('');
    };
    const cancelEdit = () => {
      setEditingId(null);
      setEditedMacro('');
    };
    const saveGeneralEdit = (macroId, updates) => {
      setMacros(prev => prev.map(macro => macro.id === macroId ? {
        ...macro,
        ...updates
      } : macro));
      setEditingGeneral(null);
    };
    const deleteMacro = id => {
      setMacros(prev => prev.filter(macro => macro.id !== id));
      setDeleteConfirm(null);
      delete expandedMacros[id];
    };
    const addNewMacro = () => {
      const newMacroWithId = {
        ...newMacro,
        id: Date.now(),
        items: newMacro.items.map(item => ({
          ...item,
          difficulty: parseInt(item.difficulty) || 0,
          quality: parseInt(item.quality) || 0,
          durability: parseInt(item.durability) || 0
        })),
        dataReward: {
          job: newMacro.job,
          i: parseInt(newMacro.dataReward.i) || 0,
          ii: parseInt(newMacro.dataReward.ii) || 0,
          iii: parseInt(newMacro.dataReward.iii) || 0,
          iv: parseInt(newMacro.dataReward.iv) || 0,
          v: parseInt(newMacro.dataReward.v) || 0,
          cosmicPoints: parseInt(newMacro.dataReward.cosmicPoints) || 0
        }
      };
      if (newMacroWithId.items.length > 1) {
        newMacroWithId.macros = newMacroWithId.items.map(item => ({
          itemName: item.name,
          macro: newMacroWithId.macro
        }));
      }
      setMacros(prev => [...prev, newMacroWithId]);
      setNewMacro({
        questName: '',
        location: 'Sinus Ardorum',
        job: 'Carpenter',
        items: [{
          name: '',
          difficulty: '',
          quality: '',
          durability: ''
        }],
        macro: '',
        notes: '',
        category: 'Class D',
        dataReward: {
          job: 'Carpenter',
          i: 0,
          ii: 0,
          iii: 0,
          iv: 0,
          v: 0,
          cosmicPoints: 0
        },
        foodRequired: false,
        foodType: 'None'
      });
      setShowAddForm(false);
      setExpandedMacros({
        ...expandedMacros,
        [newMacroWithId.id]: true
      });
    };
    const updateNewMacro = (field, value) => {
      if (field === 'job') {
        setNewMacro(prev => ({
          ...prev,
          [field]: value,
          dataReward: {
            ...prev.dataReward,
            job: value
          }
        }));
      } else {
        setNewMacro(prev => ({
          ...prev,
          [field]: value
        }));
      }
    };
    const updateNewMacroItem = (index, field, value) => {
      const newItems = [...newMacro.items];
      newItems[index][field] = value;
      setNewMacro(prev => ({
        ...prev,
        items: newItems
      }));
    };
    const addNewItem = () => {
      setNewMacro(prev => ({
        ...prev,
        items: [...prev.items, {
          name: '',
          difficulty: '',
          quality: '',
          durability: ''
        }]
      }));
    };
    const removeNewItem = index => {
      setNewMacro(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }));
    };
    const addItemToMacro = macroId => {
      const newItem = {
        name: 'New Item',
        difficulty: 1000,
        quality: 1000,
        durability: 40
      };
      setMacros(prev => prev.map(m => {
        if (m.id === macroId) {
          const updatedMacro = {
            ...m,
            items: [...m.items, newItem]
          };
          if (updatedMacro.items.length > 1) {
            if (!updatedMacro.macros) {
              updatedMacro.macros = updatedMacro.items.map((item, idx) => ({
                itemName: item.name,
                macro: idx === 0 ? updatedMacro.macro : ''
              }));
            } else {
              updatedMacro.macros.push({
                itemName: newItem.name,
                macro: ''
              });
            }
          }
          return updatedMacro;
        }
        return m;
      }));
    };
    const removeItemFromMacro = (macroId, itemIndex) => {
      setMacros(prev => prev.map(m => {
        if (m.id === macroId) {
          const updatedMacro = {
            ...m,
            items: m.items.filter((_, i) => i !== itemIndex)
          };
          if (updatedMacro.macros && updatedMacro.macros.length > itemIndex) {
            updatedMacro.macros = updatedMacro.macros.filter((_, i) => i !== itemIndex);
            if (updatedMacro.items.length === 1 && updatedMacro.macros.length === 1) {
              updatedMacro.macro = updatedMacro.macros[0].macro;
              delete updatedMacro.macros;
            }
          }
          return updatedMacro;
        }
        return m;
      }));
    };
    return _react.default.createElement("div", {
      className: "min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-gray-100 p-6"
    }, _react.default.createElement("div", {
      className: "max-w-7xl mx-auto"
    }, _react.default.createElement("nav", {
      className: "mb-4 flex justify-end gap-2"
    }, _react.default.createElement("label", {
      className: "px-3 py-1 text-sm bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm rounded transition-all flex items-center gap-1 border border-slate-600/50 cursor-pointer"
    }, _react.default.createElement("span", {
      className: "material-symbols-outlined",
      style: { fontSize: '16px' }
    }, "upload"), _react.default.createElement("span", null, "Import CSV"), _react.default.createElement("input", {
      type: "file",
      accept: ".csv",
      onChange: e => {
        const file = e.target.files[0];
        if (file && window.CosmicExploration) {
          window.CosmicExploration.importFromCSV(file, () => {
            window.location.reload();
          });
        }
        e.target.value = '';
      },
      className: "hidden"
    })), _react.default.createElement("button", {
      onClick: () => window.CosmicExploration && window.CosmicExploration.exportToCSV(),
      className: "px-3 py-1 text-sm bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm rounded transition-all flex items-center gap-1 border border-slate-600/50"
    }, _react.default.createElement("span", {
      className: "material-symbols-outlined",
      style: { fontSize: '16px' }
    }, "download"), _react.default.createElement("span", null, "Export CSV"))), _react.default.createElement("div", {
      className: "text-center mb-8"
    }, _react.default.createElement("div", {
      className: "text-xs tracking-widest text-cyan-400/70 mb-2"
    }, "CRAFTING MACRO DATABASE"), _react.default.createElement("h1", {
      className: "text-4xl font-bold uppercase bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent"
    }, "Cosmic Exploration Missions")), _react.default.createElement("div", {
      className: "mb-6 space-y-4"
    }, _react.default.createElement("div", {
      className: "p-4 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl"
    }, _react.default.createElement("div", {
      className: "flex items-center justify-between mb-3"
    }, _react.default.createElement("h3", {
      className: "text-sm font-medium text-cyan-300 flex items-center gap-2"
    }, _react.default.createElement(_lucideReact.Search, {
      className: "w-4 h-4"
    }), "Search Mode"), _react.default.createElement("button", {
      onClick: () => setSearchMode(searchMode === 'numeric' ? 'text' : 'numeric'),
      className: "px-3 py-1 bg-indigo-600/50 hover:bg-indigo-600/70 backdrop-blur-sm rounded-md transition-all text-sm border border-indigo-500/30"
    }, "Switch to ", searchMode === 'numeric' ? 'Text' : 'Numeric', " Search")), searchMode === 'numeric' ? _react.default.createElement("div", {
      className: "flex gap-4"
    }, _react.default.createElement("div", {
      className: "flex-1"
    }, _react.default.createElement("input", {
      type: "number",
      placeholder: "Difficulty (exact)",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: difficultySearch,
      onChange: e => setDifficultySearch(e.target.value)
    })), _react.default.createElement("div", {
      className: "flex-1"
    }, _react.default.createElement("input", {
      type: "number",
      placeholder: "Quality (exact)",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: qualitySearch,
      onChange: e => setQualitySearch(e.target.value)
    })), _react.default.createElement("div", {
      className: "flex-1"
    }, _react.default.createElement("input", {
      type: "number",
      placeholder: "Durability (exact)",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: durabilitySearch,
      onChange: e => setDurabilitySearch(e.target.value)
    })), _react.default.createElement("button", {
      onClick: () => {
        setDifficultySearch('');
        setQualitySearch('');
        setDurabilitySearch('');
      },
      className: "px-4 py-2 bg-slate-700/50 hover:bg-slate-700/70 backdrop-blur-sm rounded transition-all border border-slate-600/30"
    }, "Clear")) : _react.default.createElement("div", {
      className: "relative"
    }, _react.default.createElement(_lucideReact.Search, {
      className: "absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400 w-5 h-5"
    }), _react.default.createElement("input", {
      type: "text",
      placeholder: "Search quests, items, or data rewards...",
      className: "w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: searchTerm,
      onChange: e => setSearchTerm(e.target.value)
    }))), _react.default.createElement("div", {
      className: "p-4 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl"
    }, _react.default.createElement("div", {
      className: "flex items-center gap-2 mb-3"
    }, _react.default.createElement(_lucideReact.Filter, {
      className: "w-4 h-4 text-cyan-300"
    }), _react.default.createElement("h3", {
      className: "text-sm font-medium text-cyan-300"
    }, "Filters")), _react.default.createElement("div", {
      className: "flex flex-col md:flex-row gap-4"
    }, _react.default.createElement("select", {
      className: "px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: sortBy,
      onChange: e => setSortBy(e.target.value)
    }, _react.default.createElement("option", {
      value: "questName"
    }, "Sort by Quest Name"), _react.default.createElement("option", {
      value: "category"
    }, "Sort by Class (A\u2192D)"), _react.default.createElement("option", {
      value: "difficulty"
    }, "Sort by Difficulty"), _react.default.createElement("option", {
      value: "quality"
    }, "Sort by Quality")), _react.default.createElement("select", {
      className: "px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: filterCategory,
      onChange: e => setFilterCategory(e.target.value)
    }, categories.map(cat => _react.default.createElement("option", {
      key: cat,
      value: cat
    }, cat === 'all' ? 'All Classes' : cat))), _react.default.createElement("select", {
      className: "px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: filterLocation,
      onChange: e => setFilterLocation(e.target.value)
    }, locations.map(loc => _react.default.createElement("option", {
      key: loc,
      value: loc
    }, loc === 'all' ? 'All Locations' : loc))), _react.default.createElement("select", {
      className: "px-4 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: filterJob,
      onChange: e => setFilterJob(e.target.value)
    }, _react.default.createElement("option", {
      value: "all"
    }, "All Jobs"), jobList.map(job => _react.default.createElement("option", {
      key: job,
      value: job
    }, job)))))), _react.default.createElement("button", {
      onClick: () => setShowAddForm(true),
      className: "mb-6 w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
    }, _react.default.createElement(_lucideReact.Plus, {
      className: "w-4 h-4"
    }), _react.default.createElement("span", null, "Add New Macro"))), showAddForm && _react.default.createElement("div", {
      className: "mb-6 p-6 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl"
    }, _react.default.createElement("h2", {
      className: "text-xl font-semibold mb-4 text-cyan-400"
    }, "Add New Macro"), _react.default.createElement("div", {
      className: "space-y-4"
    }, _react.default.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-3 gap-4"
    }, _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Quest Name"), _react.default.createElement("input", {
      type: "text",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.questName,
      onChange: e => updateNewMacro('questName', e.target.value)
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Location"), _react.default.createElement("select", {
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.location,
      onChange: e => updateNewMacro('location', e.target.value)
    }, _react.default.createElement("option", {
      value: "Sinus Ardorum"
    }, "Sinus Ardorum"), _react.default.createElement("option", {
      value: "Phaenna"
    }, "Phaenna"), _react.default.createElement("option", {
      value: "Oizys"
    }, "Oizys"))), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Job"), _react.default.createElement("select", {
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.job,
      onChange: e => updateNewMacro('job', e.target.value)
    }, jobList.map(job => _react.default.createElement("option", {
      key: job,
      value: job
    }, job))))), _react.default.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 gap-4"
    }, _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Category"), _react.default.createElement("select", {
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.category,
      onChange: e => updateNewMacro('category', e.target.value)
    }, _react.default.createElement("option", {
      value: "Class D"
    }, "Class D"), _react.default.createElement("option", {
      value: "Class C"
    }, "Class C"), _react.default.createElement("option", {
      value: "Class B"
    }, "Class B"), _react.default.createElement("option", {
      value: "Class A"
    }, "Class A"), _react.default.createElement("option", {
      value: "Class A Expert"
    }, "Class A Expert"), _react.default.createElement("option", {
      value: "Sequential"
    }, "Sequential"), _react.default.createElement("option", {
      value: "Time-Restricted"
    }, "Time-Restricted"), _react.default.createElement("option", {
      value: "Critical"
    }, "Critical"))), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Food"), _react.default.createElement("div", {
      className: "flex gap-2"
    }, _react.default.createElement("input", {
      type: "checkbox",
      className: "mt-2 accent-cyan-500",
      checked: newMacro.foodRequired,
      onChange: e => updateNewMacro('foodRequired', e.target.checked)
    }), _react.default.createElement("select", {
      className: "flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.foodType,
      onChange: e => updateNewMacro('foodType', e.target.value),
      disabled: !newMacro.foodRequired
    }, foodList.map(food => _react.default.createElement("option", {
      key: food,
      value: food
    }, food)))))), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Data Reward (", newMacro.job, ")"), _react.default.createElement("div", {
      className: "grid grid-cols-6 gap-2"
    }, _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "I"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.i,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        i: e.target.value
      })
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "II"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.ii,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        ii: e.target.value
      })
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "III"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.iii,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        iii: e.target.value
      })
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "IV"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.iv,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        iv: e.target.value
      })
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "V"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.v,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        v: e.target.value
      })
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-xs text-gray-400 mb-1"
    }, "\uD83E\uDE90 Points"), _react.default.createElement("input", {
      type: "number",
      placeholder: "0",
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      value: newMacro.dataReward.cosmicPoints,
      onChange: e => updateNewMacro('dataReward', {
        ...newMacro.dataReward,
        cosmicPoints: e.target.value
      })
    })))), _react.default.createElement("div", null, _react.default.createElement("div", {
      className: "flex items-center justify-between mb-2"
    }, _react.default.createElement("label", {
      className: "block text-sm font-medium text-cyan-300"
    }, "Items"), _react.default.createElement("button", {
      onClick: addNewItem,
      className: "px-2 py-1 bg-indigo-600/50 hover:bg-indigo-600/70 backdrop-blur-sm rounded text-sm border border-indigo-500/30 transition-all"
    }, "Add Item")), newMacro.items.map((item, index) => _react.default.createElement("div", {
      key: index,
      className: "flex flex-wrap gap-2 mb-2"
    }, _react.default.createElement("input", {
      type: "text",
      className: "flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      placeholder: "Item Name",
      value: item.name,
      onChange: e => updateNewMacroItem(index, 'name', e.target.value)
    }), _react.default.createElement("input", {
      type: "number",
      className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      placeholder: "Difficulty",
      value: item.difficulty,
      onChange: e => updateNewMacroItem(index, 'difficulty', e.target.value)
    }), _react.default.createElement("input", {
      type: "number",
      className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      placeholder: "Quality",
      value: item.quality,
      onChange: e => updateNewMacroItem(index, 'quality', e.target.value)
    }), _react.default.createElement("input", {
      type: "number",
      className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      placeholder: "Durability",
      value: item.durability,
      onChange: e => updateNewMacroItem(index, 'durability', e.target.value)
    }), newMacro.items.length > 1 && _react.default.createElement("button", {
      onClick: () => removeNewItem(index),
      className: "px-2 py-2 bg-red-600/50 hover:bg-red-600/70 backdrop-blur-sm rounded border border-red-500/30 transition-all"
    }, _react.default.createElement(_lucideReact.X, {
      className: "w-4 h-4"
    }))))), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Macro"), _react.default.createElement("textarea", {
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all font-mono text-sm",
      rows: 6,
      value: newMacro.macro,
      onChange: e => updateNewMacro('macro', e.target.value),
      placeholder: "/ac \"Muscle Memory\" <wait.3>"
    })), _react.default.createElement("div", null, _react.default.createElement("label", {
      className: "block text-sm font-medium mb-1 text-cyan-300"
    }, "Notes"), _react.default.createElement("textarea", {
      className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_0_2px_rgba(6,182,212,0.2)] transition-all",
      rows: 2,
      value: newMacro.notes,
      onChange: e => updateNewMacro('notes', e.target.value),
      placeholder: "Space for additional notes..."
    })), _react.default.createElement("div", {
      className: "flex gap-2 justify-end"
    }, _react.default.createElement("button", {
      onClick: () => setShowAddForm(false),
      className: "px-4 py-2 bg-slate-600/50 hover:bg-slate-600/70 backdrop-blur-sm rounded transition-all border border-slate-500/30"
    }, "Cancel"), _react.default.createElement("button", {
      onClick: addNewMacro,
      disabled: !newMacro.questName || !newMacro.items[0].name,
      className: "px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/30"
    }, "Add Macro")))), _react.default.createElement("div", {
      className: "mb-4 text-cyan-300"
    }, _react.default.createElement("div", null, "Found ", filteredMacros.length, " mission", filteredMacros.length !== 1 ? 's' : ''), searchMode === 'numeric' && (difficultySearch || qualitySearch || durabilitySearch) && _react.default.createElement("div", {
      className: "text-sm mt-1"
    }, "Searching for exact matches:", difficultySearch && _react.default.createElement("span", {
      className: "ml-2 text-orange-400"
    }, "Difficulty = ", difficultySearch), qualitySearch && _react.default.createElement("span", {
      className: "ml-2 text-green-400"
    }, "Quality = ", qualitySearch), durabilitySearch && _react.default.createElement("span", {
      className: "ml-2 text-red-400"
    }, "Durability = ", durabilitySearch))), _react.default.createElement("div", {
      className: "space-y-4"
    }, filteredMacros.map(macro => {
      var _document$getElementB;
      return _react.default.createElement("div", {
        key: macro.id,
        className: "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden group shadow-xl"
      }, _react.default.createElement("div", {
        className: "p-4 cursor-pointer hover:bg-slate-700/30 transition-all",
        onClick: () => toggleExpanded(macro.id)
      }, _react.default.createElement("div", {
        className: "flex items-center justify-between"
      }, _react.default.createElement("div", {
        className: "flex-1"
      }, _react.default.createElement("div", {
        className: "flex items-center gap-2 mb-2"
      }, _react.default.createElement("h3", {
        className: "text-xl font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
      }, macro.questName), _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          setEditingGeneral(macro.id);
        },
        className: "p-1 hover:bg-slate-600/50 rounded opacity-0 group-hover:opacity-100 transition-all"
      }, _react.default.createElement(_lucideReact.Edit2, {
        className: "w-4 h-4 text-cyan-400"
      }))), _react.default.createElement("div", {
        className: "flex flex-wrap gap-2 mb-2"
      }, _react.default.createElement("span", {
        className: "px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-md text-sm flex items-center gap-1 border border-indigo-500/30"
      }, _react.default.createElement(_lucideReact.Globe, {
        className: "w-3 h-3"
      }), macro.location), _react.default.createElement("span", {
        className: "px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-sm flex items-center gap-1 border border-purple-500/30"
      }, _react.default.createElement(JobIcon, {
        job: macro.job,
        size: 12
      }), macro.job)), _react.default.createElement("div", {
        className: "flex flex-wrap gap-2 items-center"
      }, _react.default.createElement("span", {
        className: "text-sm text-cyan-300"
      }, "Crafts:"), macro.items.map((item, idx) => _react.default.createElement("button", {
        key: idx,
        onClick: e => {
          e.stopPropagation();
          copyItemMacro(macro.id, idx);
        },
        className: "px-2 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded-md text-sm transition-all flex items-center gap-1 border border-slate-600/50"
      }, copiedItemId === `${macro.id}-${idx}` ? _react.default.createElement(_react.default.Fragment, null, _react.default.createElement(_lucideReact.Check, {
        className: "w-3 h-3 text-green-400"
      }), _react.default.createElement("span", {
        className: "text-green-400"
      }, item.name)) : _react.default.createElement(_react.default.Fragment, null, _react.default.createElement(_lucideReact.Copy, {
        className: "w-3 h-3 text-slate-400"
      }), _react.default.createElement("span", null, item.name)))))), _react.default.createElement("div", {
        className: "flex items-center gap-2"
      }, macro.foodRequired && macro.foodType !== 'None' && _react.default.createElement("span", {
        className: "flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-md text-sm border border-emerald-500/30"
      }, _react.default.createElement(_lucideReact.Coffee, {
        className: "w-3 h-3"
      }), macro.foodType), _react.default.createElement("span", {
        className: `text-sm px-2 py-1 rounded border ${macro.category.includes('Class A') && !macro.category.includes('Expert') ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : macro.category === 'Class A Expert' ? 'bg-red-500/20 text-red-300 border-red-500/30' : macro.category === 'Class B' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : macro.category === 'Class C' ? 'bg-green-500/20 text-green-300 border-green-500/30' : macro.category === 'Class D' ? 'bg-slate-500/20 text-slate-300 border-slate-500/30' : macro.category === 'Sequential' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : macro.category === 'Time-Restricted' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : macro.category === 'Critical' ? 'bg-red-600/20 text-red-300 border-red-600/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`
      }, macro.category), expandedMacros[macro.id] ? _react.default.createElement(_lucideReact.ChevronUp, {
        className: "w-5 h-5 text-cyan-400"
      }) : _react.default.createElement(_lucideReact.ChevronDown, {
        className: "w-5 h-5 text-cyan-400"
      })))), editingGeneral === macro.id && _react.default.createElement("div", {
        className: "border-t border-slate-700/50 p-4 bg-slate-900/30"
      }, _react.default.createElement("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"
      }, _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Quest Name"), _react.default.createElement("input", {
        type: "text",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500",
        defaultValue: macro.questName,
        id: `questName-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Location"), _react.default.createElement("select", {
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500",
        defaultValue: macro.location,
        id: `location-${macro.id}`
      }, _react.default.createElement("option", {
        value: "Sinus Ardorum"
      }, "Sinus Ardorum"), _react.default.createElement("option", {
        value: "Phaenna"
      }, "Phaenna"), _react.default.createElement("option", {
        value: "Oizys"
      }, "Oizys"))), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Job"), _react.default.createElement("select", {
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500",
        defaultValue: macro.job,
        id: `job-${macro.id}`
      }, jobList.map(job => _react.default.createElement("option", {
        key: job,
        value: job
      }, job)))), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Category"), _react.default.createElement("select", {
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500",
        defaultValue: macro.category,
        id: `category-${macro.id}`
      }, _react.default.createElement("option", {
        value: "Class D"
      }, "Class D"), _react.default.createElement("option", {
        value: "Class C"
      }, "Class C"), _react.default.createElement("option", {
        value: "Class B"
      }, "Class B"), _react.default.createElement("option", {
        value: "Class A"
      }, "Class A"), _react.default.createElement("option", {
        value: "Class A Expert"
      }, "Class A Expert"), _react.default.createElement("option", {
        value: "Sequential"
      }, "Sequential"), _react.default.createElement("option", {
        value: "Time-Restricted"
      }, "Time-Restricted"), _react.default.createElement("option", {
        value: "Critical"
      }, "Critical"))), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Food"), _react.default.createElement("div", {
        className: "flex gap-2"
      }, _react.default.createElement("input", {
        type: "checkbox",
        className: "mt-2 accent-cyan-500",
        defaultChecked: macro.foodRequired,
        id: `foodRequired-${macro.id}`
      }), _react.default.createElement("select", {
        className: "flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded focus:outline-none focus:border-cyan-500",
        defaultValue: macro.foodType,
        id: `foodType-${macro.id}`
      }, foodList.map(food => _react.default.createElement("option", {
        key: food,
        value: food
      }, food)))))), _react.default.createElement("div", {
        className: "mb-4"
      }, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Craft Requirements"), macro.items.map((item, idx) => _react.default.createElement("div", {
        key: idx,
        className: "flex gap-2 mb-2"
      }, _react.default.createElement("input", {
        type: "text",
        className: "flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: item.name,
        id: `itemName-${macro.id}-${idx}`
      }), _react.default.createElement("input", {
        type: "number",
        className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: item.difficulty,
        id: `itemDifficulty-${macro.id}-${idx}`
      }), _react.default.createElement("input", {
        type: "number",
        className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: item.quality,
        id: `itemQuality-${macro.id}-${idx}`
      }), _react.default.createElement("input", {
        type: "number",
        className: "w-24 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: item.durability,
        id: `itemDurability-${macro.id}-${idx}`
      })))), _react.default.createElement("div", {
        className: "mb-4"
      }, _react.default.createElement("label", {
        className: "block text-sm font-medium mb-1 text-cyan-300"
      }, "Data Reward (", ((_document$getElementB = document.getElementById(`job-${macro.id}`)) === null || _document$getElementB === void 0 ? void 0 : _document$getElementB.value) || macro.dataReward.job, ")"), _react.default.createElement("div", {
        className: "grid grid-cols-6 gap-2"
      }, _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "I"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.i,
        id: `dataRewardI-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "II"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.ii,
        id: `dataRewardII-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "III"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.iii,
        id: `dataRewardIII-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "IV"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.iv,
        id: `dataRewardIV-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "V"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.v,
        id: `dataRewardV-${macro.id}`
      })), _react.default.createElement("div", null, _react.default.createElement("label", {
        className: "block text-xs text-gray-400 mb-1"
      }, "\uD83E\uDE90 Points"), _react.default.createElement("input", {
        type: "number",
        placeholder: "0",
        className: "w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded",
        defaultValue: macro.dataReward.cosmicPoints || 0,
        id: `dataRewardCosmicPoints-${macro.id}`
      })))), _react.default.createElement("div", {
        className: "flex gap-2 justify-end"
      }, _react.default.createElement("button", {
        onClick: () => setEditingGeneral(null),
        className: "px-4 py-2 bg-slate-600/50 hover:bg-slate-600/70 backdrop-blur-sm rounded transition-all border border-slate-500/30"
      }, "Cancel"), _react.default.createElement("button", {
        onClick: () => {
          const job = document.getElementById(`job-${macro.id}`).value;
          const updates = {
            questName: document.getElementById(`questName-${macro.id}`).value,
            location: document.getElementById(`location-${macro.id}`).value,
            job: job,
            category: document.getElementById(`category-${macro.id}`).value,
            foodRequired: document.getElementById(`foodRequired-${macro.id}`).checked,
            foodType: document.getElementById(`foodType-${macro.id}`).value,
            items: macro.items.map((item, idx) => ({
              name: document.getElementById(`itemName-${macro.id}-${idx}`).value,
              difficulty: parseInt(document.getElementById(`itemDifficulty-${macro.id}-${idx}`).value) || 0,
              quality: parseInt(document.getElementById(`itemQuality-${macro.id}-${idx}`).value) || 0,
              durability: parseInt(document.getElementById(`itemDurability-${macro.id}-${idx}`).value) || 0
            })),
            dataReward: {
              job: job,
              i: parseInt(document.getElementById(`dataRewardI-${macro.id}`).value) || 0,
              ii: parseInt(document.getElementById(`dataRewardII-${macro.id}`).value) || 0,
              iii: parseInt(document.getElementById(`dataRewardIII-${macro.id}`).value) || 0,
              iv: parseInt(document.getElementById(`dataRewardIV-${macro.id}`).value) || 0,
              v: parseInt(document.getElementById(`dataRewardV-${macro.id}`).value) || 0,
              cosmicPoints: parseInt(document.getElementById(`dataRewardCosmicPoints-${macro.id}`).value) || 0
            }
          };
          saveGeneralEdit(macro.id, updates);
        },
        className: "px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded transition-all shadow-lg shadow-green-900/30"
      }, "Save"))), expandedMacros[macro.id] && _react.default.createElement("div", {
        className: "border-t border-slate-700/50 p-4 space-y-4"
      }, _react.default.createElement("div", null, _react.default.createElement("div", {
        className: "flex items-center justify-between mb-2"
      }, _react.default.createElement("h4", {
        className: "font-semibold text-cyan-300"
      }, "Craft Requirements"), _react.default.createElement("button", {
        onClick: () => addItemToMacro(macro.id),
        className: "px-2 py-1 bg-indigo-600/50 hover:bg-indigo-600/70 backdrop-blur-sm rounded text-sm border border-indigo-500/30 transition-all"
      }, "Add Item")), _react.default.createElement("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-4"
      }, macro.items.map((item, idx) => _react.default.createElement("div", {
        key: idx,
        className: "bg-slate-700/30 p-3 rounded-lg relative border border-slate-600/50"
      }, macro.items.length > 1 && _react.default.createElement("button", {
        onClick: () => removeItemFromMacro(macro.id, idx),
        className: "absolute top-2 right-2 p-1 bg-red-600/50 hover:bg-red-600/70 rounded border border-red-500/30"
      }, _react.default.createElement(_lucideReact.X, {
        className: "w-3 h-3"
      })), _react.default.createElement("p", {
        className: "font-medium text-cyan-300 pr-6"
      }, item.name), _react.default.createElement("div", {
        className: "space-y-1 text-sm mt-2"
      }, _react.default.createElement("p", null, "Difficulty: ", _react.default.createElement("span", {
        className: `text-orange-400 ${searchMode === 'numeric' && difficultySearch && item.difficulty === parseInt(difficultySearch) ? 'font-bold bg-orange-500/20 px-1 rounded' : ''}`
      }, item.difficulty)), _react.default.createElement("p", null, "Quality: ", _react.default.createElement("span", {
        className: `text-green-400 ${searchMode === 'numeric' && qualitySearch && item.quality === parseInt(qualitySearch) ? 'font-bold bg-green-500/20 px-1 rounded' : ''}`
      }, item.quality)), _react.default.createElement("p", null, "Durability: ", _react.default.createElement("span", {
        className: `text-red-400 ${searchMode === 'numeric' && durabilitySearch && item.durability === parseInt(durabilitySearch) ? 'font-bold bg-red-500/20 px-1 rounded' : ''}`
      }, item.durability))))))), _react.default.createElement("div", null, _react.default.createElement("h4", {
        className: "font-semibold mb-2 text-cyan-300"
      }, "Data Reward"), _react.default.createElement("div", {
        className: "flex flex-wrap gap-3"
      }, macro.dataReward.i > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-gray-600/30 rounded-md border border-gray-500/50",
        style: {
          boxShadow: '0 0 10px rgba(156, 163, 175, 0.5)'
        }
      }, _react.default.createElement(JobIcon, {
        job: macro.dataReward.job || macro.job,
        size: 16
      }), _react.default.createElement("span", {
        className: "text-gray-300 font-bold"
      }, "I"), _react.default.createElement("span", {
        className: "text-gray-400 text-sm"
      }, "\xD7", macro.dataReward.i)), macro.dataReward.ii > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-yellow-600/30 rounded-md border border-yellow-500/50",
        style: {
          boxShadow: '0 0 10px rgba(250, 204, 21, 0.5)'
        }
      }, _react.default.createElement(JobIcon, {
        job: macro.dataReward.job || macro.job,
        size: 16
      }), _react.default.createElement("span", {
        className: "text-yellow-300 font-bold"
      }, "II"), _react.default.createElement("span", {
        className: "text-yellow-400 text-sm"
      }, "\xD7", macro.dataReward.ii)), macro.dataReward.iii > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-blue-600/30 rounded-md border border-blue-500/50",
        style: {
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)'
        }
      }, _react.default.createElement(JobIcon, {
        job: macro.dataReward.job || macro.job,
        size: 16
      }), _react.default.createElement("span", {
        className: "text-blue-300 font-bold"
      }, "III"), _react.default.createElement("span", {
        className: "text-blue-400 text-sm"
      }, "\xD7", macro.dataReward.iii)), macro.dataReward.iv > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-purple-600/30 rounded-md border border-purple-500/50",
        style: {
          boxShadow: '0 0 10px rgba(168, 85, 247, 0.5)'
        }
      }, _react.default.createElement(JobIcon, {
        job: macro.dataReward.job || macro.job,
        size: 16
      }), _react.default.createElement("span", {
        className: "text-purple-300 font-bold"
      }, "IV"), _react.default.createElement("span", {
        className: "text-purple-400 text-sm"
      }, "\xD7", macro.dataReward.iv)), macro.dataReward.v > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-red-600/30 rounded-md border border-red-500/50",
        style: {
          boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
        }
      }, _react.default.createElement(JobIcon, {
        job: macro.dataReward.job || macro.job,
        size: 16
      }), _react.default.createElement("span", {
        className: "text-red-300 font-bold"
      }, "V"), _react.default.createElement("span", {
        className: "text-red-400 text-sm"
      }, "\xD7", macro.dataReward.v)), macro.dataReward.cosmicPoints > 0 && _react.default.createElement("div", {
        className: "flex items-center gap-2 px-3 py-1 bg-cyan-600/30 rounded-md border border-cyan-500/50",
        style: {
          boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
        }
      }, _react.default.createElement("span", {
        style: {
          fontSize: '16px'
        }
      }, "\uD83E\uDE90"), _react.default.createElement("span", {
        className: "text-cyan-300 font-bold"
      }, "Points"), _react.default.createElement("span", {
        className: "text-cyan-400 text-sm"
      }, "\xD7", macro.dataReward.cosmicPoints)), macro.dataReward.i === 0 && macro.dataReward.ii === 0 && macro.dataReward.iii === 0 && macro.dataReward.iv === 0 && macro.dataReward.v === 0 && (!macro.dataReward.cosmicPoints || macro.dataReward.cosmicPoints === 0) && _react.default.createElement("span", {
        className: "text-slate-400 text-sm"
      }, "No data rewards"))), _react.default.createElement("div", null, _react.default.createElement("div", {
        className: "flex items-center justify-between mb-2"
      }, _react.default.createElement("h4", {
        className: "font-semibold text-cyan-300"
      }, "Macro", macro.macros && macro.macros.length > 1 ? 's' : ''), _react.default.createElement("div", {
        className: "flex gap-2"
      }, editingId !== macro.id && _react.default.createElement(_react.default.Fragment, null, _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          startEditing(macro.id, macro.macros ? macro.macros[0].macro : macro.macro);
          setEditingMacroIndex(0);
        },
        className: "flex items-center gap-2 px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded transition-all border border-slate-600/50"
      }, _react.default.createElement(_lucideReact.Edit2, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", {
        className: "text-sm"
      }, "Edit")), _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          copyMacro(macro.id, macro.macros ? macro.macros[0].macro : macro.macro);
        },
        className: "flex items-center gap-2 px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded transition-all border border-slate-600/50"
      }, copiedId === macro.id ? _react.default.createElement(_react.default.Fragment, null, _react.default.createElement(_lucideReact.Check, {
        className: "w-4 h-4 text-green-400"
      }), _react.default.createElement("span", {
        className: "text-sm text-green-400"
      }, "Copied!")) : _react.default.createElement(_react.default.Fragment, null, _react.default.createElement(_lucideReact.Copy, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", {
        className: "text-sm"
      }, "Copy")))), editingId === macro.id && _react.default.createElement(_react.default.Fragment, null, _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          if (macro.macros) {
            const updatedMacros = [...macro.macros];
            updatedMacros[editingMacroIndex] = {
              ...updatedMacros[editingMacroIndex],
              macro: editedMacro
            };
            setMacros(prev => prev.map(m => m.id === macro.id ? {
              ...m,
              macros: updatedMacros
            } : m));
          } else {
            saveEdit(macro.id);
          }
          setEditingId(null);
          setEditedMacro('');
        },
        className: "flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded transition-all"
      }, _react.default.createElement(_lucideReact.Save, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", {
        className: "text-sm"
      }, "Save")), _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          cancelEdit();
        },
        className: "flex items-center gap-2 px-3 py-1 bg-red-600/50 hover:bg-red-600/70 rounded transition-all border border-red-500/30"
      }, _react.default.createElement(_lucideReact.X, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", {
        className: "text-sm"
      }, "Cancel"))))), editingId === macro.id ? _react.default.createElement("div", {
        className: "space-y-2"
      }, macro.macros && editingMacroIndex < macro.macros.length && _react.default.createElement("div", {
        className: "text-sm text-cyan-300"
      }, "Editing macro for: ", macro.macros[editingMacroIndex].itemName), _react.default.createElement("textarea", {
        value: editedMacro,
        onChange: e => setEditedMacro(e.target.value),
        className: "w-full bg-slate-900/50 p-3 rounded-lg text-sm font-mono border border-slate-600/50 focus:outline-none focus:border-cyan-500",
        rows: 10,
        onClick: e => e.stopPropagation()
      })) : _react.default.createElement(_react.default.Fragment, null, macro.macros ? _react.default.createElement("div", {
        className: "space-y-4"
      }, macro.macros.map((macroItem, idx) => _react.default.createElement("div", {
        key: idx,
        className: "bg-slate-900/50 rounded-lg p-3 border border-slate-600/50"
      }, _react.default.createElement("div", {
        className: "flex items-center justify-between mb-2"
      }, _react.default.createElement("h5", {
        className: "text-sm font-medium text-cyan-300"
      }, macroItem.itemName), _react.default.createElement("div", {
        className: "flex gap-2"
      }, _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          startEditing(macro.id, macroItem.macro);
          setEditingMacroIndex(idx);
        },
        className: "p-1 hover:bg-slate-700/50 rounded"
      }, _react.default.createElement(_lucideReact.Edit2, {
        className: "w-3 h-3 text-cyan-400"
      })), _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          copyMacro(`${macro.id}-${idx}`, macroItem.macro);
        },
        className: "p-1 hover:bg-slate-700/50 rounded"
      }, copiedId === `${macro.id}-${idx}` ? _react.default.createElement(_lucideReact.Check, {
        className: "w-3 h-3 text-green-400"
      }) : _react.default.createElement(_lucideReact.Copy, {
        className: "w-3 h-3"
      })))), _react.default.createElement("pre", {
        className: "text-sm font-mono overflow-x-auto text-gray-300"
      }, macroItem.macro)))) : _react.default.createElement("pre", {
        className: "bg-slate-900/50 p-3 rounded-lg text-sm font-mono overflow-x-auto border border-slate-600/50 text-gray-300"
      }, macro.macro))), _react.default.createElement("div", null, _react.default.createElement("div", {
        className: "flex items-center justify-between mb-2"
      }, _react.default.createElement("h4", {
        className: "font-semibold text-cyan-300"
      }, "Notes"), _react.default.createElement("button", {
        onClick: e => {
          e.stopPropagation();
          setEditingNotes(macro.id);
          setEditedNotes(macro.notes || '');
        },
        className: "flex items-center gap-2 px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded transition-all border border-slate-600/50"
      }, _react.default.createElement(_lucideReact.Edit2, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", {
        className: "text-sm"
      }, "Edit"))), editingNotes === macro.id ? _react.default.createElement("div", {
        className: "space-y-2"
      }, _react.default.createElement("textarea", {
        value: editedNotes,
        onChange: e => setEditedNotes(e.target.value),
        className: "w-full bg-slate-700/30 p-3 rounded text-gray-300 border border-slate-600/50",
        rows: 3
      }), _react.default.createElement("div", {
        className: "flex gap-2"
      }, _react.default.createElement("button", {
        onClick: () => {
          setMacros(prev => prev.map(m => m.id === macro.id ? {
            ...m,
            notes: editedNotes
          } : m));
          setEditingNotes(null);
          setEditedNotes('');
        },
        className: "px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded"
      }, "Save"), _react.default.createElement("button", {
        onClick: () => {
          setEditingNotes(null);
          setEditedNotes('');
        },
        className: "px-3 py-1 bg-red-600/50 hover:bg-red-600/70 rounded border border-red-500/30"
      }, "Cancel"))) : _react.default.createElement("p", {
        className: "text-gray-400"
      }, macro.notes || 'No notes added.')), _react.default.createElement("div", {
        className: "pt-4 border-t border-slate-700/50"
      }, deleteConfirm === macro.id ? _react.default.createElement("div", {
        className: "flex items-center justify-center gap-2"
      }, _react.default.createElement("span", {
        className: "text-red-400"
      }, "Are you sure?"), _react.default.createElement("button", {
        onClick: () => deleteMacro(macro.id),
        className: "px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded transition-all"
      }, "Yes"), _react.default.createElement("button", {
        onClick: () => setDeleteConfirm(null),
        className: "px-4 py-2 bg-red-600/50 hover:bg-red-600/70 rounded transition-all border border-red-500/30"
      }, "No")) : _react.default.createElement("button", {
        onClick: () => setDeleteConfirm(macro.id),
        className: "w-full px-4 py-2 bg-red-600/30 hover:bg-red-600/50 backdrop-blur-sm rounded transition-all flex items-center justify-center gap-2 border border-red-500/30"
      }, _react.default.createElement(_lucideReact.Trash2, {
        className: "w-4 h-4"
      }), _react.default.createElement("span", null, "Delete Entry")))));
    })), macros.length === 0 && _react.default.createElement("div", {
      className: "text-center py-12"
    }, _react.default.createElement("p", {
      className: "text-cyan-300 text-lg"
    }, "No data")), macros.length > 0 && filteredMacros.length === 0 && _react.default.createElement("div", {
      className: "text-center py-12"
    }, _react.default.createElement("p", {
      className: "text-cyan-300"
    }, "No missions found matching your criteria.")));
  };
  // Export as default for module systems
  var _default = _exports.default = CosmicExplorationDatabase;

  // Also attach to window for direct browser usage
  if (typeof window !== "undefined") {
    window.CosmicExplorationDatabase = CosmicExplorationDatabase;
  }
});
