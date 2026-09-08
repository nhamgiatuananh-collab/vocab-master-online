// ==========================================================================
// VocabMaster v2 - Layered Workspace Architecture
// Three.js Animated Background + Glassmorphism + Workspace Routing
// Optimized Virtual Batching & Infinite Scroll for 3500+ IELTS Words
// ==========================================================================

class VocabApp {
  constructor() {
    this.words = [];
    this.currentWorkspace = 'dashboard';
    this.currentView = 'grid';
    this.workspaceHistory = [];

    // High-performance virtual batching for 3500+ items
    this.libraryPage = 1;
    this.pageSize = 48;
    this.filteredWords = [];
    this.libraryObserver = null;

    // Audio & Sound FX
    this.audioContext = null;
    this.soundFxEnabled = true;
    this.voiceAccent = 'en-US';
    this.voiceSpeed = 1.0;

    // Quiz State
    this.quizMode = null;
    this.quizWords = [];
    this.quizIndex = 0;
    this.quizScore = 0;
    this.quizStreak = 0;
    this.quizAnswered = false;
    this.matchingSelected = null;
    this.matchedPairs = 0;

    // Callbacks & Timers
    this.confirmCallback = null;
    this.confettiAnimationId = null;

    this.init();
  }

  // ---- Initializer ----
  init() {
    if (!localStorage.getItem('vmp_force_reload_v2')) {
        localStorage.removeItem('vocabmaster_words_v4');
        localStorage.setItem('vmp_force_reload_v2', 'true');
    }
    this.loadData();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.initAudioContext();
    this.initPdfJs();
    this.setupInfiniteScrollObserver();
    this.updateGreeting();

    // Load initial workspace from URL hash or default to dashboard
    const hash = window.location.hash.slice(1);
    if (hash && hash !== 'dashboard') {
      this.openWorkspace(hash, false);
    }
    this.renderDashboard();
  }

