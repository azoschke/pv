        // ====================================================================
        //  PVMedForms — the medical documents, built from saved records
        //
        //  The Patient Records page (med-database.html) loads this the first
        //  time something is exported: a visit's Patient Intake and Treatment
        //  Report as the parchment PDF, as JPGs (via pdf.js) or as text for
        //  Discord. Needs jsPDF and pdf.js; PVMedical (medical-shared.js) gives
        //  the Out of Character labels. See window.PVMedForms at the end.
        // ====================================================================

        // Image assets for PDF
        let textureImage = null;
        let emblemImage = null;

        // Font data for PDF (will be loaded)
        let fontsLoaded = false;
        let fontData = {
            stoke: null,
            laBelleAurore: null,
            crimsonPro: null,
            crimsonProItalic: null
        };

		// Local font file URLs
		const FONT_URLS = {
		    stoke: 'assets/Stoke-Regular.ttf',
		    laBelleAurore: 'assets/LaBelleAurore-Regular.ttf',
		    crimsonPro: 'assets/CrimsonPro-VariableFont_wght.ttf',
		    crimsonProItalic: 'assets/CrimsonPro-Italic-VariableFont_wght.ttf'
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
                    loadTextureImage('assets/pdf-texture-web.jpg'),
                    loadPngImage('assets/pdf-emblem-web.png')
                ]);
                console.log('Images preloaded successfully');
            } catch (error) {
                console.warn('Could not preload images:', error);
            }

            // Load fonts
            try {
                const [stoke, laBelleAurore, crimsonPro, crimsonProItalic] = await Promise.all([
                    loadFont(FONT_URLS.stoke),
                    loadFont(FONT_URLS.laBelleAurore),
                    loadFont(FONT_URLS.crimsonPro),
                    loadFont(FONT_URLS.crimsonProItalic)
                ]);

                fontData.stoke = stoke;
                fontData.laBelleAurore = laBelleAurore;
                fontData.crimsonPro = crimsonPro;
                fontData.crimsonProItalic = crimsonProItalic;

                fontsLoaded = !!(stoke && laBelleAurore && crimsonPro);
                console.log('Fonts preloaded:', fontsLoaded ? 'all loaded' : 'some failed');
            } catch (error) {
                console.warn('Could not preload fonts:', error);
            }
        }

        // Fonts and images load once, the first time something is exported.
        let assetsReady = null;
        function ready() {
            if (!assetsReady) assetsReady = preloadAssets();
            return assetsReady;
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

        // Build the intake document (a jsPDF doc). data: a saved intake's answers
        // (intakeFromRecord).
        function buildIntakePDF(data) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Register custom fonts if loaded
            registerFonts(doc);

            const {
                patientName, race, age, gender, emergencyName, emergencyRelationship,
                emergencyContact, complaint, symptoms, exposures, chronicIllness, previousInjuries,
                allergies, medications, aethericAbnormalities, patientSignature, patientDate,
                severity, rpTimeline, conceptDev, desiredOutcomes, plotHooks, triggers
            } = data || {};

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
            if (symptoms) {
                const symptomText = symptoms;
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
            if (exposures) {
                const exposureText = exposures;
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

        // Build the treatment report document (a jsPDF doc). data: a visit's
        // treatment report (treatmentFromRecord).
        function buildTreatmentPDF(data) {

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Register custom fonts if loaded
            registerFonts(doc);

            const {
                patientName, position, admissionDate, medicName, clinicalSummary,
                diagnosis, procedures, treatmentPlan, followUp, discharge, additionalNotes
            } = data || {};

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
            if (procedures) {
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'PROCEDURES PERFORMED', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, procedures, margin, y, contentWidth, pageHeight, margin);
                y += 5;
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
            if (followUp) {
                y = checkNewPage(doc, y, 15, pageHeight, margin);
                doc.setFontSize(12);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, 'FOLLOW-UP REQUIREMENTS', margin, y);
                y += 8;

                doc.setFontSize(10);
                setFont(doc, 'CrimsonPro', 'normal');
                y = renderMarkdownBlock(doc, followUp, margin, y, contentWidth, pageHeight, margin);
                y += 5;
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
                y = renderMarkdownBlock(doc, discharge, margin, y, contentWidth, pageHeight, margin);
                y += 5;
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
            if (medicName) {
                const footerY = pageHeight - margin / 2 - 15;

                // Medic name in cursive (large signature)
                doc.setFontSize(24);
                setFont(doc, 'LaBelleAurore', 'normal');
                doc.text(medicName || '', margin, footerY);

                // Label line below
                doc.setFontSize(7);
                setFont(doc, 'Stoke', 'normal');
                addSpacedText(doc, medicName.toUpperCase(), margin, footerY + 7);
            }

            if (emblemImage) {
                const emblemSize = 35;
                doc.addImage(emblemImage, 'PNG', pageWidth - margin/2 - emblemSize, pageHeight - margin/2 - emblemSize, emblemSize, emblemSize);
            }

            return doc;
        }

        // =============================================
        // Export as JPG (PDF-to-image via pdf.js)
        // =============================================

        // Render a built document to JPGs (one per page) and download them.
        async function renderJPGs(doc, filename) {
            if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
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
        }

        // =============================================
        // Copy for Discord (formatted markdown)
        // =============================================

        function buildIntakeDiscordText(data) {
            const lines = [];

            const {
                patientName, race, age, gender, emergencyName, emergencyRelationship,
                emergencyContact, complaint, symptoms, exposures, chronicIllness, previousInjuries,
                allergies, medications, aethericAbnormalities, patientSignature, patientDate,
                severity, rpTimeline, conceptDev, desiredOutcomes, plotHooks, triggers
            } = data || {};

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
            if (symptoms) lines.push(`**Current Symptoms:** ${symptoms}`);
            if (exposures) lines.push(`**Recent Exposures:** ${exposures}`);
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

        function buildTreatmentDiscordText(data) {
            const lines = [];

            const {
                patientName, position, admissionDate, medicName, clinicalSummary,
                diagnosis, procedures, treatmentPlan, followUp, discharge, additionalNotes
            } = data || {};

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
            if (medicName) {
                lines.push('## Attending Medic');
                lines.push(`**Name:** ${medicName}`);
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
            if (procedures) {
                lines.push(`**Procedures Performed:** ${procedures}`);
                lines.push('');
            }

            // Treatment Plan
            if (treatmentPlan) {
                lines.push('## Treatment Plan');
                lines.push(treatmentPlan);
                lines.push('');
            }

            // Follow-up
            if (followUp) {
                lines.push('## Follow-up Requirements');
                lines.push(followUp);
                lines.push('');
            }

            // Discharge
            if (discharge) {
                lines.push('## Discharge Status');
                lines.push(discharge);
                lines.push('');
            }

            // Additional Notes
            if (additionalNotes) {
                lines.push('## Additional Notes');
                lines.push(additionalNotes);
            }

            return lines.join('\n');
        }

        // =============================================
        // Saved records (the patient records page)
        // =============================================

        // A visit's linked intake (GET /patients/:id → visit.intake) as the
        // intake builders' data. The Out of Character choices are stored by
        // value and printed by their full label (PVMedical, medical-shared.js).
        function intakeFromRecord(intake) {
            const M = window.PVMedical;
            const ooc = (field, value) => (M ? M.oocLabel(field, value) : value) || '';
            const r = intake || {};
            return {
                patientName: r.character_name || '',
                race: r.race || '',
                age: r.age || '',
                gender: r.gender || '',
                emergencyName: r.emergency_contact_name || '',
                emergencyRelationship: r.emergency_contact_relationship || '',
                emergencyContact: r.emergency_contact_method || '',
                complaint: r.presenting_complaint || '',
                symptoms: r.current_symptoms || '',
                exposures: r.recent_exposures || '',
                chronicIllness: r.chronic_illness || '',
                previousInjuries: r.previous_injuries || '',
                allergies: r.known_allergies || '',
                medications: r.current_medications || '',
                aethericAbnormalities: r.aetheric_abnormalities || '',
                patientSignature: r.patient_signature || '',
                patientDate: r.signed_ic_date || '',
                severity: ooc('severity', r.severity),
                rpTimeline: ooc('rp_timeline', r.rp_timeline),
                conceptDev: ooc('concept_dev', r.concept_dev),
                desiredOutcomes: r.desired_outcomes || '',
                plotHooks: r.plot_hooks || '',
                triggers: r.triggers || ''
            };
        }

        // A saved visit as the treatment report builders' data. position: the
        // patient's Vanguard position (a linked member's IC rank).
        function treatmentFromRecord(visit, patientName, position) {
            const v = visit || {};
            return {
                patientName: patientName || v.patient_name || '',
                position: position || '',
                admissionDate: v.visit_date || '',
                medicName: v.attending_medic || '',
                clinicalSummary: v.clinical_summary || '',
                diagnosis: v.diagnosis || '',
                procedures: v.procedures_performed || '',
                treatmentPlan: v.treatment_plan || '',
                followUp: v.follow_up || '',
                discharge: v.discharge_status || '',
                additionalNotes: v.additional_notes || ''
            };
        }

        window.PVMedForms = {
            ready: ready,
            intakeFromRecord: intakeFromRecord,
            treatmentFromRecord: treatmentFromRecord,
            buildIntakePDF: buildIntakePDF,
            buildTreatmentPDF: buildTreatmentPDF,
            buildIntakeDiscordText: buildIntakeDiscordText,
            buildTreatmentDiscordText: buildTreatmentDiscordText,
            savePDF: (doc, filename) => doc.save(filename),
            saveJPG: renderJPGs,
            copyText: text => navigator.clipboard.writeText(text)
        };
