/* paper-digest 評価アプリの Service Worker。
 *
 * 役割は 2 つだけ:
 *   1. ホーム画面から**オフラインでも起動**できるよう、アプリ本体をキャッシュする
 *   2. アプリ更新時に古い殻が残らないよう、バージョンでキャッシュを捨てる
 *
 * 論文一覧 (digest/latest.json) と GitHub API は **キャッシュしない**。
 * 古い一覧を掴んだままだと「昨日の論文に評価を付けてしまう」ので、
 * ネットワーク優先とし、オフライン時は index.html 側が localStorage の
 * 直近データにフォールバックする (キャッシュの二重管理を避けるため)。
 *
 * CACHE を更新したいときは VERSION を上げること。
 */
var VERSION = "pd-app-v2";
var SHELL = [
  "./",
  "index.html",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // 別オリジン (GitHub API) と一覧 JSON は素通し = 常に最新を取りに行く
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/digest/") >= 0) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      // 殻はキャッシュ優先で即表示し、裏で更新する
      return hit || net;
    })
  );
});
