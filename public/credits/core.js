/* 成大 EMBA 學分追蹤 — 共用引擎
   負責：完成狀態、localStorage 持久化、進度計算、備份/轉移代碼
   不負責畫面，畫面由各版本 HTML 自行 render，呼叫這裡的 API。 */

(function () {
  const LS_KEY = 'emba_credits_v1';

  // ---- base64url（支援中文）----
  function enc(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(b64) {
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(atob(b64)));
  }

  const State = {
    done: new Set(),     // 已完成 course id（數字 = 母清單；'x..' = 自訂）
    custom: [],          // [{id:'x0', n, c, k}]
    _customSeq: 0,

    load() {
      // 1) 網址帶備份連結優先（換手機情境）→ 不直接覆蓋，交給 UI 詢問
      const fromUrl = this._hashPayload();
      const raw = localStorage.getItem(LS_KEY);
      if (raw) this._apply(JSON.parse(raw));
      return fromUrl; // UI 可決定是否套用
    },

    _hashPayload() {
      const m = location.hash.match(/[#&](?:c|d)=([^&]+)/);
      if (!m) return null;
      try { return JSON.parse(dec(m[1])); } catch (e) { return null; }
    },

    _apply(obj) {
      if (!obj) return;
      this.done = new Set((obj.d || []).map(String));
      this.custom = obj.x || [];
      this._customSeq = this.custom.length
        ? Math.max(...this.custom.map(c => +String(c.id).slice(1))) + 1 : 0;
    },

    _payload() {
      return { v: 1, d: [...this.done], x: this.custom };
    },

    save() {
      localStorage.setItem(LS_KEY, JSON.stringify(this._payload()));
      window.dispatchEvent(new CustomEvent('tracker:change'));
    },

    toggle(id) {
      id = String(id);
      if (this.done.has(id)) this.done.delete(id); else this.done.add(id);
      this.save();
    },
    isDone(id) { return this.done.has(String(id)); },

    addCustom(name, cat, credit) {
      const id = 'x' + (this._customSeq++);
      this.custom.push({ id, n: name, c: cat, k: +credit || 0 });
      this.done.add(id);          // 新增即視為已修
      this.save();
      return id;
    },
    removeCustom(id) {
      this.custom = this.custom.filter(c => c.id !== id);
      this.done.delete(id);
      this.save();
    },

    // 所有課程（母清單 + 自訂）
    allCourses() {
      return [...window.COURSES, ...this.custom];
    },

    // ---- 進度計算 ----
    compute() {
      const all = this.allCourses();
      const byCat = {};
      window.CATEGORIES.forEach(cat => {
        byCat[cat.key] = { ...cat, done: 0, total: 0, courses: [] };
      });
      let totalDone = 0;
      all.forEach(c => {
        const bucket = byCat[c.c];
        if (!bucket) return;
        bucket.courses.push(c);
        bucket.total += c.k;
        if (this.isDone(c.id)) { bucket.done += c.k; totalDone += c.k; }
      });
      const gaps = window.CATEGORIES
        .map(cat => ({ key: cat.key, short: Math.max(0, cat.req - byCat[cat.key].done) }))
        .filter(g => g.short > 0);
      const remaining = Math.max(0, window.GRAD_TOTAL - totalDone);
      return {
        byCat, totalDone, gradTotal: window.GRAD_TOTAL,
        remaining, gaps,
        percent: Math.min(100, Math.round(totalDone / window.GRAD_TOTAL * 100)),
        graduated: remaining === 0 && gaps.length === 0,
      };
    },

    // ---- 備份 / 轉移 ----
    code() { return enc(JSON.stringify(this._payload())); },     // 短代碼字串
    backupLink() {                                               // 換手機用連結
      return location.origin + location.pathname + '#d=' + this.code();
    },
    importCode(str) {
      str = (str || '').trim();
      const m = str.match(/[#&](?:c|d)=([^&]+)/);   // 容許貼整條連結
      if (m) str = m[1];
      this._apply(JSON.parse(dec(str)));
      this.save();
    },
  };

  window.Tracker = State;
})();
