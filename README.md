# 家庭命盤中心(Phase 1 · 文字版)

以紫微斗數(開源 iztro 引擎)為家庭成員產生每日六維作息提醒的私人網頁。

- 前端:單檔 `index.html`(Vanilla JS,繁中,手機直式,深色)
- 評分引擎:`shared/score.js`(SCORE_VERSION 版控,唯一資料源)
- 文案規則庫:`shared/rules.json`(六維 × 四化 種子 50 條)
- 登入:Google 帳號 + Firestore 家庭授權名單(未授權者無法讀取任何資料)
- 部署:GitHub Actions → GitHub Pages

## 隱私
本 repo 不含任何個人出生資料。成員生辰僅存於受 Security Rules 保護的
Firestore,由管理員在網頁內建立;前端排盤全部在瀏覽器本機計算,不經任何第三方伺服器。

## 免責
本頁內容為作息提醒與生活建議,非醫療、投資或任何專業建議。
