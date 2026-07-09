/* =============================================================
   家庭命盤中心 · 評分引擎(唯一資料源)
   spec:00-plan「評分公式定稿」逐字實作;改公式必 bump SCORE_VERSION
   UMD:瀏覽器掛 window.ZWSCORE;Node 走 module.exports(單元測試/cron 用)
   輸入不含任何個資:只吃「12 宮星曜表 + 各層天干」
   ============================================================= */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.ZWSCORE = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCORE_VERSION = "1.0.0";

  /* ---------- 十天干四化表(與 ziwei-learn GANHUA 同源) ---------- */
  var GANHUA = {
    "甲": { lu: "廉貞", quan: "破軍", ke: "武曲", ji: "太陽" },
    "乙": { lu: "天機", quan: "天梁", ke: "紫微", ji: "太陰" },
    "丙": { lu: "天同", quan: "天機", ke: "文昌", ji: "廉貞" },
    "丁": { lu: "太陰", quan: "天同", ke: "天機", ji: "巨門" },
    "戊": { lu: "貪狼", quan: "太陰", ke: "右弼", ji: "天機" },
    "己": { lu: "武曲", quan: "貪狼", ke: "天梁", ji: "文曲" },
    "庚": { lu: "太陽", quan: "武曲", ke: "太陰", ji: "天同" },
    "辛": { lu: "巨門", quan: "太陽", ke: "文曲", ji: "文昌" },
    "壬": { lu: "天梁", quan: "紫微", ke: "左輔", ji: "武曲" },
    "癸": { lu: "破軍", quan: "巨門", ke: "太陰", ji: "貪狼" }
  };

  /* ---------- 定稿常數 ---------- */
  /* 層級權重 W:生年2.0/大限1.5/流年1.0/流月1.0/流日1.0 */
  var W = { natal: 2.0, decadal: 1.5, yearly: 1.0, monthly: 1.0, daily: 1.0 };
  /* 四化係數 T:忌-1.0/祿+1.0/權+0.7/科+0.5 */
  var T = { ji: -1.0, lu: 1.0, quan: 0.7, ke: 0.5 };
  var LAYERS = ["natal", "decadal", "yearly", "monthly", "daily"];
  var LAYER_ZH = { natal: "生年", decadal: "大限", yearly: "流年", monthly: "流月", daily: "流日" };
  var HUAS = ["lu", "quan", "ke", "ji"];
  var HUA_ZH = { lu: "祿", quan: "權", ke: "科", ji: "忌" };

  /* 標準宮名(iztro「僕役」→ 規格「交友」) */
  var PALACE_ALIAS = { "僕役": "交友", "仆役": "交友", "奴僕": "交友", "友屬": "交友" };
  var PALACE_ORDER = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "交友", "官祿", "田宅", "福德", "父母"];
  /* 對宮(六沖,宮名固定對映,與陣列順序無關) */
  var OPP_PALACE = {
    "命宮": "遷移", "遷移": "命宮",
    "兄弟": "交友", "交友": "兄弟",
    "夫妻": "官祿", "官祿": "夫妻",
    "子女": "田宅", "田宅": "子女",
    "財帛": "福德", "福德": "財帛",
    "疾厄": "父母", "父母": "疾厄"
  };
  /* 六維映射:事業=官祿/財運=財帛/外出=遷移/朋友=交友/健康=疾厄(嚴重忌=全盤F最大宮另計) */
  var DIM_PALACE = { "事業": "官祿", "財運": "財帛", "外出": "遷移", "朋友": "交友", "健康": "疾厄" };
  var DIMS = ["事業", "財運", "外出", "朋友", "健康"];

  function normPalace(name) {
    var n = String(name || "").replace(/宮$/, "");
    if (n === "命") n = "命宮";
    return PALACE_ALIAS[n] || n;
  }

  /* 燈號(先紅後黃):紅=F≥3.0 或 S≤-2.0;黃=F≥1.5 或 S<0;綠=其餘 */
  function lightOf(S, F) {
    if (F >= 3.0 || S <= -2.0) return "紅";
    if (F >= 1.5 || S < 0) return "黃";
    return "綠";
  }

  /* -------------------------------------------------------------
     computeScores(input)
     input = {
       palaces: [{name:"官祿", stars:["天府","文昌",...]}, ...×12],  // 本命盤(主星+輔星全放)
       stems:   {natal:"戊", decadal:"甲", yearly:"丙", monthly:"甲", daily:"甲"}  // 缺層自動略過
     }
     output = {
       version,
       palaces: { 宮名: {S, F, jiLayers:[layer], jiOppLayers:[layer], hits:[{layer,hua,star,via}]} },
       dims:    [{dim, score, F, light, palace}] ×6(含嚴重忌),
       severe:  {palace, F, light, stack} | null
     }
     ------------------------------------------------------------- */
  function computeScores(input) {
    var palaces = (input && input.palaces) || [];
    var stems = (input && input.stems) || {};

    /* 星 → 宮 索引 */
    var starPalace = {};
    var acc = {};
    palaces.forEach(function (p) {
      var pn = normPalace(p.name);
      acc[pn] = { S: 0, F: 0, jiLayers: [], jiOppLayers: [], hits: [] };
      (p.stars || []).forEach(function (st) { starPalace[String(st)] = pn; });
    });
    PALACE_ORDER.forEach(function (pn) { if (!acc[pn]) acc[pn] = { S: 0, F: 0, jiLayers: [], jiOppLayers: [], hits: [] }; });

    /* 1+2. 宮位綜合分 S(宮)=Σ(W×T);疊忌分 F(宮)=Σ W(只累忌,正值;對宮沖×0.5) */
    LAYERS.forEach(function (layer) {
      var stem = stems[layer];
      if (!stem) return;
      var gh = GANHUA[stem];
      if (!gh) return;
      HUAS.forEach(function (hua) {
        var star = gh[hua];
        var pn = starPalace[star];
        if (!pn || !acc[pn]) return; /* 星未入盤 → 不計 */
        acc[pn].S += W[layer] * T[hua];
        acc[pn].hits.push({ layer: layer, hua: hua, star: star, via: "direct" });
        if (hua === "ji") {
          acc[pn].F += W[layer];
          acc[pn].jiLayers.push(layer);
          /* 忌落對宮沖本宮:本宮加 W×(-0.5);祿權科不計沖;F 對宮沖×0.5 */
          var opp = OPP_PALACE[pn];
          if (opp && acc[opp]) {
            acc[opp].S += W[layer] * (-0.5);
            acc[opp].F += W[layer] * 0.5;
            acc[opp].jiOppLayers.push(layer);
            acc[opp].hits.push({ layer: layer, hua: hua, star: star, via: "opp" });
          }
        }
      });
    });

    /* 浮點整理(避免 0.1+0.2 噪音) */
    Object.keys(acc).forEach(function (pn) {
      acc[pn].S = Math.round(acc[pn].S * 100) / 100;
      acc[pn].F = Math.round(acc[pn].F * 100) / 100;
    });

    /* 4. 六維映射 */
    var dims = DIMS.map(function (dim) {
      var pn = DIM_PALACE[dim];
      var a = acc[pn];
      return { dim: dim, score: a.S, F: a.F, light: lightOf(a.S, a.F), palace: pn };
    });

    /* 嚴重忌=全盤F最大宮(附宮名);全盤無忌 → 無嚴重忌(綠) */
    var maxPn = null, maxF = 0;
    PALACE_ORDER.forEach(function (pn) {
      var a = acc[pn];
      if (a.F > maxF ||
          (a.F === maxF && maxF > 0 && maxPn && a.jiLayers.length > (acc[maxPn].jiLayers.length))) {
        maxF = a.F; maxPn = pn;
      }
    });
    var severe = null;
    if (maxPn && maxF > 0) {
      var sa = acc[maxPn];
      severe = {
        palace: maxPn, F: sa.F,
        light: lightOf(sa.S, sa.F),
        stack: detectStack(acc, maxPn)
      };
    }
    dims.push({
      dim: "嚴重忌",
      score: maxPn ? acc[maxPn].S : 0,
      F: maxF,
      light: severe ? severe.light : "綠",
      palace: maxPn
    });

    return { version: SCORE_VERSION, palaces: acc, dims: dims, severe: severe };
  }

  /* -------------------------------------------------------------
     嚴重忌疊法偵測(對應 rules.json trigger.stack;優先序:三疊 > 生年+流日 > 流月+流日 > 流日沖生年)
     回傳 {key, stack:[...], palace} | null
     ------------------------------------------------------------- */
  function detectStack(acc, palace) {
    function has(pn, layer) { return acc[pn] && acc[pn].jiLayers.indexOf(layer) >= 0; }
    /* 三疊(生年+流月+流日 同宮) */
    for (var i = 0; i < PALACE_ORDER.length; i++) {
      var pn = PALACE_ORDER[i];
      if (has(pn, "natal") && has(pn, "monthly") && has(pn, "daily"))
        return { key: "triple", stack: ["生年忌", "流月忌", "流日忌"], palace: pn };
    }
    for (var j = 0; j < PALACE_ORDER.length; j++) {
      var p2 = PALACE_ORDER[j];
      if (has(p2, "natal") && has(p2, "daily"))
        return { key: "natal_daily", stack: ["生年忌", "流日忌"], palace: p2 };
    }
    for (var k = 0; k < PALACE_ORDER.length; k++) {
      var p3 = PALACE_ORDER[k];
      if (has(p3, "monthly") && has(p3, "daily"))
        return { key: "monthly_daily", stack: ["流月忌", "流日忌"], palace: p3 };
    }
    /* 流日忌沖對宮之生年忌:流日忌在 X,生年忌在 OPP(X) → 受沖宮=OPP(X) */
    for (var m = 0; m < PALACE_ORDER.length; m++) {
      var p4 = PALACE_ORDER[m];
      if (has(p4, "daily") && has(OPP_PALACE[p4], "natal"))
        return { key: "daily_chong_natal", stack: ["流日忌沖", "生年忌"], palace: OPP_PALACE[p4] };
    }
    return null;
  }

  /* -------------------------------------------------------------
     5. 防疲勞封頂:單人單月紅燈>4天 → 僅留 F 最高 4 天為紅,其餘降黃
     days = [{date:"YYYY-MM-DD", light:"紅|黃|綠", F:number}](同一人同一月)
     回傳新陣列(不改原件),被降級者 light="黃"、capped=true
     同 F 並列:日期早者優先保留紅
     ------------------------------------------------------------- */
  var RED_CAP_PER_MONTH = 4;
  function applyFatigueCap(days) {
    var out = days.map(function (d) {
      return { date: d.date, light: d.light, F: d.F, capped: false };
    });
    var reds = out.filter(function (d) { return d.light === "紅"; });
    if (reds.length <= RED_CAP_PER_MONTH) return out;
    reds.sort(function (a, b) { return (b.F - a.F) || (a.date < b.date ? -1 : 1); });
    var keep = {};
    reds.slice(0, RED_CAP_PER_MONTH).forEach(function (d) { keep[d.date] = true; });
    out.forEach(function (d) {
      if (d.light === "紅" && !keep[d.date]) { d.light = "黃"; d.capped = true; }
    });
    return out;
  }

  return {
    SCORE_VERSION: SCORE_VERSION,
    GANHUA: GANHUA,
    W: W, T: T,
    LAYERS: LAYERS, LAYER_ZH: LAYER_ZH, HUAS: HUAS, HUA_ZH: HUA_ZH,
    PALACE_ORDER: PALACE_ORDER, OPP_PALACE: OPP_PALACE,
    DIM_PALACE: DIM_PALACE, DIMS: DIMS,
    RED_CAP_PER_MONTH: RED_CAP_PER_MONTH,
    normPalace: normPalace,
    lightOf: lightOf,
    computeScores: computeScores,
    applyFatigueCap: applyFatigueCap
  };
}));