  initPdfJs() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
  }

  setupInfiniteScrollObserver() {
    if ('IntersectionObserver' in window) {
      this.libraryObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && this.currentWorkspace === 'library') {
          if (this.libraryPage * this.pageSize < this.filteredWords.length) {
            this.loadNextPageOfWords();
          }
        }
      }, { rootMargin: '200px' });
    }
  }

  updateGreeting() {
    const hour = new Date().getHours();
    const el = document.getElementById('heroGreeting');
    if (!el) return;
    if (hour < 12) el.textContent = 'Chào buổi sáng! 🌟';
    else if (hour < 18) el.textContent = 'Chào buổi chiều! ☀️';
    else el.textContent = 'Chào buổi tối! 🌙';
  }

  // ---- Storage Management ----
  loadData() {
    try {
      const saved = localStorage.getItem('vocabmaster_words_v4');
      if (saved) {
        let list = JSON.parse(saved);
        if (list.length < DEFAULT_VOCABULARY.length) {
          const map = new Map(list.map(w => [w.word.toLowerCase(), w]));
          DEFAULT_VOCABULARY.forEach(defW => {
            if (!map.has(defW.word.toLowerCase())) {
              map.set(defW.word.toLowerCase(), defW);
            }
          });
          list = Array.from(map.values());
        }
        this.words = list;
      } else {
        this.words = JSON.parse(JSON.stringify(DEFAULT_VOCABULARY));
      }
      this.saveData();
    } catch (e) {
      console.error("Failed to load database data", e);
      this.words = JSON.parse(JSON.stringify(DEFAULT_VOCABULARY));
      this.saveData();
    }
  }

  saveData() {
    try {
      localStorage.setItem('vocabmaster_words_v4', JSON.stringify(this.words));
      this.updateSidebarBadges();
    } catch (e) {
      this.showToast('Lỗi lưu trữ dữ liệu vào bộ nhớ hệ thống!', 'error');
    }
  }

  updateSidebarBadges() {
    const totalEl = document.getElementById('navTotalCount');
    const favEl = document.getElementById('navFavCount');
    if (totalEl) totalEl.textContent = this.words.length;
    if (favEl) favEl.textContent = this.words.filter(w => w.favorite).length;
  }

  // ---- Event Listeners ----
  setupEventListeners() {
    // Theme toggle
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // Voice & Audio controls
    const voiceSelect = document.getElementById('voiceAccentSelect');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        this.voiceAccent = e.target.value;
        this.showToast(`Đã chuyển giọng đọc sang ${e.target.options[e.target.selectedIndex].text}`, 'info');
      });
    }

    const speedSelect = document.getElementById('voiceSpeedSelect');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.voiceSpeed = parseFloat(e.target.value) || 1.0;
      });
    }

    const soundFxBtn = document.getElementById('soundFxToggle');
    if (soundFxBtn) {
      soundFxBtn.addEventListener('click', () => {
        this.soundFxEnabled = !this.soundFxEnabled;
        const icon = document.getElementById('soundFxIcon');
        if (icon) icon.textContent = this.soundFxEnabled ? 'volume_up' : 'volume_off';
        this.showToast(this.soundFxEnabled ? 'Đã bật hiệu ứng âm thanh 🔊' : 'Đã tắt âm thanh 🔇', 'info');
        if (this.soundFxEnabled) this.playSound('click');
      });
    }

    // Global Search
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
      searchInput.addEventListener('focus', (e) => {
        if (e.target.value.trim()) this.handleSearch(e.target.value);
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.floating-search')) {
        const sr = document.getElementById('searchResults');
        if (sr) sr.classList.remove('active');
      }
    });

    // Library Filters & Sorting
    ['categoryFilter', 'levelFilter', 'statusFilter', 'sortFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.renderLibrary(true));
    });

    // View toggle (Grid / List)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        this.renderLibrary(true);
        this.playSound('click');
      });
    });

    // Add / Edit Word Form
    const addForm = document.getElementById('addWordForm');
    if (addForm) {
      addForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
      addForm.addEventListener('reset', () => this.resetAddForm());
    }

    const btnCancelEdit = document.getElementById('btnCancelEdit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => this.resetAddForm());
    }

    const btnTestPronounce = document.getElementById('btnTestPronounce');
    if (btnTestPronounce) {
      btnTestPronounce.addEventListener('click', () => {
        const text = document.getElementById('wordInput').value.trim();
        if (text) this.speak(text);
        else this.showToast('Vui lòng nhập từ vựng trước khi nghe thử!', 'warning');
      });
    }

    // Data Management Modal
    const btnOpenData = document.getElementById('btnOpenDataModal');
    if (btnOpenData) {
      btnOpenData.addEventListener('click', () => {
        document.getElementById('dataModal').classList.add('active');
        this.playSound('click');
      });
    }

    const dataModalClose = document.getElementById('dataModalClose');
    if (dataModalClose) {
      dataModalClose.addEventListener('click', () => this.closeModal('dataModal'));
    }

    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) importFileInput.addEventListener('change', (e) => this.handleSmartFileImport(e));

    const btnExportWord = document.getElementById('btnExportWord');
    if (btnExportWord) btnExportWord.addEventListener('click', () => this.exportWordDocx());

    // Quiz exit button
    const quizExitBtn = document.getElementById('quizExit');
    if (quizExitBtn) quizExitBtn.addEventListener('click', () => this.exitQuiz());

    // Modal Close buttons
    const modalClose = document.getElementById('modalClose');
    if (modalClose) modalClose.addEventListener('click', () => this.closeModal('wordModal'));

    const wordModal = document.getElementById('wordModal');
    if (wordModal) {
      wordModal.addEventListener('click', (e) => {
        if (e.target === wordModal) this.closeModal('wordModal');
      });
    }

    // Confirm dialog
    const confirmCancel = document.getElementById('confirmCancel');
    if (confirmCancel) confirmCancel.addEventListener('click', () => this.closeModal('confirmDialog'));

    const confirmOk = document.getElementById('confirmOk');
    if (confirmOk) {
      confirmOk.addEventListener('click', () => {
        if (this.confirmCallback) this.confirmCallback();
        this.closeModal('confirmDialog');
      });
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('vocabmaster_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeLabels(savedTheme);

    // Hash change handling
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      if (hash && hash !== this.currentWorkspace) {
        if (hash === 'dashboard') {
          this.closeWorkspace();
        } else {
          this.openWorkspace(hash, false);
        }
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close modals first
        if (document.getElementById('wordModal')?.classList.contains('active')) {
          this.closeModal('wordModal');
          return;
        }
        if (document.getElementById('confirmDialog')?.classList.contains('active')) {
          this.closeModal('confirmDialog');
          return;
        }
        if (document.getElementById('dataModal')?.classList.contains('active')) {
          this.closeModal('dataModal');
          return;
        }
        const sr = document.getElementById('searchResults');
        if (sr?.classList.contains('active')) {
          sr.classList.remove('active');
          return;
        }
        // Then close workspace
        if (this.currentWorkspace !== 'dashboard') {
          this.closeWorkspace();
          return;
        }
      }

      if ((e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') ||
          (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        const search = document.getElementById('globalSearch');
        if (search) search.focus();
      }

      if (this.currentWorkspace === 'quiz' && this.quizMode === 'flashcard') {
        if (e.code === 'Space') {
          e.preventDefault();
          const fc = document.getElementById('flashcardInner');
          if (fc) fc.classList.toggle('flipped');
          this.playSound('flip');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.flashcardAnswer(false);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.flashcardAnswer(true);
        }
      }
    });
  }

  // ---- Workspace Layer Router ----
  openWorkspace(name, updateHash = true) {
    const validWorkspaces = ['library', 'add-word', 'quiz', 'favorites'];
    if (!validWorkspaces.includes(name)) return;

    // Close any currently open workspace
    document.querySelectorAll('.workspace-layer.active').forEach(layer => {
      if (layer.id !== `layer-${name}`) {
        layer.classList.remove('active');
      }
    });

    // Store previous workspace for back navigation
    if (this.currentWorkspace !== name) {
      this.workspaceHistory.push(this.currentWorkspace);
    }
    this.currentWorkspace = name;

    if (updateHash) {
      window.location.hash = name;
    }

    // Activate new workspace with a tiny delay for animation
    const targetLayer = document.getElementById(`layer-${name}`);
    if (targetLayer) {
      // Force reflow for animation
      targetLayer.offsetHeight;
      requestAnimationFrame(() => {
        targetLayer.classList.add('active');
      });
    }

    // Render workspace content
    requestAnimationFrame(() => {
      this.renderPage(name);
    });

    // Update Three.js scene
    if (window.threeBg) {
      window.threeBg.setScene(name);
    }

    // Scroll workspace to top
    const content = targetLayer?.querySelector('.workspace-content');
    if (content) content.scrollTop = 0;

    this.playSound('click');
  }

  closeWorkspace() {
    const currentLayer = document.getElementById(`layer-${this.currentWorkspace}`);
    if (currentLayer) {
      currentLayer.classList.remove('active');
    }

    // Go back to dashboard
    const dashboardLayer = document.getElementById('layer-dashboard');
    if (dashboardLayer) {
      dashboardLayer.classList.add('active');
    }

    this.currentWorkspace = 'dashboard';
    window.location.hash = 'dashboard';
    this.workspaceHistory = [];

    // Refresh dashboard data
    this.renderDashboard();

    // Update Three.js scene
    if (window.threeBg) {
      window.threeBg.setScene('dashboard');
    }

    this.playSound('click');
  }

  // Legacy compatibility: navigateTo maps to workspace router
  navigateTo(page) {
    if (page === 'dashboard') {
      this.closeWorkspace();
    } else {
      this.openWorkspace(page);
    }
  }

  renderPage(page) {
    switch (page) {
      case 'dashboard': this.renderDashboard(); break;
      case 'library': this.populateCategories(); this.renderLibrary(true); break;
      case 'add-word': this.populateCategoryDatalist(); break;
      case 'quiz': this.renderQuizSetup(); break;
      case 'favorites': this.renderFavorites(); break;
    }
  }

  resetAddForm() {
    document.getElementById('editWordId').value = '';
    document.getElementById('formTitle').textContent = 'Thêm Từ Vựng Mới';
    document.getElementById('formSubmitText').textContent = 'Thêm từ mới';
    document.getElementById('btnCancelEdit').style.display = 'none';
    document.getElementById('addWordForm').reset();
  }

  // ---- Smart File Importer ----
  async handleSmartFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    this.showToast(`Đang đọc file "${file.name}"...`, 'info');

    const progressBox = document.getElementById('ocrProgressBox');
    const progressBar = document.getElementById('ocrProgressBar');
    const statusText = document.getElementById('ocrStatusText');
    const percentText = document.getElementById('ocrPercentText');

    try {
      let parsedWords = [];

      if (fileName.endsWith('.docx')) {
        parsedWords = await this.parseWordDocxFile(file);
      } else if (fileName.endsWith('.pdf')) {
        if (progressBox) progressBox.style.display = 'block';
        parsedWords = await this.parsePdfWithOcr(file, (status, percent) => {
          if (statusText) statusText.textContent = status;
          if (percentText) percentText.textContent = Math.round(percent) + '%';
          if (progressBar) progressBar.style.width = Math.round(percent) + '%';
        });
      } else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        if (progressBox) progressBox.style.display = 'block';
        parsedWords = await this.parseImageWithOcr(file, (status, percent) => {
          if (statusText) statusText.textContent = status;
          if (percentText) percentText.textContent = Math.round(percent) + '%';
          if (progressBar) progressBar.style.width = Math.round(percent) + '%';
        });
      } else if (fileName.endsWith('.txt')) {
        parsedWords = await this.parseTextFile(file);
      } else {
        this.showToast('Định dạng file không được hỗ trợ!', 'warning');
        return;
      }

      if (progressBox) progressBox.style.display = 'none';

      if (parsedWords.length === 0) {
        this.showToast('Không tìm thấy từ vựng nào hợp lệ trong file!', 'warning');
        return;
      }

      // Save to Database
      const existingMap = new Map(this.words.map(w => [w.word.toLowerCase(), w]));
      let addedCount = 0;
      let updatedCount = 0;

      parsedWords.forEach(nw => {
        const key = nw.word.toLowerCase();
        if (existingMap.has(key)) {
          const old = existingMap.get(key);
          existingMap.set(key, { ...old, ...nw, id: old.id });
          updatedCount++;
        } else {
          nw.id = 'w' + Date.now() + Math.random().toString(36).substr(2, 4);
          nw.learned = false;
          nw.favorite = false;
          nw.createdAt = new Date().toISOString();
          existingMap.set(key, nw);
          addedCount++;
        }
      });

      this.words = Array.from(existingMap.values());
      this.saveData();

      this.showToast(`Nhập thành công! Thêm mới ${addedCount} từ, cập nhật ${updatedCount} từ.`, 'success');
      this.playSound('celebrate');
      this.closeModal('dataModal');
      this.renderPage(this.currentWorkspace);

      e.target.value = '';
    } catch (err) {
      if (progressBox) progressBox.style.display = 'none';
      console.error("Import error:", err);
      this.showToast('Lỗi khi đọc file: ' + err.message, 'error');
    }
  }

  async parseWordDocxFile(file) {
    if (!window.mammoth) throw new Error("Thư viện Mammoth đọc Word chưa được nạp!");
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return this.extractWordsFromRawText(result.value || "");
  }

  async parsePdfWithOcr(file, progressCallback) {
    if (!window.pdfjsLib) throw new Error("Thư viện PDF.js chưa được nạp!");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    progressCallback("🔍 Đang đọc các trang PDF...", 10);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += "\n" + textContent.items.map((item) => item.str).join(" ");
      progressCallback(`🔍 Đang đọc trang ${i}/${pdf.numPages}...`, 10 + (i / pdf.numPages) * 40);
    }

    let extracted = this.extractWordsFromRawText(fullText);
    if (extracted.length > 0) return extracted;

    progressCallback("🔍 PDF dạng quét ảnh - Đang kích hoạt Tesseract OCR...", 50);
    let ocrText = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      if (window.Tesseract) {
        const result = await window.Tesseract.recognize(canvas, "eng+vie", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              progressCallback(`🔍 OCR trang ${i}: ${Math.round(m.progress * 100)}%`, 50 + (m.progress * 40) / pdf.numPages);
            }
          }
        });
        ocrText += "\n" + result.data.text;
      }
    }
    return this.extractWordsFromRawText(ocrText);
  }

  async parseImageWithOcr(file, progressCallback) {
    if (!window.Tesseract) throw new Error("Thư viện Tesseract OCR chưa được nạp!");
    progressCallback("🔍 Đang quét OCR hình ảnh...", 20);
    const result = await window.Tesseract.recognize(file, "eng+vie", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          progressCallback(`🔍 Đang nhận diện chữ: ${Math.round(m.progress * 100)}%`, 20 + m.progress * 70);
        }
      }
    });
    return this.extractWordsFromRawText(result.data.text);
  }

  extractWordsFromRawText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const parsed = [];

    lines.forEach((line) => {
      line = line.trim();
      if (!line || line.length < 2) return;

      const tabParts = line.split(/\t+/);
      if (tabParts.length >= 2) {
        const wordStr = tabParts[0].trim();
        const secondStr = tabParts[1].trim();
        const thirdStr = tabParts[2] ? tabParts[2].trim() : '';

        if (wordStr && /^[a-zA-Z\s-]+$/.test(wordStr)) {
          let phoneticStr = `/${wordStr}/`;
          let meaningStr = secondStr;
          if (secondStr.startsWith('/') || secondStr.startsWith('[')) {
            phoneticStr = secondStr;
            meaningStr = thirdStr || secondStr;
          }

          parsed.push({
            word: wordStr,
            phonetic: phoneticStr,
            partOfSpeech: "noun",
            meaning: meaningStr || wordStr,
            definition: "",
            category: "general",
            level: "intermediate",
            cefr: "B2",
            examples: [], synonyms: [], antonyms: [], collocations: []
          });
          return;
        }
      }

      const match = line.match(/^([a-zA-Z\s-]+?)\s+(v\.|n\.|adj\.|adv\.|prep\.|conj\.|pron\.|n\.,\s*v\.|v\.,\s*n\.|adj\.,\s*adv\.|adv\.,\s*prep\.)?\s*(\/[^/]+\/)?\s*(.+)$/);
      if (match) {
        const wordStr = match[1].trim();
        const rawPos = (match[2] || '').trim();
        const phoneticStr = (match[3] || '').trim() || `/${wordStr}/`;
        const meaningStr = match[4].trim();

        if (wordStr.length >= 1 && meaningStr.length >= 1 && !wordStr.toLowerCase().includes('từ vựng')) {
          let pos = 'noun';
          if (rawPos.includes('v.')) pos = 'verb';
          else if (rawPos.includes('adj.')) pos = 'adjective';
          else if (rawPos.includes('adv.')) pos = 'adverb';
          else if (rawPos.includes('n.')) pos = 'noun';
          else if (rawPos.includes('prep.')) pos = 'preposition';

          parsed.push({
            word: wordStr,
            phonetic: phoneticStr,
            partOfSpeech: pos,
            meaning: meaningStr,
            definition: "",
            category: "IELTS Core",
            level: "intermediate",
            cefr: "B2",
            examples: [], synonyms: [], antonyms: [], collocations: []
          });
          return;
        }
      }

      const simpleMatch = line.match(/^([a-zA-Z\s-]+)\s*[:=\-–—]\s*(.+)$/);
      if (simpleMatch) {
        const wordStr = simpleMatch[1].trim();
        const meaningStr = simpleMatch[2].trim();
        if (wordStr.length >= 1 && meaningStr.length >= 1) {
          parsed.push({
            word: wordStr,
            phonetic: `/${wordStr}/`,
            partOfSpeech: "noun",
            meaning: meaningStr,
            definition: "",
            category: "general",
            level: "intermediate",
            cefr: "B2",
            examples: [], synonyms: [], antonyms: [], collocations: []
          });
        }
      }
    });

    return parsed;
  }

  parseTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try { resolve(this.extractWordsFromRawText(e.target.result)); } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  

  exportWordDocx() {
    if (this.words.length === 0) {
      this.showToast('Kho từ vựng của bạn đang trống!', 'warning');
      return;
    }

    let docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>VocabMaster - Danh Sách Từ Vựng</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }
          h1 { color: #6366f1; font-size: 20pt; text-align: center; margin-bottom: 5px; }
          p.subtitle { text-align: center; color: #64748b; font-size: 10pt; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #6366f1; color: #ffffff; padding: 10px; font-weight: bold; text-align: left; border: 1px solid #6366f1; }
          td { padding: 8px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .word { font-weight: bold; color: #6366f1; font-size: 12pt; }
          .phonetic { font-style: italic; color: #059669; font-family: monospace; }
          .pos { font-size: 9pt; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .meaning { font-weight: bold; color: #0f172a; }
          .ex { font-style: italic; color: #475569; font-size: 10pt; margin-top: 4px; }
        </style>
      </head>
      <body>
        <h1>DANH SÁCH TỪ VỰNG TIẾNG ANH - VOCABMASTER</h1>
        <p class="subtitle">Tổng số từ: <strong>${this.words.length} từ</strong> | Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">STT</th>
              <th style="width: 25%;">Từ vựng & Phiên âm</th>
              <th style="width: 15%;">Từ loại & CEFR</th>
              <th style="width: 30%;">Nghĩa tiếng Việt</th>
              <th style="width: 25%;">Ví dụ minh họa</th>
            </tr>
          </thead>
          <tbody>
            ${this.words.map((w, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td>
                  <div class="word">${this.escapeHtml(w.word)}</div>
                  <div class="phonetic">${this.escapeHtml(w.phonetic || w.phoneticUk || '')}</div>
                </td>
                <td>
                  <span class="pos">${this.escapeHtml(w.partOfSpeech)}</span>
                  <div style="font-size:9pt;color:#64748b;margin-top:4px;">CEFR: <strong>${w.cefr || 'B2'}</strong></div>
                </td>
                <td>
                  <div class="meaning">${this.escapeHtml(w.meaning)}</div>
                  ${w.definition ? `<div style="font-size:9.5pt;color:#64748b;margin-top:3px;">${this.escapeHtml(w.definition)}</div>` : ''}
                </td>
                <td>
                  ${(w.examples || []).slice(0, 2).map(ex => `<div class="ex">• "${this.escapeHtml(ex)}"</div>`).join('')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabmaster_words_${new Date().toISOString().slice(0,10)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    this.showToast('Đã xuất thành công toàn bộ kho từ vựng ra file Word (.docx)!', 'success');
  }

  // ---- Audio Synthesizer ----
  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  playSound(type) {
    if (!this.soundFxEnabled || !this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    if (type === 'correct') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now); osc.stop(now + 0.45);
    } else if (type === 'wrong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(130, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'flip') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'celebrate') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.15, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
        osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
      });
    }
  }

  // ---- Speech Synthesis ----
  speak(text, customLang = null) {
    if (!('speechSynthesis' in window)) {
      this.showToast('Trình duyệt không hỗ trợ Web Speech.', 'warning');
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[/\\*~_]/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = customLang || this.voiceAccent || 'en-US';
    utterance.rate = this.voiceSpeed || 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const targetLang = utterance.lang.toLowerCase();
      const foundVoice = voices.find(v => v.lang.toLowerCase() === targetLang) ||
                         voices.find(v => v.lang.toLowerCase().startsWith(targetLang.slice(0, 2)));
      if (foundVoice) utterance.voice = foundVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  // ---- Dashboard ----
  renderDashboard() {
    const total = this.words.length;
    let learned = 0;
    let favorites = 0;

    for (let i = 0; i < total; i++) {
      if (this.words[i].learned) learned++;
      if (this.words[i].favorite) favorites++;
    }

    const unlearned = total - learned;
    const progress = total > 0 ? Math.round((learned / total) * 100) : 0;

    this.animateNumber('totalWords', total);
    this.animateNumber('learnedWords', learned);
    this.animateNumber('favoriteWords', favorites);
    this.animateNumber('unlearnedWords', unlearned);

    const learnedBadge = document.getElementById('learnedPercentBadge');
    if (learnedBadge) learnedBadge.textContent = progress + '%';

    const progressPercent = document.getElementById('progressPercent');
    if (progressPercent) progressPercent.textContent = progress + '%';

    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = progress + '%';

    const progressLearned = document.getElementById('progressLearned');
    if (progressLearned) progressLearned.textContent = learned;

    const progressRemaining = document.getElementById('progressRemaining');
    if (progressRemaining) progressRemaining.textContent = unlearned;

    this.renderCefrDistribution();
    this.renderWordOfDay();
    this.renderRecentWords();
    this.updateSidebarBadges();
  }

  renderCefrDistribution() {
    const counts = { B1: 0, B2: 0, C1: 0, C2: 0 };
    this.words.forEach(w => {
      const cefr = (w.cefr || 'B2').toUpperCase();
      if (counts[cefr] !== undefined) counts[cefr]++;
      else counts['B2']++;
    });

    const container = document.getElementById('levelDistribution');
    if (!container) return;

    container.innerHTML = `
      <div class="cefr-distribution-row">
        <div class="cefr-item b1"><span class="cefr-dot"></span><span class="cefr-lbl">B1</span> <strong class="cefr-val">${counts.B1}</strong></div>
        <div class="cefr-item b2"><span class="cefr-dot"></span><span class="cefr-lbl">B2</span> <strong class="cefr-val">${counts.B2}</strong></div>
        <div class="cefr-item c1"><span class="cefr-dot"></span><span class="cefr-lbl">C1</span> <strong class="cefr-val">${counts.C1}</strong></div>
        <div class="cefr-item c2"><span class="cefr-dot"></span><span class="cefr-lbl">C2</span> <strong class="cefr-val">${counts.C2}</strong></div>
      </div>
    `;
  }

  renderWordOfDay() {
    const container = document.getElementById('wordOfDay');
    const badgeCefr = document.getElementById('wodCefr');
    if (!container) return;

    if (this.words.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted)">Chua c� từ vựng n�o trong kho.</p>';
      return;
    }

    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const word = this.words[dayOfYear % this.words.length];

    if (badgeCefr) badgeCefr.textContent = word.cefr || 'B2';

    container.innerHTML = `
      <div class="wod-title-group">
        <div class="wod-word-wrap">
          <div class="wod-word">${this.escapeHtml(word.word)}</div>
          <button class="btn-speak-inline" onclick="app.speak('${this.escapeAttr(word.word)}')">
            <span class="material-symbols-rounded">volume_up</span>
          </button>
        </div>
        <div class="wod-meta-wrap">
          <span class="wod-phonetics">${this.escapeHtml(word.phonetic || word.phoneticUk || '')}</span>
          <span class="wod-pos-tag">${this.escapeHtml(word.partOfSpeech)}</span>
        </div>
      </div>

      <div class="wod-meaning">${this.escapeHtml(word.meaning)}</div>
      <div class="wod-definition">${this.escapeHtml(word.definition || '')}</div>

      <div class="wod-examples-list">
        ${(word.examples || []).slice(0, 2).map(ex => `
          <div class="wod-example-item">
            <span class="ex-text">"${this.escapeHtml(ex)}"</span>
            <button class="btn-play-sm" onclick="app.speak('${this.escapeAttr(ex)}')">
              <span class="material-symbols-rounded" style="font-size:16px;">volume_up</span>
            </button>
          </div>
        `).join('')}
      </div>

      <div class="wod-actions-row">
        <button class="btn btn-primary" onclick="app.showWordDetail('${word.id}')">
          Xem chi tiết
        </button>
        <button class="btn btn-secondary" onclick="app.toggleLearned('${word.id}', event)">
          �Đánh dấu đã thuộc
        </button>
      </div>
    `;
  }

  renderRecentWords() {
    const container = document.getElementById('recentWords');
    if (!container) return;

    const recent = [...this.words].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);

    container.innerHTML = `
      <div class="recent-words-grid">
        ${recent.map(w => `
          <div class="recent-word-pill" onclick="app.showWordDetail('${w.id}')">
            <div class="rwp-word">${this.escapeHtml(w.word)}</div>
            <div class="rwp-meaning">${this.escapeHtml(w.meaning)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = parseInt(el.textContent) || 0;
    if (start === target) { el.textContent = target; return; }

    const duration = 600;
    const startTime = performance.now();
    const diff = target - start;

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + diff * eased);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  // ---- Library: High-Performance Virtual Batching ----
  populateCategories() {
    const categories = [...new Set(this.words.map(w => w.category).filter(Boolean))];
    const select = document.getElementById('categoryFilter');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="all">Tất cả chủ đề</option>';
    categories.sort().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      select.appendChild(opt);
    });
    select.value = currentVal;
  }

  renderLibrary(reset = true) {
    if (reset) {
      this.libraryPage = 1;

      const category = document.getElementById('categoryFilter')?.value || 'all';
      const level = document.getElementById('levelFilter')?.value || 'all';
      const status = document.getElementById('statusFilter')?.value || 'all';
      const sort = document.getElementById('sortFilter')?.value || 'newest';

      this.filteredWords = this.words.filter(w => {
        if (category !== 'all' && w.category !== category) return false;
        if (level !== 'all' && w.level !== level) return false;
        if (status === 'learned' && !w.learned) return false;
        if (status === 'not-learned' && w.learned) return false;
        return true;
      });

      this.filteredWords.sort((a, b) => {
        if (sort === 'alpha-asc') return a.word.localeCompare(b.word);
        if (sort === 'alpha-desc') return b.word.localeCompare(a.word);
        if (sort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    }

    const container = document.getElementById('wordsGrid');
    const emptyEl = document.getElementById('libraryEmpty');
    const countText = document.getElementById('libraryRenderCountText');
    const btnLoadMore = document.getElementById('btnLoadMoreWords');
    const paginationBox = document.getElementById('libraryPaginationBox');

    if (!container || !emptyEl) return;

    if (this.filteredWords.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = 'block';
      if (paginationBox) paginationBox.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    if (paginationBox) paginationBox.style.display = 'block';

    container.className = `words-container ${this.currentView}-view`;

    const visibleSlice = this.filteredWords.slice(0, this.libraryPage * this.pageSize);

    if (reset) {
      container.innerHTML = visibleSlice.map(w => this.createWordCardHTML(w)).join('');
    } else {
      const newItems = this.filteredWords.slice((this.libraryPage - 1) * this.pageSize, this.libraryPage * this.pageSize);
      container.insertAdjacentHTML('beforeend', newItems.map(w => this.createWordCardHTML(w)).join(''));
    }

    if (countText) {
      countText.innerHTML = `Đang hiển thị <strong>${visibleSlice.length}</strong> / <strong>${this.filteredWords.length}</strong> từ vựng`;
    }

    if (btnLoadMore) {
      if (visibleSlice.length < this.filteredWords.length) {
        btnLoadMore.style.display = 'inline-flex';
        if (this.libraryObserver && paginationBox) {
          this.libraryObserver.observe(paginationBox);
        }
      } else {
        btnLoadMore.style.display = 'none';
        if (this.libraryObserver && paginationBox) {
          this.libraryObserver.unobserve(paginationBox);
        }
      }
    }
  
    // Awwwards-Level Micro-interaction: 3D Tilt for cards
    if (typeof VanillaTilt !== 'undefined') {
      const cards = document.querySelectorAll('#libraryGrid .word-card');
      if (cards.length > 0) {
        VanillaTilt.init(cards, {
          max: 10,
          speed: 400,
          glare: true,
          "max-glare": 0.1,
          scale: 1.02
        });
      }
    }
  }

  loadNextPageOfWords() {
    if (this.libraryPage * this.pageSize < this.filteredWords.length) {
      this.libraryPage++;
      this.renderLibrary(false);
    }
  }

  createWordCardHTML(word) {
    const cefr = (word.cefr || 'B2').toUpperCase();
    const cefrClass = cefr.toLowerCase();

    return `
      <div class="word-card ${word.learned ? 'learned' : ''}" onclick="app.showWordDetail('${word.id}')">
        <div class="wc-top-row">
          <div class="wc-word-wrap">
            <span class="wc-word">${this.escapeHtml(word.word)}</span>
            <span class="wc-cefr cefr-badge ${cefrClass}">${cefr}</span>
          </div>
          <div class="wc-actions" onclick="event.stopPropagation()">
            <button class="wc-btn" onclick="app.speak('${this.escapeAttr(word.word)}')" title="Phát âm">
              <span class="material-symbols-rounded" style="font-size:18px">volume_up</span>
            </button>
            <button class="wc-btn fav-btn ${word.favorite ? 'active' : ''}" onclick="app.toggleFavorite('${word.id}')" title="Yêu thích">
              <span class="material-symbols-rounded" style="font-size:18px">${word.favorite ? 'favorite' : 'favorite_border'}</span>
            </button>
          </div>
        </div>

        <div class="wc-phonetic">${this.escapeHtml(word.phonetic || word.phoneticUk || '')}</div>

        <div class="wc-tags-row">
          <span class="wc-pos">${this.escapeHtml(word.partOfSpeech)}</span>
          <span class="wc-cat">${this.escapeHtml(word.category || 'General')}</span>
        </div>

        <div class="wc-meaning">${this.escapeHtml(word.meaning)}</div>
        <div class="wc-definition">${this.escapeHtml(word.definition || '')}</div>
      </div>
    `;
  }

  // ---- Add / Edit Word Form ----
  async handleFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('editWordId').value;
    const rawWord = document.getElementById('wordInput').value.trim();
    const rawMeaning = document.getElementById('meaningInput').value.trim();

    if (!rawWord || !rawMeaning) {
      this.showToast('Vui lòng điền đầy đủ từ vựng và nghĩa tiếng Việt!', 'warning');
      return;
    }

    const wordData = {
      word: rawWord,
      phonetic: document.getElementById('phoneticInput').value.trim() || `/${rawWord}/`,
      partOfSpeech: document.getElementById('posInput').value,
      category: document.getElementById('categoryInput').value.trim().toLowerCase() || 'general',
      level: document.getElementById('levelInput').value,
      cefr: document.getElementById('cefrInput').value,
      meaning: rawMeaning,
      definition: document.getElementById('definitionInput').value.trim(),
      examples: document.getElementById('examplesInput').value.trim().split('\n').map(s => s.trim()).filter(Boolean),
      synonyms: document.getElementById('synonymsInput').value.split(',').map(s => s.trim()).filter(Boolean),
      antonyms: document.getElementById('antonymsInput').value.split(',').map(s => s.trim()).filter(Boolean),
      collocations: document.getElementById('collocationsInput').value.split(',').map(s => s.trim()).filter(Boolean),
      memoryTip: document.getElementById('memoryTipInput').value.trim()
    };

    if (editId) {
      const idx = this.words.findIndex(w => w.id === editId);
      if (idx !== -1) {
        this.words[idx] = { ...this.words[idx], ...wordData };
        this.saveData();
        this.playSound('correct');
        this.showToast(`Đã cập nhật thành công từ "${wordData.word}"!`, 'success');
      }
    } else {
      if (this.words.some(w => w.word.toLowerCase() === wordData.word.toLowerCase())) {
        this.showToast(`Từ "${wordData.word}" đã tồn tại trong thư viện!`, 'warning');
        return;
      }

      const newWord = {
        id: 'w' + Date.now(),
        ...wordData,
        learned: false,
        favorite: false,
        createdAt: new Date().toISOString()
      };

      this.words.unshift(newWord);
      this.saveData();
      this.playSound('correct');
      this.showToast(`Đã thêm từ mới "${wordData.word}" thành công!`, 'success');
    }

    this.resetAddForm();
    this.openWorkspace('library');
  }

  editWord(id) {
    const word = this.words.find(w => w.id === id);
    if (!word) return;

    this.closeModal('wordModal');
    this.openWorkspace('add-word');

    setTimeout(() => {
      document.getElementById('editWordId').value = word.id;
      document.getElementById('wordInput').value = word.word;
      document.getElementById('phoneticInput').value = word.phonetic || word.phoneticUk || '';
      document.getElementById('posInput').value = word.partOfSpeech;
      document.getElementById('categoryInput').value = word.category || '';
      document.getElementById('levelInput').value = word.level || 'intermediate';
      document.getElementById('cefrInput').value = word.cefr || 'B2';
      document.getElementById('meaningInput').value = word.meaning;
      document.getElementById('definitionInput').value = word.definition || '';
      document.getElementById('examplesInput').value = (word.examples || []).join('\n');
      document.getElementById('synonymsInput').value = (word.synonyms || []).join(', ');
      document.getElementById('antonymsInput').value = (word.antonyms || []).join(', ');
      document.getElementById('collocationsInput').value = (word.collocations || []).join(', ');
      document.getElementById('memoryTipInput').value = word.memoryTip || '';

      document.getElementById('formTitle').textContent = `Chỉnh sửa từ: "${word.word}"`;
      document.getElementById('formSubmitText').textContent = 'Lưu thay đổi';
      document.getElementById('btnCancelEdit').style.display = 'inline-flex';
    }, 200);
  }

  deleteWord(id) {
    const word = this.words.find(w => w.id === id);
    if (!word) return;

    this.showConfirm(
      'Xóa từ vựng',
      `Bạn có chắc chắn muốn xóa vĩnh viễn từ "${word.word}" khỏi hệ thống?`,
      () => {
        this.words = this.words.filter(w => w.id !== id);
        this.saveData();
        this.closeModal('wordModal');
        this.showToast(`Đã xóa từ "${word.word}"`, 'info');
        this.renderPage(this.currentWorkspace);
      }
    );
  }

  toggleLearned(id) {
    const word = this.words.find(w => w.id === id);
    if (!word) return;
    word.learned = !word.learned;
    this.saveData();
    this.playSound(word.learned ? 'correct' : 'click');
    this.showToast(word.learned ? `Đã thành thạo "${word.word}" 🎉` : `Đã bỏ đánh dấu "${word.word}"`, 'success');
    this.renderPage(this.currentWorkspace);
    this.refreshModal(id);
  }

  toggleFavorite(id) {
    const word = this.words.find(w => w.id === id);
    if (!word) return;
    word.favorite = !word.favorite;
    this.saveData();
    this.playSound('click');
    this.showToast(word.favorite ? `Đã thêm "${word.word}" vào Yêu thích ❤️` : `Đã bỏ "${word.word}" khỏi Yêu thích`, 'info');
    this.renderPage(this.currentWorkspace);
  }

  // ---- Quiz System ----
  renderQuizSetup() {
    document.getElementById('quizSetup').style.display = 'block';
    document.getElementById('quizArea').style.display = 'none';
    document.getElementById('quizResult').style.display = 'none';
    this.stopConfetti();
  }

  startQuiz(mode) {
    if (this.words.length < 4) {
      this.showToast('Bạn cần ít nhất 4 từ vựng để làm bài kiểm tra!', 'warning');
      return;
    }

    // Ensure quiz workspace is open
    if (this.currentWorkspace !== 'quiz') {
      this.openWorkspace('quiz');
    }

    this.quizMode = mode;
    this.quizScore = 0;
    this.quizStreak = 0;
    this.quizIndex = 0;
    this.quizAnswered = false;

    const shuffled = [...this.words].sort(() => Math.random() - 0.5);
    this.quizWords = shuffled.slice(0, Math.min(10, this.words.length));

    document.getElementById('quizSetup').style.display = 'none';
    document.getElementById('quizArea').style.display = 'block';
    document.getElementById('quizResult').style.display = 'none';

    document.getElementById('quizTotal').textContent = this.quizWords.length;
    document.getElementById('quizScore').textContent = '0';
    document.getElementById('quizStreakCount').textContent = '0 Streak';

    if (mode === 'matching') {
      this.startMatchingGame();
    } else {
      this.showQuizQuestion();
    }
  }

  showQuizQuestion() {
    if (this.quizIndex >= this.quizWords.length) {
      this.showQuizResult();
      return;
    }

    this.quizAnswered = false;
    const word = this.quizWords[this.quizIndex];

    document.getElementById('quizCurrent').textContent = this.quizIndex + 1;
    document.getElementById('quizProgressFill').style.width = ((this.quizIndex / this.quizWords.length) * 100) + '%';

    switch (this.quizMode) {
      case 'flashcard': this.renderFlashcard(word); break;
      case 'multiple-choice': this.renderMultipleChoice(word); break;
      case 'typing': this.renderTyping(word); break;
    }
  }

  renderFlashcard(word) {
    document.getElementById('quizContent').innerHTML = `
      <div class="flashcard-wrapper">
        <div class="flashcard-inner" id="flashcardInner" onclick="this.classList.toggle('flipped'); app.playSound('flip');">
          <div class="fc-side fc-front">
            <div class="fc-word">${this.escapeHtml(word.word)}</div>
            <div class="fc-phonetic">${this.escapeHtml(word.phonetic || word.phoneticUk || '')}</div>
            <button class="btn-speak" onclick="event.stopPropagation(); app.speak('${this.escapeAttr(word.word)}')" title="Phát âm">
              <span class="material-symbols-rounded">volume_up</span>
            </button>
            <div class="fc-instruction">
              <span class="material-symbols-rounded">touch_app</span> Bấm thẻ hoặc Space để lật
            </div>
          </div>
          <div class="fc-side fc-back">
            <div class="fc-meaning">${this.escapeHtml(word.meaning)}</div>
            <div class="fc-def">${this.escapeHtml(word.definition || '')}</div>
            ${word.examples && word.examples[0] ? `<div class="fc-ex">"${this.escapeHtml(word.examples[0])}"</div>` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('quizActions').innerHTML = `
      <button class="btn btn-secondary" onclick="app.flashcardAnswer(false)">
        <span class="material-symbols-rounded">close</span> Chưa nhớ (⬅)
      </button>
      <button class="btn btn-primary" onclick="app.flashcardAnswer(true)">
        <span class="material-symbols-rounded">check</span> Đã nhớ (➡)
      </button>
    `;
  }

  flashcardAnswer(remembered) {
    if (remembered) {
      this.quizScore += 10;
      this.quizStreak++;
      this.playSound('correct');
    } else {
      this.quizStreak = 0;
      this.playSound('wrong');
    }
    this.updateQuizScoreDisplay();
    this.quizIndex++;
    this.showQuizQuestion();
  }

  renderMultipleChoice(word) {
    const otherWords = this.words.filter(w => w.id !== word.id);
    const shuffledOthers = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [
      { meaning: word.meaning, correct: true },
      ...shuffledOthers.map(w => ({ meaning: w.meaning, correct: false }))
    ].sort(() => Math.random() - 0.5);

    document.getElementById('quizContent').innerHTML = `
      <div class="mc-wrap">
        <div class="mc-question-box">
          <div class="mc-word">${this.escapeHtml(word.word)}</div>
          <div class="mc-phonetic">${this.escapeHtml(word.phonetic || word.phoneticUk || '')}</div>
          <button class="btn-speak" onclick="app.speak('${this.escapeAttr(word.word)}')" title="Phát âm" style="margin-bottom:14px">
            <span class="material-symbols-rounded">volume_up</span>
          </button>
          <div class="mc-prompt">Chọn đáp án có nghĩa chính xác:</div>
        </div>
        <div class="mc-options-grid">
          ${options.map((opt, i) => `
            <button class="mc-opt-btn" data-correct="${opt.correct}" onclick="app.checkMultipleChoiceAnswer(this, ${opt.correct})">
              <span class="mc-opt-key">${String.fromCharCode(65 + i)}</span>
              <span>${this.escapeHtml(opt.meaning)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    document.getElementById('quizActions').innerHTML = '';
  }

  checkMultipleChoiceAnswer(btn, isCorrect) {
    if (this.quizAnswered) return;
    this.quizAnswered = true;

    document.querySelectorAll('.mc-opt-btn').forEach(b => {
      b.setAttribute('disabled', 'true');
      if (b.dataset.correct === 'true') b.classList.add('correct');
    });

    if (isCorrect) {
      btn.classList.add('correct');
      this.quizScore += 10;
      this.quizStreak++;
      this.playSound('correct');
    } else {
      btn.classList.add('wrong');
      this.quizStreak = 0;
      this.playSound('wrong');
    }

    this.updateQuizScoreDisplay();
    setTimeout(() => {
      this.quizIndex++;
      this.showQuizQuestion();
    }, 1400);
  }

  renderTyping(word) {
    const wordChars = word.word.split('');
    const hint = wordChars.map((c, i) => {
      if (i === 0 || i === wordChars.length - 1 || c === '-' || c === ' ') return c;
      return '_';
    }).join(' ');

    document.getElementById('quizContent').innerHTML = `
      <div class="typing-wrap">
        <div class="typing-meaning">${this.escapeHtml(word.meaning)}</div>
        <div class="typing-def">${this.escapeHtml(word.definition || '')}</div>
        <div class="typing-hint-display">${hint}</div>
        <div class="typing-input-bar">
          <input type="text" id="typingInput" placeholder="Gõ từ tiếng Anh..." autocomplete="off" autofocus>
          <button class="btn btn-primary" onclick="app.checkTypingAnswer()">
            <span class="material-symbols-rounded">check</span>
          </button>
          <button class="btn-speak" onclick="app.speak('${this.escapeAttr(word.word)}')" title="Nghe gợi ý">
            <span class="material-symbols-rounded">volume_up</span>
          </button>
        </div>
        <div class="typing-feedback-msg" id="typingFeedback"></div>
      </div>
    `;

    const input = document.getElementById('typingInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.checkTypingAnswer();
      });
      setTimeout(() => input.focus(), 100);
    }
    document.getElementById('quizActions').innerHTML = '';
  }

  checkTypingAnswer() {
    if (this.quizAnswered) return;
    this.quizAnswered = true;

    const word = this.quizWords[this.quizIndex];
    const input = document.getElementById('typingInput');
    const feedback = document.getElementById('typingFeedback');
    const answer = (input.value || '').trim().toLowerCase();
    const isCorrect = answer === word.word.toLowerCase();

    if (isCorrect) {
      input.classList.add('correct');
      feedback.className = 'typing-feedback-msg correct';
      feedback.textContent = '✓ Hoàn toàn chính xác!';
      this.quizScore += 10;
      this.quizStreak++;
      this.playSound('correct');
    } else {
      input.classList.add('wrong');
      feedback.className = 'typing-feedback-msg wrong';
      feedback.textContent = `✗ Đáp án đúng: "${word.word}"`;
      this.quizStreak = 0;
      this.playSound('wrong');
    }

    this.updateQuizScoreDisplay();
    setTimeout(() => {
      this.quizIndex++;
      this.showQuizQuestion();
    }, 1800);
  }

  startMatchingGame() {
    const sampleWords = this.quizWords.slice(0, 5);
    const engList = sampleWords.map(w => ({ id: w.id, text: w.word, type: 'en' })).sort(() => Math.random() - 0.5);
    const vnList = sampleWords.map(w => ({ id: w.id, text: w.meaning, type: 'vn' })).sort(() => Math.random() - 0.5);

    this.matchingSelected = null;
    this.matchedPairs = 0;
    this.totalMatchPairs = sampleWords.length;

    document.getElementById('quizProgressFill').style.width = '10%';
    document.getElementById('quizContent').innerHTML = `
      <div class="matching-wrap">
        <div class="matching-instruction">Bấm chọn 1 từ tiếng Anh và 1 nghĩa tiếng Việt tương ứng:</div>
        <div class="matching-grid">
          <div class="matching-col">
            ${engList.map(item => `
              <div class="match-card" data-id="${item.id}" data-type="en" onclick="app.handleMatchCardClick(this)">
                ${this.escapeHtml(item.text)}
              </div>
            `).join('')}
          </div>
          <div class="matching-col">
            ${vnList.map(item => `
              <div class="match-card" data-id="${item.id}" data-type="vn" onclick="app.handleMatchCardClick(this)">
                ${this.escapeHtml(item.text)}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.getElementById('quizActions').innerHTML = '';
  }

  handleMatchCardClick(el) {
    if (el.classList.contains('matched')) return;

    if (!this.matchingSelected) {
      this.matchingSelected = el;
      el.classList.add('selected');
      this.playSound('click');
      return;
    }

    if (this.matchingSelected === el) {
      el.classList.remove('selected');
      this.matchingSelected = null;
      return;
    }

    if (this.matchingSelected.dataset.type === el.dataset.type) {
      this.matchingSelected.classList.remove('selected');
      this.matchingSelected = el;
      el.classList.add('selected');
      return;
    }

    const first = this.matchingSelected;
    const second = el;

    if (first.dataset.id === second.dataset.id) {
      first.classList.remove('selected');
      second.classList.remove('selected');
      first.classList.add('matched');
      second.classList.add('matched');

      this.playSound('correct');
      this.quizScore += 10;
      this.quizStreak++;
      this.matchedPairs++;

      this.updateQuizScoreDisplay();
      document.getElementById('quizProgressFill').style.width = `${(this.matchedPairs / this.totalMatchPairs) * 100}%`;

      if (this.matchedPairs >= this.totalMatchPairs) {
        setTimeout(() => this.showQuizResult(), 800);
      }
    } else {
      second.classList.add('wrong');
      first.classList.add('wrong');
      this.playSound('wrong');
      this.quizStreak = 0;
      this.updateQuizScoreDisplay();

      setTimeout(() => {
        first.classList.remove('selected', 'wrong');
        second.classList.remove('selected', 'wrong');
      }, 600);
    }

    this.matchingSelected = null;
  }

  updateQuizScoreDisplay() {
    document.getElementById('quizScore').textContent = this.quizScore;
    document.getElementById('quizStreakCount').textContent = `${this.quizStreak} Streak 🔥`;
  }

  showQuizResult() {
    document.getElementById('quizArea').style.display = 'none';
    const resultEl = document.getElementById('quizResult');
    resultEl.style.display = 'block';

    const maxScore = (this.quizMode === 'matching' ? this.totalMatchPairs : this.quizWords.length) * 10;
    const percent = Math.round((this.quizScore / maxScore) * 100) || 0;

    let icon = '🏆', message = 'Đỉnh cao! Bạn nhớ từ cực tốt!';
    if (percent >= 80) {
      this.playSound('celebrate');
      this.triggerConfetti();
    } else if (percent >= 50) {
      icon = '🌟'; message = 'Rất tốt!';
      this.playSound('correct');
    } else {
      icon = '📚'; message = 'Hãy tiếp tục kiên trì ôn luyện nhé!';
      this.playSound('wrong');
    }

    resultEl.innerHTML = `
      <div class="qr-trophy-icon">${icon}</div>
      <h2>Kết quả tổng kết bài thi</h2>
      <div class="qr-score-huge">${percent}%</div>
      <div class="qr-message-text">${message}</div>

      <div class="qr-stat-cards">
        <div class="qr-stat-box">
          <div class="qr-stat-val correct">${this.quizScore}</div>
          <div class="qr-stat-lbl">Tổng điểm</div>
        </div>
        <div class="qr-stat-box">
          <div class="qr-stat-val" style="color:var(--accent-gold)">${this.quizStreak}</div>
          <div class="qr-stat-lbl">Combo dài nhất</div>
        </div>
      </div>

      <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="app.startQuiz('${this.quizMode}')">
          <span class="material-symbols-rounded">replay</span> Làm lại bài này
        </button>
        <button class="btn btn-secondary" onclick="app.renderQuizSetup()">
          <span class="material-symbols-rounded">sports_esports</span> Chọn chế độ khác
        </button>
      </div>
    `;
  }

  exitQuiz() {
    this.renderQuizSetup();
  }

  // ---- Favorites ----
  renderFavorites() {
    const favorites = this.words.filter(w => w.favorite);
    const container = document.getElementById('favoritesGrid');
    const emptyEl = document.getElementById('favoritesEmpty');

    if (!container || !emptyEl) return;

    if (favorites.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    container.innerHTML = favorites.map(w => this.createWordCardHTML(w)).join('');
  }

  // ---- Global Search ----
  handleSearch(query) {
    const container = document.getElementById('searchResults');
    if (!container) return;

    query = query.trim().toLowerCase();
    if (!query) {
      container.classList.remove('active');
      return;
    }

    const results = this.words.filter(w =>
      w.word.toLowerCase().includes(query) ||
      w.meaning.toLowerCase().includes(query)
    ).slice(0, 8);

    if (results.length === 0) {
      container.innerHTML = `
        <div class="search-result-item" style="cursor:default;color:var(--text-muted)">
          Không tìm thấy từ nào khớp với "${this.escapeHtml(query)}"
        </div>
      `;
    } else {
      container.innerHTML = results.map(w => `
        <div class="search-result-item" onclick="app.showWordDetail('${w.id}'); document.getElementById('searchResults').classList.remove('active');">
          <div class="sr-word-row">
            <span class="sr-word">${this.escapeHtml(w.word)}</span>
            <span class="sr-cefr cefr-badge ${(w.cefr || 'B2').toLowerCase()}">${w.cefr || 'B2'}</span>
          </div>
          <div class="sr-meaning">${this.escapeHtml(w.meaning)}</div>
        </div>
      `).join('');
    }

    container.classList.add('active');
  }

  // ---- Word Detail Modal ----
  showWordDetail(id) {
    const word = this.words.find(w => w.id === id);
    if (!word) return;

    const content = document.getElementById('modalContent');
    const cefr = (word.cefr || 'B2').toUpperCase();

    content.innerHTML = `
      <div class="md-top-bar">
        <div>
          <div class="md-word">${this.escapeHtml(word.word)}</div>
          <div class="md-phonetics-row">
            <span>🇬🇧 UK: ${this.escapeHtml(word.phoneticUk || word.phonetic || '')}</span>
            <span>🇺🇸 US: ${this.escapeHtml(word.phoneticUs || word.phonetic || '')}</span>
          </div>
        </div>
        <button class="btn-speak" onclick="app.speak('${this.escapeAttr(word.word)}')" title="Phát âm">
          <span class="material-symbols-rounded">volume_up</span>
        </button>
      </div>

      <div class="wc-tags-row">
        <span class="wc-pos">${this.escapeHtml(word.partOfSpeech)}</span>
        <span class="wc-cat">${this.escapeHtml(word.category || 'General')}</span>
        <span class="cefr-badge ${cefr.toLowerCase()}">${cefr}</span>
      </div>

      <div class="md-section">
        <div class="md-sec-title">Nghĩa tiếng Việt</div>
        <div class="md-meaning">${this.escapeHtml(word.meaning)}</div>
      </div>

      ${word.definition ? `
        <div class="md-section">
          <div class="md-sec-title">Định nghĩa tiếng Anh</div>
          <div class="md-def">${this.escapeHtml(word.definition)}</div>
        </div>
      ` : ''}

      ${(word.examples && word.examples.length > 0) ? `
        <div class="md-section">
          <div class="md-sec-title">Ví dụ thực tế</div>
          <div class="md-examples-list">
            ${word.examples.map(ex => `
              <div class="md-ex-card">
                <span>"${this.escapeHtml(ex)}"</span>
                <button class="btn-icon" onclick="app.speak('${this.escapeAttr(ex)}')" title="Nghe câu">
                  <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary)">volume_up</span>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="md-actions-bar">
        <button class="btn btn-sm btn-primary" onclick="app.toggleLearned('${word.id}')">
          <span class="material-symbols-rounded">${word.learned ? 'check_circle' : 'radio_button_unchecked'}</span>
          ${word.learned ? 'Đã thành thạo' : 'Đánh dấu đã thuộc'}
        </button>
        <button class="btn btn-sm btn-secondary" onclick="app.toggleFavorite('${word.id}')">
          <span class="material-symbols-rounded">${word.favorite ? 'favorite' : 'favorite_border'}</span>
          ${word.favorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
        </button>
        <button class="btn btn-sm btn-secondary" onclick="app.editWord('${word.id}')">
          <span class="material-symbols-rounded">edit</span> Sửa từ
        </button>
        <button class="btn btn-sm btn-danger" onclick="app.deleteWord('${word.id}')">
          <span class="material-symbols-rounded">delete</span> Xóa
        </button>
      </div>
    `;

    document.getElementById('wordModal').classList.add('active');
    this.playSound('click');
  }

  refreshModal(id) {
    if (document.getElementById('wordModal').classList.contains('active')) {
      this.showWordDetail(id);
    }
  }

  // ---- UI Helpers ----
  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vocabmaster_theme', next);
    this.updateThemeLabels(next);
    this.playSound('click');

    // Update Three.js background theme
    if (window.threeBg) {
      window.threeBg.setTheme(next);
    }
  }

  updateThemeLabels(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }

  closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    this.confirmCallback = callback;
    document.getElementById('confirmDialog').classList.add('active');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="material-symbols-rounded">${icons[type] || 'info'}</span><span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  populateCategoryDatalist() {
    const categories = [...new Set(this.words.map(w => w.category).filter(Boolean))];
    const datalist = document.getElementById('categoryList');
    if (datalist) {
      datalist.innerHTML = categories.map(c => `<option value="${this.escapeHtml(c)}">`).join('');
    }
  }

  triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#6366F1', '#06B6D4', '#F59E0B', '#EF4444', '#10B981'];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 4 + 2,
        speedX: Math.random() * 4 - 2,
        rotation: Math.random() * 360
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.y += p.speedY; p.x += p.speedX; p.rotation += 2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (particles.some(p => p.y < canvas.height)) {
        this.confettiAnimationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    this.stopConfetti();
    this.confettiAnimationId = requestAnimationFrame(render);
  }

  stopConfetti() {
    if (this.confettiAnimationId) {
      cancelAnimationFrame(this.confettiAnimationId);
      this.confettiAnimationId = null;
    }
    const canvas = document.getElementById('confettiCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  escapeAttr(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }
}

// Global App Instance
const app = new VocabApp();


