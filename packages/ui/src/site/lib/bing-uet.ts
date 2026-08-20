const DEFAULT_BING_UET_ID = "343248795";

export function buildBingUetScript(tagId?: string): string {
  const resolvedId = tagId?.trim() || DEFAULT_BING_UET_ID;
  return `(function(w, d, t, u, o) {
  var retryIntervalMs = 100, attemptsRemaining = 50, retryScheduled = 0, initialized = 0;
  w[u] = w[u] || [], o.ts = (new Date).getTime();
  var n = d.createElement(t);
  function initializeUet() {
    if (initialized) return;
    try {
      var Ctor = w.UET;
      if (!Ctor) {
        if (attemptsRemaining > 0 && !retryScheduled) {
          attemptsRemaining -= 1;
          retryScheduled = 1;
          w.setTimeout(function() {
            retryScheduled = 0;
            initializeUet();
          }, retryIntervalMs);
        }
        return;
      }
      initialized = 1;
      o.q = w[u];
      w[u] = new Ctor(o);
      w[u].push("pageLoad");
      n.onload = n.onreadystatechange = null;
    } catch (e) {
      initialized = 1;
      n.onload = n.onreadystatechange = null;
    }
  }
  n.src = "https://bat.bing.net/bat.js?ti=" + o.ti + ("uetq" != u ? "&q=" + u : "");
  n.async = 1;
  n.onload = n.onreadystatechange = function() {
    var s = this.readyState;
    if (!s || "loaded" === s || "complete" === s) {
      initializeUet();
    }
  };
  var i = d.getElementsByTagName(t)[0];
  i.parentNode.insertBefore(n, i);
})(window, document, "script", "uetq", { ti: ${JSON.stringify(resolvedId)}, enableAutoSpaTracking: true });`;
}
