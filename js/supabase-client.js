// ==========================================================================
// VocabMaster - Supabase Client & Cloud Sync Engine
// Real-time PostgreSQL, RLS Authentication, Spaced Repetition (SRS), Edge Functions
// ==========================================================================

class SupabaseService {
  constructor() {
    this.client = null;
    this.currentUser = null;
    this.isConfigured = false;
    this.isSyncing = false;

    // Load stored config or default placeholders
    this.supabaseUrl = localStorage.getItem('vocabmaster_sb_url') || '';
    this.supabaseKey = localStorage.getItem('vocabmaster_sb_key') || '';

    this.init();
  }

  init() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        });
        this.isConfigured = true;
        this.checkSession();
      } catch (err) {
        console.warn("Could not initialize Supabase client:", err);
      }
    }
  }

  configure(url, key) {
    if (!url || !key) return false;
    this.supabaseUrl = url.trim();
    this.supabaseKey = key.trim();
    localStorage.setItem('vocabmaster_sb_url', this.supabaseUrl);
    localStorage.setItem('vocabmaster_sb_key', this.supabaseKey);

    if (window.supabase) {
      this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
      this.isConfigured = true;
      this.checkSession();
      return true;
    }
    return false;
  }

  async checkSession() {
    if (!this.client) return null;
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (session) {
        this.currentUser = session.user;
        this.updateAuthUI(this.currentUser);
        this.syncFromCloud();
      } else {
        this.currentUser = null;
        this.updateAuthUI(null);
      }
      return session;
    } catch (e) {
      console.warn("Session check failed:", e);
      return null;
    }
  }

  // ---- Auth API ----
  async signUp(email, password, fullName = '') {
    if (!this.client) throw new Error("Supabase chưa được cấu hình!");
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) throw error;
    if (data.user) {
      this.currentUser = data.user;
      this.updateAuthUI(data.user);
    }
    return data;
  }

  async signIn(email, password) {
    if (!this.client) throw new Error("Supabase chưa được cấu hình!");
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    if (data.user) {
      this.currentUser = data.user;
      this.updateAuthUI(data.user);
      await this.syncFromCloud();
    }
    return data;
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.currentUser = null;
    this.updateAuthUI(null);
  }

  // ---- Database Queries ----
  async fetchWords() {
    if (!this.client) return null;
    try {
      const { data: words, error } = await this.client
        .from('words')
        .select(`
          *,
          word_examples (*),
          word_relations (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Also fetch progress for current user if logged in
      let progressMap = new Map();
      if (this.currentUser) {
        const { data: progress } = await this.client
          .from('user_word_progress')
          .select('*')
          .eq('user_id', this.currentUser.id);

        if (progress) {
          progress.forEach(p => progressMap.set(p.word_id, p));
        }
      }

      // Map to standard frontend object format
      return words.map(w => {
        const userProg = progressMap.get(w.id) || {};
        const synonyms = (w.word_relations || []).filter(r => r.relation_type === 'synonym').map(r => r.related_text);
        const antonyms = (w.word_relations || []).filter(r => r.relation_type === 'antonym').map(r => r.related_text);
        const collocations = (w.word_relations || []).filter(r => r.relation_type === 'collocation').map(r => r.related_text);
        const examples = (w.word_examples || []).map(e => e.sentence);

        return {
          id: w.id,
          word: w.word,
          phonetic: w.phonetic,
          phoneticUk: w.phonetic_uk,
          phoneticUs: w.phonetic_us,
          partOfSpeech: w.part_of_speech,
          meaning: w.meaning,
          definition: w.definition,
          category: w.category_name,
          level: w.level,
          cefr: w.cefr,
          memoryTip: w.memory_tip,
          examples: examples.length > 0 ? examples : (w.examples || []),
          synonyms: synonyms,
          antonyms: antonyms,
          collocations: collocations,
          learned: !!userProg.is_learned,
          favorite: !!userProg.is_favorite,
          srsStage: userProg.srs_stage || 0,
          nextReviewAt: userProg.next_review_at || null,
          createdAt: w.created_at
        };
      });
    } catch (e) {
      console.warn("fetchWords error:", e);
      return null;
    }
  }

  async saveWordToCloud(wordObj) {
    if (!this.client || !this.currentUser) return null;
    try {
      const { data: wordRecord, error: wordErr } = await this.client
        .from('words')
        .upsert({
          user_id: this.currentUser.id,
          word: wordObj.word.trim().toLowerCase(),
          phonetic: wordObj.phonetic,
          phonetic_uk: wordObj.phoneticUk || wordObj.phonetic,
          phonetic_us: wordObj.phoneticUs || wordObj.phonetic,
          part_of_speech: wordObj.partOfSpeech,
          meaning: wordObj.meaning,
          definition: wordObj.definition,
          category_name: wordObj.category || 'general',
          level: wordObj.level || 'intermediate',
          cefr: wordObj.cefr || 'B2',
          memory_tip: wordObj.memoryTip,
          is_public: false
        })
        .select()
        .single();

      if (wordErr) throw wordErr;

      // Insert examples
      if (wordObj.examples && wordObj.examples.length > 0) {
        const exampleInserts = wordObj.examples.map(ex => ({
          word_id: wordRecord.id,
          sentence: ex
        }));
        await this.client.from('word_examples').insert(exampleInserts);
      }

      return wordRecord;
    } catch (err) {
      console.error("saveWordToCloud error:", err);
      throw err;
    }
  }

  async updateProgressCloud(wordId, isLearned, isFavorite) {
    if (!this.client || !this.currentUser) return;
    try {
      await this.client
        .from('user_word_progress')
        .upsert({
          user_id: this.currentUser.id,
          word_id: wordId,
          is_learned: isLearned,
          is_favorite: isFavorite,
          last_reviewed_at: new Date().toISOString()
        }, { onConflict: 'user_id,word_id' });
    } catch (e) {
      console.warn("updateProgressCloud error:", e);
    }
  }

  async recordSrsReviewCloud(wordId, quality) {
    if (!this.client || !this.currentUser) return null;
    try {
      const { data, error } = await this.client.rpc('calculate_srs_review', {
        p_user_id: this.currentUser.id,
        p_word_id: wordId,
        p_quality: quality
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("recordSrsReviewCloud error:", e);
      return null;
    }
  }

  async saveQuizSessionCloud(quizData) {
    if (!this.client || !this.currentUser) return;
    try {
      const { data: session, error } = await this.client
        .from('quiz_sessions')
        .insert({
          user_id: this.currentUser.id,
          quiz_mode: quizData.mode,
          score: quizData.score,
          total_questions: quizData.totalQuestions,
          duration_seconds: quizData.duration || 0,
          max_streak: quizData.maxStreak || 0
        })
        .select()
        .single();

      if (error) throw error;
      return session;
    } catch (e) {
      console.warn("saveQuizSessionCloud error:", e);
    }
  }

  // ---- Sync Engine ----
  async syncFromCloud() {
    if (!this.client || !this.currentUser || this.isSyncing) return;
    this.isSyncing = true;
    this.setSyncStatus('syncing', 'Đang đồng bộ đám mây...');

    try {
      const cloudWords = await this.fetchWords();
      if (cloudWords && cloudWords.length > 0) {
        // Merge with local words
        const localWords = app.words || [];
        const mergedMap = new Map();

        // 1. Put local words first
        localWords.forEach(w => mergedMap.set(w.word.toLowerCase(), w));

        // 2. Override / Add cloud words
        cloudWords.forEach(cw => mergedMap.set(cw.word.toLowerCase(), cw));

        app.words = Array.from(mergedMap.values());
        app.saveData();
        app.renderPage(app.currentPage);
      }
      this.setSyncStatus('synced', 'Đã đồng bộ Supabase Cloud ✓');
    } catch (e) {
      this.setSyncStatus('error', 'Lỗi đồng bộ đám mây');
    } finally {
      this.isSyncing = false;
    }
  }

  async syncToCloud() {
    if (!this.client || !this.currentUser || this.isSyncing) return;
    this.isSyncing = true;
    this.setSyncStatus('syncing', 'Đang tải dữ liệu lên Supabase...');

    try {
      // Call Edge Function or batch insert
      const wordsToSync = app.words.map(w => ({
        word: w.word,
        phonetic: w.phonetic,
        part_of_speech: w.partOfSpeech,
        meaning: w.meaning,
        definition: w.definition,
        category_name: w.category,
        level: w.level,
        cefr: w.cefr,
        memory_tip: w.memoryTip,
        examples: w.examples,
        is_learned: w.learned,
        is_favorite: w.favorite
      }));

      const { data, error } = await this.client.functions.invoke('sync-vocab-batch', {
        body: { words: wordsToSync }
      });

      if (error) {
        // Fallback to direct client inserts
        for (const w of app.words) {
          await this.saveWordToCloud(w);
        }
      }

      this.setSyncStatus('synced', 'Đã lưu toàn bộ lên Cloud ✓');
    } catch (e) {
      console.warn("syncToCloud error:", e);
      this.setSyncStatus('error', 'Lỗi tải lên Cloud');
    } finally {
      this.isSyncing = false;
    }
  }

  // ---- UI Helpers ----
  updateAuthUI(user) {
    const authBtn = document.getElementById('btnAuthWidget');
    const syncPill = document.getElementById('cloudSyncStatus');

    if (user) {
      if (authBtn) {
        authBtn.innerHTML = `
          <span class="material-symbols-rounded">account_circle</span>
          <span class="nav-text">${user.email.split('@')[0]}</span>
        `;
        authBtn.title = `Đang đăng nhập: ${user.email} (Bấm để quản lý)`;
      }
      this.setSyncStatus('synced', 'Đã kết nối Supabase Cloud ✓');
    } else {
      if (authBtn) {
        authBtn.innerHTML = `
          <span class="material-symbols-rounded">cloud_off</span>
          <span class="nav-text">Chế độ Offline / Đăng nhập</span>
        `;
        authBtn.title = 'Bấm để đăng nhập hoặc cấu hình Supabase';
      }
      this.setSyncStatus('local', 'Lưu trữ cục bộ (Local)');
    }
  }

  setSyncStatus(status, label) {
    const pill = document.getElementById('cloudSyncStatus');
    if (!pill) return;

    pill.className = `sync-status-pill ${status}`;
    pill.innerHTML = `
      <span class="sync-dot"></span>
      <span class="sync-label">${label}</span>
    `;
  }
}

// Global Supabase Instance
const sbService = new SupabaseService();
