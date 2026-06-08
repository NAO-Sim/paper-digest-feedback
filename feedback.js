/* paper-digest 受付ページの判定ロジック (純関数・ブラウザ/Node 共用)。
 *
 * index.html (ブラウザ) と scripts/test_feedback_page_js.mjs (Node) の両方から使う。
 * 署名式は Python src/notify/feedback_files.py の _sig と一致させること:
 *   sig = sha256(`${p}|${r}|${exp}|${SALT}`).hexdigest()[:16]
 * SubtleCrypto / node:crypto でハッシュ計算は環境側が行い、本ファイルは
 * 「ハッシュ対象文字列の生成」と「分類 (classifyLink)」という純粋部分だけを持つ。
 */
(function (root) {
  "use strict";

  var SIG_SALT = "paper-digest-fb-v1";        // 非機密。改ざん/破損・期限検知用
  var RATINGS = ["like", "meh", "nope"];

  function slug(s) {
    var t = String(s == null ? "" : s).toLowerCase()
              .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    return t || "paper";
  }

  // 署名対象文字列 (この文字列を sha256 して先頭16hex を sig とする)
  function sigInput(p, r, exp) {
    return p + "|" + r + "|" + exp + "|" + SIG_SALT;
  }

  /* リンクを分類する純関数。
   * params: {p, r, exp, sig}
   * ctx:    {today: "YYYY-MM-DD", expectedSig: "<16hex>"}  expectedSig は呼び出し側が
   *         sha256(sigInput(...)).slice(0,16) を計算して渡す。
   * returns: {status, title, message}
   *   status: "ok" | "incomplete" | "badrating" | "invalid" | "expired"
   */
  function classifyLink(params, ctx) {
    params = params || {};
    ctx = ctx || {};
    var p = params.p, r = params.r, exp = params.exp, sig = params.sig;

    if (!p || !r) {
      return { status: "incomplete", title: "リンクが不完全です",
               message: "記事や評価の情報が URL に含まれていません。" };
    }
    if (RATINGS.indexOf(r) < 0) {
      return { status: "badrating", title: "評価値が不正です",
               message: "評価は like / meh / nope のいずれかである必要があります。" };
    }
    // exp/sig の欠落は不正リンク扱い (正規の配信リンクは必ず両方を持つ)。
    if (!exp || !sig) {
      return { status: "invalid", title: "リンクが無効です",
               message: "署名または有効期限が欠落しています。最新の配信メールから開き直してください。" };
    }
    if (String(ctx.expectedSig || "").toLowerCase() !== String(sig).toLowerCase()) {
      return { status: "invalid", title: "リンクが無効です",
               message: "リンクが壊れているか改変された可能性があります。" };
    }
    if (ctx.today && exp < ctx.today) {
      return { status: "expired", title: "リンクの有効期限が切れています",
               message: "このフィードバックリンクは " + exp + " で期限切れです。" };
    }
    return { status: "ok", title: "", message: "" };
  }

  var api = { SIG_SALT: SIG_SALT, RATINGS: RATINGS, slug: slug,
              sigInput: sigInput, classifyLink: classifyLink };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PDFB = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
