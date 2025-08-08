# BPMN流程圖管理工具

這是一個基於 [bpmn-js](https://github.com/bpmn-io/bpmn-js) 的流程圖管理工具，使用 PHP 作為後端、SQLite 作為資料庫，並透過 jQuery AJAX 進行前後端互動。

## 功能特色

- 完整的用戶認證系統，包含登入與 2FA 驗證
- 流程圖編輯器，基於 bpmn-js 實現
- 流程圖儲存與管理功能
- 帳號密碼修改與 2FA 設定
- 暫存檔案機制，防止共同編輯時的衝突

## 安裝步驟

1. 確保您的環境已安裝 PHP 7.4 或更高版本，並啟用 SQLite 擴展
2. 複製或下載本專案到您的網頁伺服器目錄
3. 確保 `database` 資料夾具有寫入權限
4. 訪問網站，初次使用時會自動建立資料庫並設定初始管理員帳號

## 初始登入

初次使用，請使用以下資訊登入：

- 用戶名：admin
- 密碼：admin

> 登入後請立即修改密碼以確保安全。

## 目錄結構

```
/
├── api.php             # 後端 API
├── app.js              # 前端 JavaScript
├── database/           # SQLite 資料庫文件
└── index.html          # 公開訪問的前端文件
```

## 開發說明

本專案使用以下技術：

- 前端：HTML, CSS, JavaScript, jQuery, Bootstrap 5
- 後端：PHP 7.4+
- 資料庫：SQLite 3
- BPMN編輯器：bpmn-js

## 流程圖暫存機制

為了避免共同編輯時的衝突，本工具實現了流程圖暫存機制：

1. 編輯現有流程圖時，首先創建一個暫存副本
2. 所有修改都應用於暫存副本
3. 完成編輯後，可以選擇將暫存副本應用到原始流程圖
4. 若放棄編輯，暫存副本將不會影響原始流程圖

## 授權協議

本專案使用 MIT 授權協議。詳情請參閱 LICENSE 文件。

## 第三方庫

本專案使用了以下第三方庫：

- [bpmn-js](https://github.com/bpmn-io/bpmn-js) - 用於建模和顯示 BPMN 2.0 圖表
- [jQuery](https://jquery.com/) - JavaScript 工具庫
- [Bootstrap](https://getbootstrap.com/) - CSS 框架