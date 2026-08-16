/* paper-digest 評価アプリの純ロジック (ブラウザ / Node 共用)。
 *
 * index.html (ブラウザ) と scripts/test_app_js.mjs (Node) の両方から使う。
 * ネットワーク・DOM・localStorage には触れない — 副作用のある部分は呼び出し側が持つ。
 *
 * 生成するファイルは Python 側の取り込み (src/notify/feedback_files.py の
 * parse_all / ingest_page_feedback) がそのまま解析できる形式にすること:
 *   本文中の `PDFB <like|meh|nope> <paper_id>` 行を全部拾う。
 *   `exp=YYYY-MM-DD` があれば期限切れ判定に使われる。
 */
(function (root) {
  "use strict";

  var RATINGS = ["like", "meh", "nope"];
  var RATING_LABEL = { like: "👍 興味あり", meh: "🤔 中間", nope: "👎 興味なし" };

  function isRating(r) { return RATINGS.indexOf(r) >= 0; }

  function slug(s) {
    var t = String(s == null ? "" : s).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    return t || "x";
  }

  /* 送信するファイルの本文。1 ファイルに複数論文をまとめる (Commit 相当 1 回)。
   * ratings: {paper_id: "like"|"meh"|"nope"}
   * titles:  {paper_id: "..."} (任意・コメントとして添える)
   */
  function feedbackBody(ratings, opts) {
    opts = opts || {};
    var ids = Object.keys(ratings || {}).filter(function (id) {
      return id && isRating(ratings[id]);
    });
    var lines = [
      "# paper-digest 評価アプリからの送信" + (opts.date ? " (" + opts.date + ")" : ""),
    ];
    // 送信時刻を必ず入れる。取り込み側 (feedback_files) は msg_id に
    // **ファイル内容の blob sha** を使うので、同じ評価をもう一度送ると
    // 「同じ内容 = 取り込み済み」と判定されて黙って捨てられる。
    // 1 行のタイムスタンプで毎回内容が変わるようにして、それを防ぐ。
    if (opts.sentAt) lines.push("# sent=" + opts.sentAt);
    if (opts.exp) lines.push("# exp=" + opts.exp);
    lines.push("");
    ids.forEach(function (id) {
      var t = String((opts.titles || {})[id] || "").replace(/[\r\n]+/g, " ").trim();
      if (t.length > 70) t = t.slice(0, 70) + "...";
      lines.push("PDFB " + ratings[id] + " " + id + (t ? "  # " + t : ""));
    });
    return lines.join("\n") + "\n";
  }

  /* 送信先パス。毎回ユニークにして PUT の sha 競合 (409) を避ける。
   *
   * ``stamp`` (送信時刻) を乱数より **前** に置くのが重要。取り込み側は
   * Contents API のディレクトリ一覧 (名前順) で処理するため、名前の並び順が
   * そのまま「どちらが後の評価か」になる。乱数が先だと同じ日の 2 回目の送信が
   * 1 回目に負けることがある。
   */
  function feedbackPath(dir, date, stamp, nonce) {
    return String(dir || "feedback").replace(/^\/+|\/+$/g, "") +
      "/fb-app-" + slug(date || "x") + "-" + slug(stamp || "0") +
      "-" + slug(nonce || "0") + ".md";
  }

  /* 未送信の評価だけを取り出す。
   * saved: {paper_id: {rating, sentAt|null}}
   */
  function unsentRatings(saved) {
    var out = {};
    Object.keys(saved || {}).forEach(function (id) {
      var e = saved[id];
      if (e && isRating(e.rating) && !e.sentAt) out[id] = e.rating;
    });
    return out;
  }

  function countUnsent(saved) { return Object.keys(unsentRatings(saved)).length; }

  /* 取得した digest JSON を表示用に正規化する。壊れたエントリは落とす。 */
  function normalizeDigest(json) {
    var d = json || {};
    var papers = (d.papers || []).filter(function (p) { return p && p.id && p.title; })
      .map(function (p) {
        return {
          id: String(p.id),
          title: String(p.title),
          journal: p.journal ? String(p.journal) : "",
          date: p.date ? String(p.date) : "",
          url: p.url ? String(p.url) : "",
          one_line: p.one_line ? String(p.one_line) : "",
          tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
          no_abstract: !!p.no_abstract,
        };
      });
    return { date: d.date ? String(d.date) : "", papers: papers,
             generated_at: d.generated_at ? String(d.generated_at) : "" };
  }

  /* GitHub Contents API の PUT ボディ。content は呼び出し側が base64 にして渡す。 */
  function putBody(base64Content, message, branch) {
    var b = { message: message, content: base64Content };
    if (branch) b.branch = branch;
    return b;
  }

  /* PAT の形をざっくり検証 (打ち間違い・空白混入を弾く。権限までは見ない)。 */
  function looksLikeToken(t) {
    t = String(t == null ? "" : t).trim();
    if (!t || /\s/.test(t)) return false;
    return /^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(t);
  }

  var api = {
    RATINGS: RATINGS, RATING_LABEL: RATING_LABEL, isRating: isRating, slug: slug,
    feedbackBody: feedbackBody, feedbackPath: feedbackPath,
    unsentRatings: unsentRatings, countUnsent: countUnsent,
    normalizeDigest: normalizeDigest, putBody: putBody,
    looksLikeToken: looksLikeToken,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PDApp = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
