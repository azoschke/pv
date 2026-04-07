		// Image assets for PDF
        let textureImage = null;
        let emblemImage = null;

        // Font data for PDF (will be loaded)
        let fontsLoaded = false;
        let fontData = {
            ledger: null,
            stoke: null,
            laBelleAurore: null,
            crimsonPro: null,
            crimsonProItalic: null
        };

		// Local font file URLs
		const FONT_URLS = {
		    ledger: '/pv-project/assets/Ledger-Regular.ttf',
		    stoke: '/pv-project/assets/Stoke-Regular.ttf',
		    laBelleAurore: '/pv-project/assets/LaBelleAurore-Regular.ttf',
		    crimsonPro: '/pv-project/assets/CrimsonPro-VariableFont_wght.ttf',
		    crimsonProItalic: '/pv-project/assets/CrimsonPro-Italic-VariableFont_wght.ttf'
		};

        // Convert ArrayBuffer to Base64
        function arrayBufferToBase64(buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }

        // Load a font file and return as base64
        async function loadFont(url) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch ${url}`);
                const arrayBuffer = await response.arrayBuffer();
                return arrayBufferToBase64(arrayBuffer);
            } catch (error) {
                console.warn(`Could not load font from ${url}:`, error);
                return null;
            }
        }

        // Register fonts with jsPDF
        function registerFonts(doc) {
            if (fontData.ledger) {
                doc.addFileToVFS('Ledger-Regular.ttf', fontData.ledger);
                doc.addFont('Ledger-Regular.ttf', 'Ledger', 'normal');
            }
            if (fontData.stoke) {
                doc.addFileToVFS('Stoke-Regular.ttf', fontData.stoke);
                doc.addFont('Stoke-Regular.ttf', 'Stoke', 'normal');
            }
            if (fontData.laBelleAurore) {
                doc.addFileToVFS('LaBelleAurore.ttf', fontData.laBelleAurore);
                doc.addFont('LaBelleAurore.ttf', 'LaBelleAurore', 'normal');
            }
            if (fontData.crimsonPro) {
                doc.addFileToVFS('CrimsonPro-Regular.ttf', fontData.crimsonPro);
                doc.addFont('CrimsonPro-Regular.ttf', 'CrimsonPro', 'normal');
            }
            if (fontData.crimsonProItalic) {
                doc.addFileToVFS('CrimsonPro-Italic.ttf', fontData.crimsonProItalic);
                doc.addFont('CrimsonPro-Italic.ttf', 'CrimsonPro-Italic', 'normal');
            }
        }

        // Preload all assets (images and fonts)
        async function preloadAssets() {
            const loadTextureImage = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/jpeg', 0.8));
                    };
                    img.onerror = reject;
                    img.src = src;
                });
            };

            // Load PNG with transparency preserved
            const loadPngImage = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    img.onerror = reject;
                    img.src = src;
                });
            };

            // Load images
            try {
                [textureImage, emblemImage] = await Promise.all([
                    loadTextureImage('/pv-project/assets/pdf-texture-web.jpg'),
                    loadPngImage('/pv-project/assets/pdf-emblem-web.png')
                ]);
                console.log('Images preloaded successfully');
            } catch (error) {
                console.warn('Could not preload images:', error);
            }

            // Load fonts
            try {
                const [ledger, stoke, laBelleAurore, crimsonPro, crimsonProItalic] = await Promise.all([
                    loadFont(FONT_URLS.ledger),
                    loadFont(FONT_URLS.stoke),
                    loadFont(FONT_URLS.laBelleAurore),
                    loadFont(FONT_URLS.crimsonPro),
                    loadFont(FONT_URLS.crimsonProItalic)
                ]);

                fontData.ledger = ledger;
                fontData.stoke = stoke;
                fontData.laBelleAurore = laBelleAurore;
                fontData.crimsonPro = crimsonPro;
                fontData.crimsonProItalic = crimsonProItalic;

                fontsLoaded = !!(ledger && stoke && laBelleAurore && crimsonPro);
                console.log('Fonts preloaded:', fontsLoaded ? 'all loaded' : 'some failed');
            } catch (error) {
                console.warn('Could not preload fonts:', error);
            }
        }

        // ── Eorzean Calendar Conversion ──────────────────────────────────

        const EORZEAN_MOONS = [
            { name: "First Astral Moon", deity: "Halone", element: "Ice" },
            { name: "First Umbral Moon", deity: "Menphina", element: "Ice" },
            { name: "Second Astral Moon", deity: "Thaliak", element: "Water" },
            { name: "Second Umbral Moon", deity: "Nymeia", element: "Water" },
            { name: "Third Astral Moon", deity: "Llymlaen", element: "Wind" },
            { name: "Third Umbral Moon", deity: "Oschon", element: "Wind" },
            { name: "Fourth Astral Moon", deity: "Byregot", element: "Lightning" },
            { name: "Fourth Umbral Moon", deity: "Rhalgr", element: "Lightning" },
            { name: "Fifth Astral Moon", deity: "Azeyma", element: "Fire" },
            { name: "Fifth Umbral Moon", deity: "Nald'thal", element: "Fire" },
            { name: "Sixth Astral Moon", deity: "Nophica", element: "Earth" },
            { name: "Sixth Umbral Moon", deity: "Althyk", element: "Earth" },
        ];

        // Real-world days within each month that map to TWO Eorzean days (Before Noon / After Noon)
        const SPLIT_DAYS = {
            1: [28],        // January (31 days)
            2: [7, 14, 21], // February (28-29 days)
            3: [28],        // March (31 days)
            4: [7, 28],     // April (30 days)
            5: [29],        // May (31 days)
            6: [7, 28],     // June (30 days)
            7: [28],        // July (31 days)
            8: [28],        // August (31 days)
            9: [7, 28],     // September (30 days)
            10: [28],       // October (31 days)
            11: [7, 28],    // November (30 days)
            12: [28],       // December (31 days)
        };

        const EORZEAN_WEEKDAYS = [
            "Iceday", "Watersday", "Windsday", "Lightningday",
            "Firesday", "Earthsday", "Lightsday", "Darksday"
        ];

        const MOON_PHASES = [
            "New Moon", "Waxing Crescent", "Waxing Half Moon", "Waxing Gibbous",
            "Full Moon", "Waning Gibbous", "Waning Half Moon", "Waning Crescent"
        ];

        function getOrdinalSuffix(n) {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        }

        // Convert a real-world date string (YYYY-MM-DD) to Eorzean calendar info
        function convertToEorzeanDate(dateString) {
            if (!dateString) return null;

            const parts = dateString.split('-').map(Number);
            const month = parts[1];
            const day = parts[2];

            if (month < 1 || month > 12 || day < 1) return null;

            const moonInfo = EORZEAN_MOONS[month - 1];
            const splits = SPLIT_DAYS[month];

            let eorzeanDay = day;
            let isSplitDay = false;

            for (const splitDay of splits) {
                if (day > splitDay) {
                    eorzeanDay++;
                } else if (day === splitDay) {
                    isSplitDay = true;
                }
            }

            if (eorzeanDay < 1 || eorzeanDay > 32) return null;

            if (isSplitDay) {
                return {
                    moon: moonInfo.name,
                    deity: moonInfo.deity,
                    element: moonInfo.element,
                    entries: [
                        {
                            day: eorzeanDay,
                            dayOfWeek: EORZEAN_WEEKDAYS[(eorzeanDay - 1) % 8],
                            moonPhase: MOON_PHASES[Math.floor((eorzeanDay - 1) / 4)],
                            time: "Before Noon"
                        },
                        {
                            day: eorzeanDay + 1,
                            dayOfWeek: EORZEAN_WEEKDAYS[eorzeanDay % 8],
                            moonPhase: MOON_PHASES[Math.floor(eorzeanDay / 4)],
                            time: "After Noon"
                        }
                    ]
                };
            } else {
                return {
                    moon: moonInfo.name,
                    deity: moonInfo.deity,
                    element: moonInfo.element,
                    entries: [
                        {
                            day: eorzeanDay,
                            dayOfWeek: EORZEAN_WEEKDAYS[(eorzeanDay - 1) % 8],
                            moonPhase: MOON_PHASES[Math.floor((eorzeanDay - 1) / 4)],
                            time: null
                        }
                    ]
                };
            }
        }

        // Format Eorzean date string
        function formatEorzeanDate(eorzean) {
            if (!eorzean) return '';
            const e = eorzean.entries[0];
            return `${getOrdinalSuffix(e.day)} Sun of the ${eorzean.moon}`;
        }

        // Update Eorzean date display for a given date input
        function updateEorzeanDisplay(inputId, displayId) {
            const input = document.getElementById(inputId);
            const display = document.getElementById(displayId);
            if (!input || !display) return;

            const eorzean = convertToEorzeanDate(input.value);
            if (eorzean) {
                display.textContent = formatEorzeanDate(eorzean);
                display.style.display = 'block';
            } else {
                display.textContent = '';
                display.style.display = 'none';
            }
        }

        // ── Auto-fill and date listeners ─────────────────────────────────

        // Auto-fill today's date in signature date fields
        function autoFillDates() {
            const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
            const field = document.getElementById('intake-patient-date');
            if (field && !field.value) {
                field.value = today;
            }
            // Update Eorzean displays for any pre-filled dates
            updateEorzeanDisplay('intake-patient-date', 'intake-eorzean-date');
            updateEorzeanDisplay('treatment-admission-date', 'treatment-eorzean-date');
        }

        // Load assets when page is ready
        document.addEventListener('DOMContentLoaded', () => {
            preloadAssets();
            autoFillDates();
            initMarkdownPreviews();

            // Update Eorzean date when date inputs change
            const intakeDateField = document.getElementById('intake-patient-date');
            if (intakeDateField) {
                intakeDateField.addEventListener('change', () => {
                    updateEorzeanDisplay('intake-patient-date', 'intake-eorzean-date');
                });
            }
            const treatmentDateField = document.getElementById('treatment-admission-date');
            if (treatmentDateField) {
                treatmentDateField.addEventListener('change', () => {
                    updateEorzeanDisplay('treatment-admission-date', 'treatment-eorzean-date');
                });
            }
        });

        // Form toggle functionality
        function toggleForm(formType) {
            document.getElementById('btn-intake').classList.toggle('active', formType === 'intake');
            document.getElementById('btn-treatment').classList.toggle('active', formType === 'treatment');
            document.getElementById('form-intake').classList.toggle('active', formType === 'intake');
            document.getElementById('form-treatment').classList.toggle('active', formType === 'treatment');
        }

        // Toggle follow-up conditional fields
        function toggleFollowupFields() {
            const selected = document.querySelector('input[name="followup"]:checked');
            const appointmentField = document.getElementById('followup-appointment-field');
            const frequencyField = document.getElementById('followup-frequency-field');

            // Hide all conditional fields first
            appointmentField.classList.remove('visible');
            frequencyField.classList.remove('visible');

            if (selected) {
                if (selected.value === 'Follow-up') {
                    appointmentField.classList.add('visible');
                } else if (selected.value === 'Ongoing') {
                    frequencyField.classList.add('visible');
                }
            }
        }

        // Toggle discharge conditional fields
        function toggleDischargeFields() {
            const selected = document.querySelector('input[name="discharge"]:checked');
            const restrictionsField = document.getElementById('discharge-restrictions-field');
            const durationField = document.getElementById('discharge-duration-field');

            // Hide all conditional fields first
            restrictionsField.classList.remove('visible');
            durationField.classList.remove('visible');

            if (selected) {
                if (selected.value === 'Light duty') {
                    restrictionsField.classList.add('visible');
                } else if (selected.value === 'Medical leave') {
                    durationField.classList.add('visible');
                }
            }
        }

        // ── Markup Toolbar ──────────────────────────────────────────────

        function insertMarkup(btn, type) {
            const toolbar = btn.closest('.markup-toolbar');
            const textarea = toolbar.parentElement.querySelector('textarea');
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const selectedText = text.substring(start, end);

            let newText, cursorStart, cursorEnd;

            if (type === 'bold' || type === 'italic') {
                const wrapper = type === 'bold' ? '**' : '*';
                const placeholder = type === 'bold' ? 'bold text' : 'italic text';
                const insert = selectedText || placeholder;

                newText = text.substring(0, start) + wrapper + insert + wrapper + text.substring(end);
                cursorStart = start + wrapper.length;
                cursorEnd = cursorStart + insert.length;
            } else {
                // Heading and list operate on whole lines
                const prefix = type === 'heading' ? '## ' : '- ';

                if (selectedText) {
                    // Prefix each selected line
                    const lines = selectedText.split('\n');
                    const prefixed = lines.map(line => {
                        if (type === 'heading' && line.startsWith('## ')) return line;
                        if (type === 'list' && line.startsWith('- ')) return line;
                        return prefix + line;
                    }).join('\n');

                    newText = text.substring(0, start) + prefixed + text.substring(end);
                    cursorStart = start;
                    cursorEnd = start + prefixed.length;
                } else {
                    // No selection: insert prefix + placeholder
                    const placeholder = type === 'heading' ? 'Heading' : 'List item';
                    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
                    const beforeCursor = text.substring(lineStart, start);

                    if (beforeCursor.trim() === '') {
                        // Cursor is at an empty/whitespace-only position on the line
                        newText = text.substring(0, lineStart) + prefix + placeholder + text.substring(start);
                        cursorStart = lineStart + prefix.length;
                        cursorEnd = cursorStart + placeholder.length;
                    } else {
                        // Cursor is mid-line, add on a new line
                        newText = text.substring(0, start) + '\n' + prefix + placeholder + text.substring(end);
                        cursorStart = start + 1 + prefix.length;
                        cursorEnd = cursorStart + placeholder.length;
                    }
                }
            }

            textarea.value = newText;
            textarea.setSelectionRange(cursorStart, cursorEnd);
            textarea.focus();
            textarea.dispatchEvent(new Event('input'));
        }

        // ── Markdown Preview (live rendering in textareas) ─────────────

        // Convert inline markdown to HTML
        function parseInlineMarkdownToHtml(text) {
            text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
            return text;
        }

        // Extract heading from text that may be wrapped in inline formatting (for HTML preview)
        function extractHeadingFromText(text) {
            // Direct heading: ## Text
            const directMatch = text.match(/^(#{1,3})\s+(.+)/);
            if (directMatch) {
                return { level: directMatch[1].length, text: directMatch[2] };
            }
            // Heading wrapped in bold: **## Text** or **## Text
            const boldMatch = text.match(/^\*\*\s*(#{1,3})\s+(.+?)\s*\*?\*?$/);
            if (boldMatch) {
                return { level: boldMatch[1].length, text: boldMatch[2].replace(/\*+$/, '') };
            }
            // Heading wrapped in italic: *## Text* or *## Text
            const italicMatch = text.match(/^\*\s*(#{1,3})\s+(.+?)\s*\*?$/);
            if (italicMatch) {
                return { level: italicMatch[1].length, text: italicMatch[2].replace(/\*+$/, '') };
            }
            return null;
        }

        // Convert full markdown text to HTML for preview
        function markdownToHtml(text) {
            if (!text) return '';
            const lines = text.split('\n');
            let html = '';
            let inList = false;

            for (const line of lines) {
                if (line.trim() === '') {
                    if (inList) { html += '</ul>'; inList = false; }
                    html += '<br>';
                    continue;
                }

                // Check for heading (including wrapped in bold/italic)
                const heading = extractHeadingFromText(line.trim());
                if (heading) {
                    if (inList) { html += '</ul>'; inList = false; }
                    const content = parseInlineMarkdownToHtml(heading.text);
                    html += '<div class="md-heading md-h' + heading.level + '">' + content + '</div>';
                    continue;
                }

                const listMatch = line.match(/^-\s+(.+)/);
                if (listMatch) {
                    // Check if list content is a heading
                    const listHeading = extractHeadingFromText(listMatch[1].trim());
                    if (listHeading) {
                        if (inList) { html += '</ul>'; inList = false; }
                        const content = parseInlineMarkdownToHtml(listHeading.text);
                        html += '<div class="md-heading md-h' + listHeading.level + '">' + content + '</div>';
                        continue;
                    }
                    if (!inList) { html += '<ul>'; inList = true; }
                    const content = parseInlineMarkdownToHtml(listMatch[1]);
                    html += '<li>' + content + '</li>';
                    continue;
                }

                if (inList) { html += '</ul>'; inList = false; }
                const content = parseInlineMarkdownToHtml(line);
                html += '<p>' + content + '</p>';
            }

            if (inList) html += '</ul>';
            return html;
        }

        // Initialize live markdown previews for all textareas with markup toolbars
        function initMarkdownPreviews() {
            const toolbars = document.querySelectorAll('.markup-toolbar');
            toolbars.forEach(toolbar => {
                const textarea = toolbar.parentElement.querySelector('textarea');
                if (!textarea) return;

                const preview = document.createElement('div');
                preview.className = 'markdown-preview';
                textarea.after(preview);

                const updatePreview = () => {
                    if (textarea.value.trim()) {
                        preview.innerHTML = markdownToHtml(textarea.value);
                        preview.style.display = 'block';
                    } else {
                        preview.innerHTML = '';
                        preview.style.display = 'none';
                    }
                };

                textarea.addEventListener('input', updatePreview);
            });
        }

        // Helper function to add spaced uppercase text
        function addSpacedText(doc, text, x, y, charSpace = 1.5, options = {}) {
            doc.setCharSpace(charSpace);
            doc.text(text, x, y, options);
            doc.setCharSpace(0);
        }

        // Helper to wrap text (handles newlines from textarea input)
        function wrapText(doc, text, maxWidth) {
            if (!text) return [];
            const paragraphs = text.split('\n');
            const lines = [];

            paragraphs.forEach(paragraph => {
                if (paragraph.trim() === '') {
                    lines.push('');
                    return;
                }
                const words = paragraph.split(' ');
                let currentLine = '';

                words.forEach(word => {
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    const testWidth = doc.getTextWidth(testLine);
                    if (testWidth > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine = testLine;
                    }
                });
                if (currentLine) {
                    lines.push(currentLine);
                }
            });
            return lines;
        }

        // ── Markdown Parsing & PDF Rendering ────────────────────────────

        // Parse inline markdown (**bold**, *italic*) into styled segments
        function parseInlineMarkdown(text) {
            const segments = [];
            let remaining = text;

            while (remaining.length > 0) {
                // Bold: **...**
                const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
                if (boldMatch) {
                    segments.push({ text: boldMatch[1], style: 'bold' });
                    remaining = remaining.substring(boldMatch[0].length);
                    continue;
                }
                // Italic: *...*
                const italicMatch = remaining.match(/^\*(.+?)\*/);
                if (italicMatch) {
                    segments.push({ text: italicMatch[1], style: 'italic' });
                    remaining = remaining.substring(italicMatch[0].length);
                    continue;
                }
                // Plain text until next * or end
                const plainMatch = remaining.match(/^([^*]+)/);
                if (plainMatch) {
                    segments.push({ text: plainMatch[1], style: 'normal' });
                    remaining = remaining.substring(plainMatch[0].length);
                    continue;
                }
                // Lone * that doesn't match a pattern
                segments.push({ text: remaining[0], style: 'normal' });
                remaining = remaining.substring(1);
            }
            return segments;
        }

        // Set font for a markdown style
        function setMarkdownFont(doc, style) {
            if (style === 'bold') {
                setFont(doc, 'CrimsonPro', 'normal');
            } else if (style === 'italic') {
                if (fontData.crimsonProItalic) {
                    setFont(doc, 'CrimsonPro-Italic', 'normal');
                } else {
                    setFont(doc, 'CrimsonPro', 'normal');
                }
            } else {
                setFont(doc, 'CrimsonPro', 'normal');
            }
        }

        // Render a single paragraph with inline bold/italic, handling word wrap
        function renderInlineLine(doc, text, x, y, maxWidth, pageHeight, margin) {
            const segments = parseInlineMarkdown(text);

            // Build flat word list with styling
            const words = [];
            segments.forEach(seg => {
                const parts = seg.text.split(/\s+/);
                parts.forEach(part => {
                    if (part) {
                        words.push({ text: part, style: seg.style });
                    }
                });
            });

            if (words.length === 0) {
                return y + 6;
            }

            let currentX = x;

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                setMarkdownFont(doc, word.style);

                const wordWidth = doc.getTextWidth(word.text);
                const spaceWidth = doc.getTextWidth(' ');

                // Wrap to next line if needed
                if (currentX > x && currentX + wordWidth > x + maxWidth) {
                    y += 6;
                    y = checkNewPage(doc, y, 7, pageHeight, margin);
                    currentX = x;
                }

                doc.text(word.text, currentX, y);
                if (word.style === 'bold') {
                    doc.text(word.text, currentX + 0.2, y);
                }
                currentX += wordWidth + spaceWidth;
            }

            y += 6;
            setFont(doc, 'CrimsonPro', 'normal');
            return y;
        }

        // Extract heading from text that may be wrapped in inline formatting
        // Returns { level, text } if a heading is found, null otherwise
        function extractHeading(text) {
            // Direct heading: ## Text
            const directMatch = text.match(/^(#{1,3})\s+(.+)/);
            if (directMatch) {
                return { level: directMatch[1].length, text: directMatch[2] };
            }
            // Heading wrapped in bold: **## Text** or **## Text
            const boldHeadingMatch = text.match(/^\*\*\s*(#{1,3})\s+(.+?)\s*\*?\*?$/);
            if (boldHeadingMatch) {
                return { level: boldHeadingMatch[1].length, text: boldHeadingMatch[2].replace(/\*+$/, '') };
            }
            // Heading wrapped in italic: *## Text* or *## Text
            const italicHeadingMatch = text.match(/^\*\s*(#{1,3})\s+(.+?)\s*\*?$/);
            if (italicHeadingMatch) {
                return { level: italicHeadingMatch[1].length, text: italicHeadingMatch[2].replace(/\*+$/, '') };
            }
            return null;
        }

        // Render a heading block in the PDF (uppercase, bold CrimsonPro)
        function renderHeading(doc, heading, x, y, maxWidth, pageHeight, margin, baseFontSize) {
            const headingSize = 11.5 - (heading.level * 0.5);
            y = checkNewPage(doc, y, headingSize + 3, pageHeight, margin);
            doc.setFontSize(headingSize);
            setFont(doc, 'CrimsonPro', 'normal');
            const headingLines = wrapText(doc, heading.text.toUpperCase(), maxWidth);
            headingLines.forEach(line => {
                y = checkNewPage(doc, y, 8, pageHeight, margin);
                doc.text(line, x, y);
                doc.text(line, x + 0.2, y);
                y += 7;
            });
            y += 3;
            doc.setFontSize(baseFontSize);
            setFont(doc, 'CrimsonPro', 'normal');
            return y;
        }

        // Render a full markdown text block (headings, lists, bold, italic)
        function renderMarkdownBlock(doc, text, x, y, maxWidth, pageHeight, margin, baseFontSize) {
            if (!text) return y;
            baseFontSize = baseFontSize || 10;

            const paragraphs = text.split('\n');

            for (const paragraph of paragraphs) {
                // Empty line
                if (paragraph.trim() === '') {
                    y += 4;
                    continue;
                }

                // Check for heading (including when wrapped in bold/italic)
                const heading = extractHeading(paragraph.trim());
                if (heading) {
                    y = renderHeading(doc, heading, x, y, maxWidth, pageHeight, margin, baseFontSize);
                    continue;
                }

                // List item: - Text (rendered as bullet point)
                const listMatch = paragraph.match(/^-\s+(.+)/);
                if (listMatch) {
                    // Check if list content is a heading
                    const listHeading = extractHeading(listMatch[1].trim());
                    if (listHeading) {
                        y = renderHeading(doc, listHeading, x, y, maxWidth, pageHeight, margin, baseFontSize);
                        continue;
                    }
                    y = checkNewPage(doc, y, 7, pageHeight, margin);
                    doc.setFontSize(baseFontSize);
                    setFont(doc, 'CrimsonPro', 'normal');
                    doc.setFillColor(44, 24, 16);
                    doc.circle(x + 2, y - 1.2, 0.7, 'F');
                    y = renderInlineLine(doc, listMatch[1], x + 7, y, maxWidth - 7, pageHeight, margin);
                    continue;
                }

                // Regular paragraph with inline formatting
                doc.setFontSize(baseFontSize);
                y = renderInlineLine(doc, paragraph, x, y, maxWidth, pageHeight, margin);
            }

            return y;
        }

        // Check if we need a new page
        function checkNewPage(doc, yPosition, needed, pageHeight, margin) {
            if (yPosition + needed > pageHeight - margin) {
                doc.addPage();
                if (textureImage) {
                    doc.addImage(textureImage, 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), pageHeight);
                }
                return margin + 10;
            }
            return yPosition;
        }

        // Helper to set font with fallback
        function setFont(doc, fontName, style = 'normal') {
            try {
                if (fontsLoaded) {
                    doc.setFont(fontName, style);
                } else {
                    // Fallback to helvetica
                    const fallbackStyle = style === 'normal' ? 'normal' : (fontName === 'LaBelleAurore' ? 'italic' : 'bold');
                    doc.setFont('helvetica', fallbackStyle);
                }
            } catch (e) {
                doc.setFont('helvetica', 'normal');
            }
        }

        // Build Intake PDF document (returns jsPDF doc for reuse)
        function buildIntakePDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Register custom fonts if loaded
            registerFonts(doc);

            // Get form data
            const patientName = document.getElementById('intake-name').value;
            const race = document.getElementById('intake-race').value;
            const age = document.getElementById('intake-age').value;
            const gender = document.getElementById('intake-gender').value;
            const emergencyName = document.getElementById('intake-emergency-name').value;
            const emergencyRelationship = document.getElementById('intake-emergency-relationship').value;
            const emergencyContact = document.getElementById('intake-emergency-contact').value;
            const complaint = document.getElementById('intake-complaint').value;

            // Get checked symptoms
            const symptomsChecked = Array.from(document.querySelectorAll('input[name="symptoms"]:checked'))
                .map(cb => cb.value);
            const symptomsDetail = document.getElementById('intake-symptoms-detail').value;

            // Get checked exposures
            const exposuresChecked = Array.from(document.querySelectorAll('input[name="exposures"]:checked'))
                .map(cb => cb.value);
            const exposuresDetail = document.getElementById('intake-exposures-detail').value;
            const chronicIllness = document.getElementById('intake-chronic').value;
            const previousInjuries = document.getElementById('intake-injuries').value;
            const allergies = document.getElementById('intake-allergies').value;
            const medications = document.getElementById('intake-medications').value;
            const aethericAbnormalities = document.getElementById('intake-aetheric').value;

            // Get signature fields
            const patientSignature = document.getElementById('intake-patient-signature').value;
            const patientDateRaw = document.getElementById('intake-patient-date').value;
            const patientDateEorzean = convertToEorzeanDate(patientDateRaw);
            const patientDate = patientDateEorzean ? formatEorzeanDate(patientDateEorzean) : patientDateRaw;

            // Get OOC fields
            const severityEl = document.querySelector('input[name="severity"]:checked');
            const severity = severityEl ? severityEl.parentElement.textContent.trim() : '';
            const rpTimelineEl = document.querySelector('input[name="rpTimeline"]:checked');
            const rpTimeline = rpTimelineEl ? rpTimelineEl.parentElement.textContent.trim() : '';
            const conceptDevEl = document.querySelector('input[name="conceptDev"]:checked');
            const conceptDev = conceptDevEl ? conceptDevEl.parentElement.textContent.trim() : '';
            const desiredOutcomes = document.getElementById('intake-desired-outcomes').value;
            const plotHooks = document.getElementById('intake-plot-hooks').value;
            const triggers = document.getElementById('intake-triggers').value;

            // PDF dimensions
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 25;
            const contentWidth = pageWidth - (margin * 2);
            let y = margin;

            // Add background texture
            if (textureImage) {
                doc.addImage(textureImage, 'JPEG', 0, 0, pageWidth, pageHeight);
            }

            // Header - PATIENT INTAKE FORM (spaced, uppercase) - using Stoke font
            doc.setFontSize(20);
            doc.setTextColor(44, 24, 16);
            setFont(doc, 'Stoke', 'normal');
            addSpacedText(doc, 'PATIENT INTAKE FORM', margin, y);
            y += 15;

            // Patient Name in cursive style - using La Belle Aurore
            doc.setFontSize(26);
            doc.setTextColor(44, 24, 16);
            setFont(doc, 'LaBelleAurore', 'normal');
            doc.text(patientName || '_______________', margin, y);
            y += 5;

            // NAME label - using Stoke
            doc.setFontSize(8);
            setFont(doc, 'Stoke', 'normal');
            doc.setTextColor(44, 24, 16);
            addSpacedText(doc, 'NAME', margin, y);
            y += 8;

            // Race, Gender, Age on one line - using CrimsonPro
            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');
            const infoLine = [race, gender, age].filter(Boolean).join(', ');
            doc.text(infoLine || '_______________', margin, y);
            y += 15;

            // Emergency Contact Section
            if (emergencyName || emergencyRelationship || emergencyContact) {
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                doc.setTextColor(44, 24, 16);
                addSpacedText(doc, 'EMERGENCY CONTACT', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                if (emergencyName) {
                    doc.text(`Name: ${emergencyName}`, margin, y);
                    y += 5;
                }
                if (emergencyRelationship) {
                    doc.text(`Relationship: ${emergencyRelationship}`, margin, y);
                    y += 5;
                }
                if (emergencyContact) {
                    doc.text(`Contact: ${emergencyContact}`, margin, y);
                    y += 5;
                }
                y += 8;
            }

            // Presenting Complaint Section
            doc.setFontSize(12);
            setFont(doc, 'Stoke', 'normal');
            addSpacedText(doc, 'PRESENTING COMPLAINT', margin, y);
            y += 8;

            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');

            if (complaint) {
                y = renderMarkdownBlock(doc, complaint, margin, y, contentWidth, pageHeight, margin);
            }
            y += 5;

            // Current Symptoms
            if (symptomsChecked.length > 0 || symptomsDetail) {
                const symptomText = symptomsChecked.join(', ') + (symptomsDetail ? ` - ${symptomsDetail}` : '');
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                setFont(doc, 'Stoke', 'normal');
                doc.text('Current Symptoms:', margin, y);
                y += 5;

                setFont(doc, 'CrimsonPro', 'normal');
                const symptomLines = wrapText(doc, symptomText, contentWidth);
                symptomLines.forEach(line => {
                    y = checkNewPage(doc, y, 6, pageHeight, margin);
                    doc.text(line, margin, y);
                    y += 5;
                });
                y += 2;
            }

            // Recent Exposures
            if (exposuresChecked.length > 0 || exposuresDetail) {
                const exposureText = exposuresChecked.join(', ') + (exposuresDetail ? ` - ${exposuresDetail}` : '');
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                setFont(doc, 'Stoke', 'normal');
                doc.text('Recent Exposures:', margin, y);
                y += 5;

                setFont(doc, 'CrimsonPro', 'normal');
                const exposureLines = wrapText(doc, exposureText, contentWidth);
                exposureLines.forEach(line => {
                    y = checkNewPage(doc, y, 6, pageHeight, margin);
                    doc.text(line, margin, y);
                    y += 5;
                });
                y += 5;
            }

            // Pre-Existing Conditions Section
            y = checkNewPage(doc, y, 40, pageHeight, margin);
            doc.setFontSize(12);
            setFont(doc, 'Stoke', 'normal');
            addSpacedText(doc, 'PRE-EXISTING CONDITIONS', margin, y);
            y += 8;

            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');

            const conditions = [
                { label: 'Chronic Illness', value: chronicIllness },
                { label: 'Previous Injuries', value: previousInjuries },
                { label: 'Known Allergies', value: allergies },
                { label: 'Current Medications', value: medications },
                { label: 'Aetheric Abnormalities', value: aethericAbnormalities }
            ];

            conditions.forEach(cond => {
                if (cond.value) {
                    y = checkNewPage(doc, y, 12, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text(`${cond.label}:`, margin, y);
                    y += 5;

                    setFont(doc, 'CrimsonPro', 'normal');
                    const valueLines = wrapText(doc, cond.value, contentWidth);
                    valueLines.forEach(line => {
                        y = checkNewPage(doc, y, 6, pageHeight, margin);
                        doc.text(line, margin, y);
                        y += 5;
                    });
                }
            });
            y += 10;

            // Authorization Section
            y = checkNewPage(doc, y, 60, pageHeight, margin);
            doc.setFontSize(12);
            setFont(doc, 'Stoke', 'normal');
            addSpacedText(doc, 'AUTHORIZATION FOR TREATMENT', margin, y);
            y += 8;

            doc.setFontSize(9);
            setFont(doc, 'CrimsonPro', 'normal');
            const authText = 'I authorize the Phoenix Vanguard medical staff to provide necessary medical treatment, including but not limited to: examination, diagnostic procedures, medication administration, surgical intervention, and aetheric healing. I understand that I may refuse specific treatments and that I will be informed of procedures when practical.';
            const authLines = wrapText(doc, authText, contentWidth);
            authLines.forEach(line => {
                y = checkNewPage(doc, y, 5, pageHeight, margin);
                doc.text(line, margin, y);
                y += 4;
            });
            y += 8;

            // Signature line
            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');
            doc.text('Patient or Witness Signature: ', margin, y);

            // Add signature in La Belle Aurore font
            const sigLabelWidth = doc.getTextWidth('Patient or Witness Signature: ');
            if (patientSignature) {
                doc.setFontSize(14);
                setFont(doc, 'LaBelleAurore', 'normal');
                doc.text(patientSignature, margin + sigLabelWidth, y);
            } else {
                doc.text('_________________________', margin + sigLabelWidth, y);
            }

            // Add date on new line
            y += 7;
            y = checkNewPage(doc, y, 10, pageHeight, margin);
            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');
            doc.text('Date: ', margin, y);
            doc.text(patientDate || '____________', margin + doc.getTextWidth('Date: '), y);
            y += 15;

            // Out of Character Information Section (only if any OOC field is filled)
            const hasOOCInfo = severity || rpTimeline || conceptDev || desiredOutcomes || plotHooks || triggers;
            if (hasOOCInfo) {
                y = checkNewPage(doc, y, 50, pageHeight, margin);
                doc.setFontSize(14);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'OUT OF CHARACTER INFORMATION', margin, y);
                y += 10;

                doc.setFontSize(10);

                if (severity) {
                    y = checkNewPage(doc, y, 12, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('Severity Assessment:', margin, y);
                    y += 5;
                    setFont(doc, 'CrimsonPro', 'normal');
                    const severityLines = wrapText(doc, severity, contentWidth);
                    severityLines.forEach(line => {
                        y = checkNewPage(doc, y, 5, pageHeight, margin);
                        doc.text(line, margin, y);
                        y += 4;
                    });
                    y += 3;
                }

                if (rpTimeline) {
                    y = checkNewPage(doc, y, 12, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('RP Goals and Timeline:', margin, y);
                    y += 5;
                    setFont(doc, 'CrimsonPro', 'normal');
                    const timelineLines = wrapText(doc, rpTimeline, contentWidth);
                    timelineLines.forEach(line => {
                        y = checkNewPage(doc, y, 5, pageHeight, margin);
                        doc.text(line, margin, y);
                        y += 4;
                    });
                    y += 3;
                }

                if (conceptDev) {
                    y = checkNewPage(doc, y, 12, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('Conceptual Development:', margin, y);
                    y += 5;
                    setFont(doc, 'CrimsonPro', 'normal');
                    const conceptLines = wrapText(doc, conceptDev, contentWidth);
                    conceptLines.forEach(line => {
                        y = checkNewPage(doc, y, 5, pageHeight, margin);
                        doc.text(line, margin, y);
                        y += 4;
                    });
                    y += 3;
                }

                if (desiredOutcomes) {
                    y = checkNewPage(doc, y, 15, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('Desired Outcomes:', margin, y);
                    y += 5;
                    doc.setFontSize(10);
                    setFont(doc, 'CrimsonPro', 'normal');
                    y = renderMarkdownBlock(doc, desiredOutcomes, margin, y, contentWidth, pageHeight, margin);
                    y += 2;
                }

                if (plotHooks) {
                    y = checkNewPage(doc, y, 15, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('Plot Hooks/Story Elements:', margin, y);
                    y += 5;
                    doc.setFontSize(10);
                    setFont(doc, 'CrimsonPro', 'normal');
                    y = renderMarkdownBlock(doc, plotHooks, margin, y, contentWidth, pageHeight, margin);
                    y += 2;
                }

                if (triggers) {
                    y = checkNewPage(doc, y, 12, pageHeight, margin);
                    setFont(doc, 'Stoke', 'normal');
                    doc.text('Triggers to Avoid:', margin, y);
                    y += 5;
                    setFont(doc, 'CrimsonPro', 'normal');
                    const triggerLines = wrapText(doc, triggers, contentWidth);
                    triggerLines.forEach(line => {
                        y = checkNewPage(doc, y, 6, pageHeight, margin);
                        doc.text(line, margin, y);
                        y += 5;
                    });
                }
            }

            // Add emblem in bottom right corner (smaller and further into margin)
            if (emblemImage) {
                const emblemSize = 35;
                doc.addImage(emblemImage, 'PNG', pageWidth - margin/2 - emblemSize, pageHeight - margin/2 - emblemSize, emblemSize, emblemSize);
            }

            return doc;
        }

        // Generate Intake PDF (save to file)
        function generateIntakePDF(event) {
            event.preventDefault();
            const doc = buildIntakePDF();
            doc.save('patient-intake-form.pdf');
        }

        // Build Treatment PDF document (returns jsPDF doc for reuse)
        function buildTreatmentPDF() {

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Register custom fonts if loaded
            registerFonts(doc);

            // Get form data
            const patientName = document.getElementById('treatment-name').value;
            const position = document.getElementById('treatment-position').value;
            const admissionDateRaw = document.getElementById('treatment-admission-date').value;
            const admissionDateEorzean = convertToEorzeanDate(admissionDateRaw);
            const admissionDate = admissionDateEorzean ? formatEorzeanDate(admissionDateEorzean) : admissionDateRaw;
            const medicName = document.getElementById('treatment-medic-name').value;
            const medicSpecialty = document.getElementById('treatment-medic-specialty').value;
            const clinicalSummary = document.getElementById('treatment-clinical-summary').value;
            const diagnosis = document.getElementById('treatment-diagnosis').value;
            const proceduresChecked = Array.from(document.querySelectorAll('input[name="procedures"]:checked'))
                .map(cb => cb.value);
            const treatmentPlan = document.getElementById('treatment-plan').value;

            // Follow-up fields
            const followupEl = document.querySelector('input[name="followup"]:checked');
            const followup = followupEl ? followupEl.value : '';
            const followupAppointment = document.getElementById('treatment-followup-appointment').value;
            const followupFrequency = document.getElementById('treatment-followup-frequency').value;

            // Discharge fields
            const dischargeEl = document.querySelector('input[name="discharge"]:checked');
            const discharge = dischargeEl ? dischargeEl.value : '';
            const restrictions = document.getElementById('treatment-restrictions').value;
            const leaveDuration = document.getElementById('treatment-leave-duration').value;

            const additionalNotes = document.getElementById('treatment-notes').value;

            // PDF dimensions
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 25;
            const contentWidth = pageWidth - (margin * 2);
            let y = margin;

            // Add background texture
            if (textureImage) {
                doc.addImage(textureImage, 'JPEG', 0, 0, pageWidth, pageHeight);
            }

            // Header - TREATMENT REPORT (spaced, uppercase) - using Stoke font
            doc.setFontSize(20);
            doc.setTextColor(44, 24, 16);
            setFont(doc, 'Stoke', 'normal');
            addSpacedText(doc, 'TREATMENT REPORT', margin, y);
            y += 15;

            // Patient Name in cursive style - using La Belle Aurore
            doc.setFontSize(26);
            doc.setTextColor(44, 24, 16);
            setFont(doc, 'LaBelleAurore', 'normal');
            doc.text(patientName || '_______________', margin, y);
            y += 5;

            // NAME label - using Stoke
            doc.setFontSize(8);
            setFont(doc, 'Stoke', 'normal');
            doc.setTextColor(44, 24, 16);
            addSpacedText(doc, 'NAME', margin, y);
            y += 12;

            // Patient Info lines
            doc.setFontSize(10);
            setFont(doc, 'CrimsonPro', 'normal');
            if (position) {
                doc.text(`Position: ${position}`, margin, y);
                y += 5;
            }
            if (admissionDate) {
                doc.text(`Admitted: ${admissionDate}`, margin, y);
                y += 12;
            }

            // Clinical Summary (only if filled)
            if (clinicalSummary) {
                y = checkNewPage(doc, y, 20, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'CLINICAL SUMMARY', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, clinicalSummary, margin, y, contentWidth, pageHeight, margin);
                y += 5;
            }

            // Diagnosis (only if filled)
            if (diagnosis) {
                y = checkNewPage(doc, y, 20, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'DIAGNOSIS', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, diagnosis, margin, y, contentWidth, pageHeight, margin);
                y += 5;
            }

            // Procedures Performed (only if any checked)
            if (proceduresChecked.length > 0) {
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'PROCEDURES PERFORMED', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                doc.text(proceduresChecked.join(', '), margin, y);
                y += 15;
            }

            // Treatment Plan (only if filled)
            if (treatmentPlan) {
                y = checkNewPage(doc, y, 20, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'TREATMENT PLAN', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, treatmentPlan, margin, y, contentWidth, pageHeight, margin);
                y += 5;
            }

            // Follow-up Requirements (only if selected)
            if (followup) {
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'FOLLOW-UP REQUIREMENTS', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                let followupText = '';
                if (followup === 'None') {
                    followupText = 'No follow-up required - Patient cleared for discharge';
                } else if (followup === 'Follow-up') {
                    followupText = 'Follow-up required' + (followupAppointment ? ` - Next appointment: ${followupAppointment}` : '');
                } else if (followup === 'Ongoing') {
                    followupText = 'Ongoing monitoring required' + (followupFrequency ? ` - Frequency: ${followupFrequency}` : '');
                } else if (followup === 'Referred') {
                    followupText = 'Referred to specialist/external care';
                }
                doc.text(followupText, margin, y);
                y += 15;
            }

            // Discharge Status (only if selected)
            if (discharge) {
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'DISCHARGE STATUS', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                let dischargeText = '';
                if (discharge === 'Full duty') {
                    dischargeText = 'Discharged - Full duty cleared';
                } else if (discharge === 'Light duty') {
                    dischargeText = 'Discharged - Light duty only' + (restrictions ? ` (Restrictions: ${restrictions})` : '');
                } else if (discharge === 'Medical leave') {
                    dischargeText = 'Discharged - Medical leave recommended' + (leaveDuration ? ` (Duration: ${leaveDuration})` : '');
                } else if (discharge === 'Admitted') {
                    dischargeText = 'Admitted for continued observation/treatment';
                } else if (discharge === 'Transferred') {
                    dischargeText = 'Transferred to external facility';
                }
                const dischargeLines = wrapText(doc, dischargeText, contentWidth);
                dischargeLines.forEach(line => {
                    y = checkNewPage(doc, y, 6, pageHeight, margin);
                    doc.text(line, margin, y);
                    y += 5;
                });
                y += 10;
            }

            // Additional Notes (only if filled)
            if (additionalNotes) {
                y = checkNewPage(doc, y, 20, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'ADDITIONAL NOTES', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, additionalNotes, margin, y, contentWidth, pageHeight, margin);
            }

            // Footer: Medic signature in bottom left, emblem in bottom right
            if (medicName || medicSpecialty) {
                const footerY = pageHeight - margin / 2 - 15;

                // Medic name in cursive (large signature)
                doc.setFontSize(24);
                setFont(doc, 'LaBelleAurore', 'normal');
                doc.text(medicName || '', margin, footerY);

                // Label line below
                const labelParts = [];
                if (medicName) labelParts.push(medicName.toUpperCase());
                if (medicSpecialty) labelParts.push(medicSpecialty.toUpperCase());
                doc.setFontSize(7);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, labelParts.join(', '), margin, footerY + 7);
            }

            if (emblemImage) {
                const emblemSize = 35;
                doc.addImage(emblemImage, 'PNG', pageWidth - margin/2 - emblemSize, pageHeight - margin/2 - emblemSize, emblemSize, emblemSize);
            }

            return doc;
        }

        // Generate Treatment PDF (save to file)
        function generateTreatmentPDF(event) {
            event.preventDefault();
            const doc = buildTreatmentPDF();
            doc.save('treatment-report.pdf');
        }

        // =============================================
        // Export as JPG (PDF-to-image via pdf.js)
        // =============================================

        // Initialize pdf.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        async function exportPDFAsJPG(buildFn, filename, btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Rendering...';
            btn.disabled = true;

            try {
                const doc = buildFn();
                const pdfData = doc.output('arraybuffer');

                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                const scale = 2; // 2x resolution for crisp output

                const canvases = [];
                let totalHeight = 0;
                let maxWidth = 0;

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale });

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');

                    await page.render({ canvasContext: ctx, viewport }).promise;

                    canvases.push(canvas);
                    totalHeight += viewport.height;
                    maxWidth = Math.max(maxWidth, viewport.width);
                }

                // Download each page as a separate JPG (sequentially to avoid browser dropping downloads)
                const baseName = filename.replace('.jpg', '');
                for (let i = 0; i < canvases.length; i++) {
                    const blob = await new Promise(resolve => canvases[i].toBlob(resolve, 'image/jpeg', 0.95));
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = canvases.length === 1
                        ? filename
                        : `${baseName}-page-${i + 1}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    if (i < canvases.length - 1) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                btn.innerHTML = '<span class="material-icons">check</span> Done!';
                setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
            } catch (error) {
                console.error('JPG export failed:', error);
                btn.innerHTML = '<span class="material-icons">error</span> Failed';
                setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
            }
        }

        function exportIntakeJPG(btn) {
            exportPDFAsJPG(buildIntakePDF, 'patient-intake-form.jpg', btn);
        }

        function exportTreatmentJPG(btn) {
            exportPDFAsJPG(buildTreatmentPDF, 'treatment-report.jpg', btn);
        }

        // =============================================
        // Copy for Discord (formatted markdown)
        // =============================================

        function buildIntakeDiscordText() {
            const lines = [];

            const patientName = document.getElementById('intake-name').value;
            const race = document.getElementById('intake-race').value;
            const age = document.getElementById('intake-age').value;
            const gender = document.getElementById('intake-gender').value;
            const emergencyName = document.getElementById('intake-emergency-name').value;
            const emergencyRelationship = document.getElementById('intake-emergency-relationship').value;
            const emergencyContact = document.getElementById('intake-emergency-contact').value;
            const complaint = document.getElementById('intake-complaint').value;
            const symptomsChecked = Array.from(document.querySelectorAll('input[name="symptoms"]:checked')).map(cb => cb.value);
            const symptomsDetail = document.getElementById('intake-symptoms-detail').value;
            const exposuresChecked = Array.from(document.querySelectorAll('input[name="exposures"]:checked')).map(cb => cb.value);
            const exposuresDetail = document.getElementById('intake-exposures-detail').value;
            const chronicIllness = document.getElementById('intake-chronic').value;
            const previousInjuries = document.getElementById('intake-injuries').value;
            const allergies = document.getElementById('intake-allergies').value;
            const medications = document.getElementById('intake-medications').value;
            const aethericAbnormalities = document.getElementById('intake-aetheric').value;
            const patientSignature = document.getElementById('intake-patient-signature').value;
            const patientDateRaw = document.getElementById('intake-patient-date').value;
            const patientDateEorzean = convertToEorzeanDate(patientDateRaw);
            const patientDate = patientDateEorzean ? formatEorzeanDate(patientDateEorzean) : patientDateRaw;
            const severityEl = document.querySelector('input[name="severity"]:checked');
            const severity = severityEl ? severityEl.parentElement.textContent.trim() : '';
            const rpTimelineEl = document.querySelector('input[name="rpTimeline"]:checked');
            const rpTimeline = rpTimelineEl ? rpTimelineEl.parentElement.textContent.trim() : '';
            const conceptDevEl = document.querySelector('input[name="conceptDev"]:checked');
            const conceptDev = conceptDevEl ? conceptDevEl.parentElement.textContent.trim() : '';
            const desiredOutcomes = document.getElementById('intake-desired-outcomes').value;
            const plotHooks = document.getElementById('intake-plot-hooks').value;
            const triggers = document.getElementById('intake-triggers').value;

            // Header
            lines.push('# PHOENIX VANGUARD — PATIENT INTAKE FORM');
            lines.push('');

            // Patient Info
            lines.push(`**Patient Name:** ${patientName || '—'}`);
            const infoParts = [];
            if (race) infoParts.push(`**Race:** ${race}`);
            if (gender) infoParts.push(`**Gender:** ${gender}`);
            if (age) infoParts.push(`**Age:** ${age}`);
            if (infoParts.length > 0) lines.push(infoParts.join(' | '));
            lines.push('');

            // Emergency Contact
            if (emergencyName || emergencyRelationship || emergencyContact) {
                lines.push('## Emergency Contact');
                if (emergencyName) lines.push(`**Name:** ${emergencyName}`);
                if (emergencyRelationship) lines.push(`**Relationship:** ${emergencyRelationship}`);
                if (emergencyContact) lines.push(`**Contact Method:** ${emergencyContact}`);
                lines.push('');
            }

            // Reason for Visit
            lines.push('## Reason for Visit');
            if (complaint) {
                lines.push(`**Presenting Complaint/Injury:**`);
                lines.push(complaint);
                lines.push('');
            }
            if (symptomsChecked.length > 0 || symptomsDetail) {
                lines.push(`**Current Symptoms:** ${symptomsChecked.join(', ') || '—'}`);
                if (symptomsDetail) lines.push(`> ${symptomsDetail}`);
            }
            if (exposuresChecked.length > 0 || exposuresDetail) {
                lines.push(`**Recent Exposures:** ${exposuresChecked.join(', ') || '—'}`);
                if (exposuresDetail) lines.push(`> ${exposuresDetail}`);
            }
            lines.push('');

            // Pre-Existing Conditions
            const hasConditions = chronicIllness || previousInjuries || allergies || medications || aethericAbnormalities;
            if (hasConditions) {
                lines.push('## Pre-Existing Conditions');
                if (chronicIllness) lines.push(`**Chronic Illness:** ${chronicIllness}`);
                if (previousInjuries) lines.push(`**Previous Injuries:** ${previousInjuries}`);
                if (allergies) lines.push(`**Known Allergies:** ${allergies}`);
                if (medications) lines.push(`**Current Medications:** ${medications}`);
                if (aethericAbnormalities) lines.push(`**Aetheric Abnormalities:** ${aethericAbnormalities}`);
                lines.push('');
            }

            // Authorization
            lines.push('## Authorization for Treatment');
            lines.push('*I authorize the Phoenix Vanguard medical staff to provide necessary medical treatment, including but not limited to: examination, diagnostic procedures, medication administration, surgical intervention, and aetheric healing.*');
            const sigParts = [];
            if (patientSignature) sigParts.push(`**Signature:** *${patientSignature}*`);
            if (patientDate) sigParts.push(`**Date:** ${patientDate}`);
            if (sigParts.length > 0) lines.push(sigParts.join(' | '));
            lines.push('');

            // OOC Section
            const hasOOC = severity || rpTimeline || conceptDev || desiredOutcomes || plotHooks || triggers;
            if (hasOOC) {
                lines.push('---');
                lines.push('# OUT OF CHARACTER INFORMATION');
                lines.push('');
                if (severity) lines.push(`**Severity Assessment:** ${severity}`);
                if (rpTimeline) lines.push(`**RP Goals and Timeline:** ${rpTimeline}`);
                if (conceptDev) lines.push(`**Conceptual Development:** ${conceptDev}`);
                if (desiredOutcomes) {
                    lines.push(`**Desired Outcomes:**`);
                    lines.push(desiredOutcomes);
                }
                if (plotHooks) {
                    lines.push(`**Plot Hooks/Story Elements:**`);
                    lines.push(plotHooks);
                }
                if (triggers) lines.push(`**Triggers to Avoid:** ${triggers}`);
            }

            return lines.join('\n');
        }

        function buildTreatmentDiscordText() {
            const lines = [];

            const patientName = document.getElementById('treatment-name').value;
            const position = document.getElementById('treatment-position').value;
            const admissionDateRaw = document.getElementById('treatment-admission-date').value;
            const admissionDateEorzean = convertToEorzeanDate(admissionDateRaw);
            const admissionDate = admissionDateEorzean ? formatEorzeanDate(admissionDateEorzean) : admissionDateRaw;
            const medicName = document.getElementById('treatment-medic-name').value;
            const medicSpecialty = document.getElementById('treatment-medic-specialty').value;
            const clinicalSummary = document.getElementById('treatment-clinical-summary').value;
            const diagnosis = document.getElementById('treatment-diagnosis').value;
            const proceduresChecked = Array.from(document.querySelectorAll('input[name="procedures"]:checked')).map(cb => cb.value);
            const treatmentPlan = document.getElementById('treatment-plan').value;
            const followupEl = document.querySelector('input[name="followup"]:checked');
            const followup = followupEl ? followupEl.value : '';
            const followupAppointment = document.getElementById('treatment-followup-appointment').value;
            const followupFrequency = document.getElementById('treatment-followup-frequency').value;
            const dischargeEl = document.querySelector('input[name="discharge"]:checked');
            const discharge = dischargeEl ? dischargeEl.value : '';
            const restrictions = document.getElementById('treatment-restrictions').value;
            const leaveDuration = document.getElementById('treatment-leave-duration').value;
            const additionalNotes = document.getElementById('treatment-notes').value;

            // Header
            lines.push('# PHOENIX VANGUARD — TREATMENT REPORT');
            lines.push('');

            // Patient Info
            lines.push(`**Patient Name:** ${patientName || '—'}`);
            const infoParts = [];
            if (position) infoParts.push(`**Position:** ${position}`);
            if (admissionDate) infoParts.push(`**Date of Admission:** ${admissionDate}`);
            if (infoParts.length > 0) lines.push(infoParts.join(' | '));
            lines.push('');

            // Medic Info
            if (medicName || medicSpecialty) {
                lines.push('## Attending Medic');
                const medicParts = [];
                if (medicName) medicParts.push(`**Name:** ${medicName}`);
                if (medicSpecialty) medicParts.push(`**Specialty:** ${medicSpecialty}`);
                lines.push(medicParts.join(' | '));
                lines.push('');
            }

            // Clinical Summary
            if (clinicalSummary) {
                lines.push('## Clinical Summary');
                lines.push(clinicalSummary);
                lines.push('');
            }

            // Diagnosis
            if (diagnosis) {
                lines.push('## Diagnosis');
                lines.push(diagnosis);
                lines.push('');
            }

            // Procedures
            if (proceduresChecked.length > 0) {
                lines.push(`**Procedures Performed:** ${proceduresChecked.join(', ')}`);
                lines.push('');
            }

            // Treatment Plan
            if (treatmentPlan) {
                lines.push('## Treatment Plan');
                lines.push(treatmentPlan);
                lines.push('');
            }

            // Follow-up
            if (followup) {
                lines.push('## Follow-up Requirements');
                if (followup === 'None') {
                    lines.push('No follow-up required — Patient cleared for discharge');
                } else if (followup === 'Follow-up') {
                    lines.push('Follow-up required' + (followupAppointment ? ` — Next appointment: ${followupAppointment}` : ''));
                } else if (followup === 'Ongoing') {
                    lines.push('Ongoing monitoring required' + (followupFrequency ? ` — Frequency: ${followupFrequency}` : ''));
                } else if (followup === 'Referred') {
                    lines.push('Referred to specialist/external care');
                }
                lines.push('');
            }

            // Discharge
            if (discharge) {
                lines.push('## Discharge Status');
                if (discharge === 'Full duty') {
                    lines.push('Discharged — Full duty cleared');
                } else if (discharge === 'Light duty') {
                    lines.push('Discharged — Light duty only' + (restrictions ? ` (Restrictions: ${restrictions})` : ''));
                } else if (discharge === 'Medical leave') {
                    lines.push('Discharged — Medical leave recommended' + (leaveDuration ? ` (Duration: ${leaveDuration})` : ''));
                } else if (discharge === 'Admitted') {
                    lines.push('Admitted for continued observation/treatment');
                } else if (discharge === 'Transferred') {
                    lines.push('Transferred to external facility');
                }
                lines.push('');
            }

            // Additional Notes
            if (additionalNotes) {
                lines.push('## Additional Notes');
                lines.push(additionalNotes);
            }

            return lines.join('\n');
        }

        async function copyToClipboard(text, btn) {
            const originalText = btn.innerHTML;
            try {
                await navigator.clipboard.writeText(text);
                btn.classList.add('copied');
                btn.innerHTML = '<span class="material-icons">check</span> Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                console.error('Copy failed:', error);
                btn.innerHTML = '<span class="material-icons">error</span> Failed';
                setTimeout(() => { btn.innerHTML = originalText; }, 2000);
            }
        }

        function copyIntakeDiscord(btn) {
            const text = buildIntakeDiscordText();
            copyToClipboard(text, btn);
        }

        function copyTreatmentDiscord(btn) {
            const text = buildTreatmentDiscordText();
            copyToClipboard(text, btn);
        }
