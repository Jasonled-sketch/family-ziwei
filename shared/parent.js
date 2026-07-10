/* =============================================================
   家庭命盤中心 · 親子相處引擎(specs/04-parent R1/R3/R4)
   純函式,不碰 DOM/Firestore;文案來源=shared/parent-rules.json
   UMD:瀏覽器掛 window.ZWPARENT(依賴 window.ZWSCORE);Node 走 require
   改邏輯必 bump PARENT_VERSION
   ============================================================= */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(require("./score.js")); }
  else { root.ZWPARENT = factory(root.ZWSCORE); }
}(typeof self !== "undefined" ? self : this, function (Z) {
  "use strict";

  var PARENT_VERSION = "2.1.0";

  /* ---------- R1 常數 ---------- */
  var FOCUS_PALACES = ["命宮", "官祿", "疾厄", "遷移"];
  var FOCUS_PRI = { "疾厄": 0, "命宮": 1, "官祿": 2, "遷移": 3 }; /* 同分優先 疾厄>命宮>官祿>遷移 */
  var HUA_ABS = { ji: 1.0, lu: 1.0, quan: 0.7, ke: 0.5 };         /* |T| */
  var HUA_PRI = { ji: 0, lu: 1, quan: 2, ke: 3 };                 /* 同宮同分 忌>祿>權>科 */
  var HUA_ZH = { lu: "祿", quan: "權", ke: "科", ji: "忌" };
  var HUA_KEYS = ["lu", "quan", "ke", "ji"];

  /* ---------- R1 ageBand:baby0-1/toddler2-5/child6-11/teen12+,生日當月換段 ---------- */
  function ageBandOf(birthDate, ym) {
    var by = parseInt(String(birthDate).slice(0, 4), 10);
    var bm = parseInt(String(birthDate).split("-")[1], 10);
    var y = parseInt(String(ym).slice(0, 4), 10);
    var m = parseInt(String(ym).slice(5, 7), 10);
    if (isNaN(by) || isNaN(bm) || isNaN(y) || isNaN(m)) return "child";
    var age = y - by - (m < bm ? 1 : 0); /* 生日當月即換段(m===bm 已算新歲) */
    if (age < 0) age = 0;
    if (age <= 1) return "baby";
    if (age <= 5) return "toddler";
    if (age <= 11) return "child";
    return "teen";
  }

  /* ---------- R1 focus:流月四化落點 |score| 最大者(限四宮) ----------
     starPalace = {星名: 標準宮名}(孩子本命盤;照 00-plan 引擎規則)
     回傳 {palace, hua, huaKey, star, score} | null ---------- */
  function focusOf(monthlyStem, starPalace) {
    var gh = Z.GANHUA[monthlyStem];
    if (!gh) return null;
    var best = null;
    HUA_KEYS.forEach(function (hk) {
      var star = gh[hk];
      var pn = starPalace[star];
      if (!pn || FOCUS_PALACES.indexOf(pn) < 0) return;
      var cand = { palace: pn, hua: HUA_ZH[hk], huaKey: hk, star: star, score: HUA_ABS[hk] };
      if (!best) { best = cand; return; }
      if (cand.score > best.score) { best = cand; return; }
      if (cand.score === best.score) {
        if (cand.palace === best.palace) {
          if (HUA_PRI[hk] < HUA_PRI[best.huaKey]) best = cand; /* 同宮多化:忌>祿>權>科 */
        } else if (FOCUS_PRI[cand.palace] < FOCUS_PRI[best.palace]) {
          best = cand; /* 同分不同宮:疾厄>命宮>官祿>遷移 */
        }
      }
    });
    return best;
  }

  /* ---------- R1 dadState ----------
     dims=六維(score.js 輸出;含嚴重忌);monthlyStem=爸流月干;starPalace=爸本命星→宮
     ①任一維紅或S≤-1→忌 ②全綠且S≥+1→祿 ③權入命/官祿→權 ④科入命/福德→科 ⑤平 ---------- */
  function dadStateOf(dims, monthlyStem, starPalace) {
    var anyRed = dims.some(function (d) { return d.light === "紅"; });
    var anyLow = dims.some(function (d) { return d.dim !== "嚴重忌" && d.score <= -1; });
    if (anyRed || anyLow) return "忌";
    var allGreen = dims.every(function (d) { return d.light === "綠"; });
    var anyHigh = dims.some(function (d) { return d.dim !== "嚴重忌" && d.score >= 1; });
    if (allGreen && anyHigh) return "祿";
    var gh = Z.GANHUA[monthlyStem] || {};
    var qp = starPalace[gh.quan], kp = starPalace[gh.ke];
    if (qp === "命宮" || qp === "官祿") return "權";
    if (kp === "命宮" || kp === "福德") return "科";
    return "平";
  }

  /* ---------- R3 爸×子交叉 10 模式(+兜底) ---------- */
  var MODES = {
    "忌×忌": { name: "休兵月", color: "紅", advice: "相處紅燈,降低期待只顧吃飽睡好,大事下月談;衝突時「暫停十分鐘」代替講贏" },
    "祿×祿": { name: "黃金月", color: "綠", advice: "存感情本,排一對一約會或家庭小旅行,拍照留存" },
    "忌×祿": { name: "借光月", color: "黃", advice: "讓孩子帶節奏跟他興趣走;低成本陪伴,他玩你在場就好" },
    "祿×忌": { name: "撐傘月", color: "黃", advice: "主動多給時間不說教只接住;挑好日子帶他吃愛吃的" },
    "權×權": { name: "兩頭牛月", color: "黃", advice: "分域授權——他的房間功課他管家規你管;吵架不當場分輸贏" },
    "權×忌": { name: "輕踩油門月", color: "黃", advice: "目標砍半只守底線,做到就收不加班" },
    "忌×權": { name: "讓位月", color: "黃", advice: "給任務不給指導讓他表現;只守安全底線,別因為累而否定他" },
    "科×忌": { name: "暖場月", color: "黃", advice: "儀式感修補——小紙條順路買點心,溫柔曝光不逼開口" },
    "科×科": { name: "亮相月", color: "綠", advice: "全家出席場合拍全家福;公開稱讚一次效果加倍" },
    "祿×科": { name: "亮相月", color: "綠", advice: "全家出席場合拍全家福;公開稱讚一次效果加倍" },
    "平×忌": { name: "值班月", color: "黃", advice: "固定出現比說話重要,準時接送晚餐同桌" }
  };
  var MODE_PLAIN = { name: "平常月", color: "綠", advice: "照本月建議正常互動即可" };
  var RED_LANDMINE = "這個月最忌:挑他毛病、翻舊帳、逼談未來。";
  /* 仲裁修正6:幼齡依模式色的安全建議(取代學齡語境的 mode.advice) */
  var YOUNG_MODE_ACTION = {
    "紅": "行程減量,顧好吃睡就好",
    "黃": "低成本陪伴:他玩,你在場就好",
    "綠": "排一次公園日或野餐,存感情本"
  };
  function crossMode(dadState, childHua) {
    var hua = childHua || "平";
    var m = MODES[dadState + "×" + hua];
    if (m) return m;
    if (hua === "忌") return MODES["平×忌"]; /* 子忌兜底=值班月 */
    return MODE_PLAIN;
  }

  /* ---------- v2 模式劇本查找(modes_script;鍵=組合字串;亮相月/平常月以 name 鍵,亮相月帶 keys 陣列) ---------- */
  function modeScriptOf(rules, comboKey, modeName) {
    var ms = rules && rules.modes_script;
    if (!ms) return null;
    if (ms[comboKey]) return ms[comboKey];
    var found = null;
    Object.keys(ms).forEach(function (k) {
      if (found) return;
      var e = ms[k];
      if (e.keys && e.keys.indexOf(comboKey) >= 0) found = e;
    });
    if (found) return found;
    /* 兜底組合(子忌兜底→值班月/其餘→平常月)以模式名對回 */
    Object.keys(ms).forEach(function (k) {
      if (found) return;
      if (ms[k].name === modeName) found = ms[k];
    });
    return found;
  }

  /* ---------- R5 月卡組裝(v2) ----------
     opts={star(前星), stars[](雙星), ageBand, focus|null, dadState, rules, monthIndex}
     v2:狀態行=status+「——」+why;actions=[r2.action,(大齡非紅:話術 優先 r2.say fallback s4.say)];
     模式劇本=modes_script(scene/do×2/dont)獨立區塊;r2 無 why/say 或無 modes_script → v1 行為(向下相容)
     語氣總則:幼齡(baby/toddler)無話術;紅燈月省略話術+地雷替換 */
  function monthCard(opts) {
    var rules = opts.rules;
    var childHua = opts.focus ? opts.focus.hua : null;
    var mode = crossMode(opts.dadState, childHua);
    var comboKey = opts.dadState + "×" + (childHua || "平");
    var isRed = (mode.color === "紅");
    var band = (opts.ageBand === "baby" || opts.ageBand === "toddler") ? "幼" : "大";
    /* 模式劇本只給大齡:劇本場景為學齡語境(成績/功課/補習),
       幼齡依 R1 語氣總則(只談作息健康陪伴發展)回落 v1 模式建議 */
    var script = (band === "大") ? modeScriptOf(rules, comboKey, mode.name) : null;
    var r2 = null;
    if (opts.focus && rules.r2[opts.focus.palace] && rules.r2[opts.focus.palace][opts.focus.hua]) {
      r2 = rules.r2[opts.focus.palace][opts.focus.hua][band] || null;
    }
    var s4 = rules.s4[opts.star] || null;
    var statusLine = r2
      ? (r2.why ? r2.status + "——" + r2.why : r2.status)
      : "流月四化未落相處重點宮位,整體平穩";
    var actions = [];
    if (band === "幼") {
      /* 仲裁修正6:幼齡不回落 R3 mode.advice(含功課/小紙條等學齡詞);
         actions=[R2 action]+依模式色一條幼齡安全建議,恰 2 條 */
      if (r2) actions.push(r2.action);
      actions.push(YOUNG_MODE_ACTION[mode.color] || YOUNG_MODE_ACTION["綠"]);
      if (actions.length < 2 && rules.activities_age) {
        actions.push(opts.ageBand === "baby" ? rules.activities_age.baby : rules.activities_age.toddler);
      }
      actions = actions.slice(0, 2);
    } else {
      if (r2) actions.push(r2.action);
      if (!script) actions.push(mode.advice); /* v1 rules 相容:無劇本時模式建議回到 actions */
      var sayText = (r2 && r2.say) ? r2.say : (s4 && s4.say ? s4.say : null);
      if (!isRed && sayText) actions.push("這樣說:" + sayText);
      actions = actions.slice(0, 3);
      /* 仲裁修正7:大齡 focus=null 且有劇本 → actions 至少 2 條(補 mode.advice) */
      if (actions.length < 2 && script) actions.push(mode.advice);
      if (!actions.length) actions.push(script && script.do && script.do[0] ? script.do[0] : "照日常節奏正常互動");
    }
    var landmine;
    if (isRed) {
      landmine = RED_LANDMINE;
    } else {
      var srcStars = (opts.stars && opts.stars.length) ? opts.stars : [opts.star];
      var avoids = srcStars.map(function (s) { return rules.s4[s] ? rules.s4[s].avoid : null; })
        .filter(function (x) { return !!x; });
      landmine = avoids.length ? avoids.join(";") : "少比較、少翻舊帳";
    }
    return {
      statusLine: statusLine, actions: actions, landmine: landmine,
      mode: mode, script: script || null,
      focus: opts.focus, ageBand: opts.ageBand, band: band, isRed: isRed
    };
  }

  /* ---------- v2 民俗育兒宜忌(folk) ----------
     monthAgeOf:月齡=(檢視年-出生年)×12+(檢視月-出生月);滿月當月=1
     folkOf(rules,ctx):ctx={ageBand, monthAge, focus, solarMonth, lunarMonth}
     回傳 {milestones:[folk], notes:[{folk,boost}], dayVeto:[folk]} ---------- */
  function monthAgeOf(birthDate, ym) {
    var by = parseInt(String(birthDate).slice(0, 4), 10);
    var bm = parseInt(String(birthDate).split("-")[1], 10);
    var y = parseInt(String(ym).slice(0, 4), 10);
    var m = parseInt(String(ym).slice(5, 7), 10);
    if (isNaN(by) || isNaN(bm) || isNaN(y) || isNaN(m)) return -1;
    return (y - by) * 12 + (m - bm);
  }
  function folkOf(rules, ctx) {
    var out = { milestones: [], notes: [], dayVeto: [] };
    var list = (rules && rules.folk) || [];
    var focusHit = !!(ctx.focus && ctx.focus.palace === "疾厄" && ctx.focus.hua === "忌");
    list.forEach(function (f) {
      if (!f.ageBand || f.ageBand.indexOf(ctx.ageBand) < 0) return;
      var t = f.rule && f.rule.type;
      if (t === "milestone") {
        if (ctx.monthAge === f.rule.monthAge) out.milestones.push(f);
      } else if (t === "dayVeto") {
        out.dayVeto.push(f);
      } else if (t === "monthVeto") {
        var alsoLunar7 = !!(f.rule.alsoFixed && ctx.lunarMonth === 7);
        if (focusHit) out.notes.push({ folk: f, boost: false });
        /* 仲裁修正9:僅因農曆七月觸發時,show 覆寫為 alsoFixed 文字 */
        else if (alsoLunar7) out.notes.push({ folk: f, boost: false, showOverride: f.rule.alsoFixed });
      } else if (t === "calendar") {
        var hit = (f.rule.months && f.rule.months.indexOf(ctx.solarMonth) >= 0) ||
                  (f.rule.lunarMonth && ctx.lunarMonth === f.rule.lunarMonth);
        if (hit) out.notes.push({ folk: f, boost: !!(f.rule.boost && focusHit) });
      } else {
        /* fixed / pickDay / examDay:固定顯示 */
        out.notes.push({ folk: f, boost: false });
      }
    });
    return out;
  }
  /* F05 夜間外出 dayVeto:child.jiIn 含遷移 或 child.out==紅 → 該日不入好日子 */
  function folkDayVetoHit(day) {
    return (day.child.jiIn.indexOf("遷移") >= 0) || (day.child.out === "紅");
  }

  /* ---------- R4 活動(主星→陪他做;baby 親膚版/toddler 公園共讀版;hint=S4 本月重點,雙星按月輪替) ---------- */
  function activityOf(star, ageBand, rules, monthIndex, stars) {
    if (ageBand === "baby") return rules.activities_age.baby;
    if (ageBand === "toddler") return rules.activities_age.toddler;
    var act = rules.activities[star] || "散步聊聊天";
    var hs = (stars && stars.length) ? stars : [star];
    var hstar = hs[(monthIndex || 0) % hs.length];
    var s4 = rules.s4[hstar];
    return "陪他:" + act + (s4 ? "(" + hstar + ":" + s4.focus + ")" : "");
  }

  /* ---------- R4 親子好日子 ----------
     days=[{date:"YYYY-MM-DD", dow:0-6,
       child:{S(五維S總和), out:"綠|黃|紅", health:"綠|黃|紅", jiIn:[命/疾/遷 中被流日忌直入的宮], luInMingQian:bool, light:"綠|黃|紅"(日總燈)},
       dad:{S, light, severePalace|null}}]
     候選:子流日無忌入命/疾/遷 且 外出+健康綠;爸非紅 且 嚴重忌不落疾/遷
     分=子S+爸S+週六日1.0+子祿入命/遷0.5;同分先週末再月中早者;top3
     不足3→放寬「雙方非紅」取最高3,relaxed=true ---------- */
  function goodDays(days) {
    function isWeekend(d) { return d.dow === 0 || d.dow === 6; }
    function scoreOf(d) {
      return Math.round((d.child.S + d.dad.S + (isWeekend(d) ? 1.0 : 0) + (d.child.luInMingQian ? 0.5 : 0)) * 100) / 100;
    }
    function rank(a, b) {
      if (b._s !== a._s) return b._s - a._s;
      var aw = isWeekend(a) ? 0 : 1, bw = isWeekend(b) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.date < b.date ? -1 : 1;
    }
    var strict = days.filter(function (d) {
      return !d.veto &&
        d.child.jiIn.length === 0 &&
        d.child.out === "綠" && d.child.health === "綠" &&
        d.dad.light !== "紅" &&
        d.dad.severePalace !== "疾厄" && d.dad.severePalace !== "遷移";
    });
    strict.forEach(function (d) { d._s = scoreOf(d); });
    strict.sort(rank);
    if (strict.length >= 3) {
      return { days: strict.slice(0, 3).map(pick), relaxed: false };
    }
    /* 放寬:雙方非紅(dayVeto 日仍排除),取最高 3 */
    var pool = days.filter(function (d) { return !d.veto && d.child.light !== "紅" && d.dad.light !== "紅"; });
    pool.forEach(function (d) { d._s = scoreOf(d); });
    pool.sort(rank);
    return { days: pool.slice(0, 3).map(pick), relaxed: true };
    function pick(d) { return { date: d.date, dow: d.dow, score: d._s }; }
  }

  return {
    PARENT_VERSION: PARENT_VERSION,
    FOCUS_PALACES: FOCUS_PALACES,
    RED_LANDMINE: RED_LANDMINE,
    ageBandOf: ageBandOf,
    focusOf: focusOf,
    dadStateOf: dadStateOf,
    crossMode: crossMode,
    modeScriptOf: modeScriptOf,
    monthCard: monthCard,
    monthAgeOf: monthAgeOf,
    folkOf: folkOf,
    folkDayVetoHit: folkDayVetoHit,
    activityOf: activityOf,
    goodDays: goodDays
  };
}));
