# 搬家估價說明網頁

給搬家公司線上估價用的單頁說明：搬運條件、全屋彙總、各房間文字說明與照片。
純靜態、無框架，手機／桌機／紙本列印皆可用。

## 資料流

```
content/site.yaml ──build.py──> data/data.js ──> index.html
images/full/*.jpg ──tools/thumbs.py──> images/thumb/*.jpg
```

**你只需要編輯 `content/site.yaml` 與放照片到 `images/full/`。**

## 日常流程

```bash
# 1. 把照片放進 images/full/，檔名格式：<房間id>-<類型>-<編號>.jpg
#    類型為 layout（大格局）或 detail（細節）；整體平面圖用 overview-plan-01.jpg
# 2. 編輯 content/site.yaml 填文字與圖說
# 3. 開發（改檔自動 build、瀏覽器自動更新）
python3 tools/dev.py           # 開 http://localhost:8777
```

要出貨前產生一次完整檔案：`./build.sh`

`build.sh` 會檢查：

- YAML 宣告了但檔案不存在 → **錯誤**，中止
- 檔案存在但 YAML 沒提到 → 警告（提醒你補圖說）
- 缺縮圖 → 警告

## 開發 server

```bash
python3 tools/dev.py             # 預設 127.0.0.1:8777
python3 tools/dev.py --port 3000
```

| 改動 | 行為 |
| --- | --- |
| `assets/style.css` | 熱抽換樣式，不重整、不跳位 |
| `content/site.yaml` | 跑 `build.py` → 重整（保留捲動位置） |
| `images/full/*` | 跑 `thumbs.py`（增量）+ `build.py` → 重整 |
| `assets/app.js`、`index.html` | 重整 |

build 失敗時錯誤會直接蓋在畫面上，修好即自動消失；server 重啟後瀏覽器會自己接回來。
開發用腳本由 server 即時注入，不會寫進 `index.html`，部署出去的檔案是乾淨的。

## YAML 重點

| 項目 | 寫法 |
| --- | --- |
| 說明文字 | `notes:` 底下一行一個 bullet；要子項就寫 `標題:` 再縮排列出 |
| 圖片 | `layout:` / `detail:` 底下**只寫圖說**，檔名依順序自動組成 |
| 指定編號 | 寫成 `- 5: 圖說` → `<房間>-<類型>-05.jpg`，之後接續 06 |
| 物品 | `[名稱, 數量, 尺寸, 備註]`；尺寸寫 `長×寬×高cm` 會自動算材積 |
| 標準容器 | 尺寸填「標準箱」(60×40×40)、「標準吊衣箱」(50×50×100) 也會計入材積 |
| 紙箱歸類 | 品項名稱含「箱」字者，統計時與家具家電分開 |

圖說中若要用半形冒號，請用引號包起來：`- "抽屜: 線材"`。

## 頁面功能

- **縮圖／原圖切換**：預設縮圖（長邊 1000px）加快開啟；選擇會記在瀏覽器
- **點圖放大**：一律載入原圖，可用 ← → 切換、Esc 關閉
- **細節照片**：桌機預設展開、手機預設收合，可一鍵全展開／全收合
- **列印／存 PDF**：按鈕會先切換成原圖、等圖片載入完成才叫出列印，避免印出空白圖；
  每個房間自動分頁，照片兩欄排列
- **全屋彙總**：件數、紙箱數、材積由各房間物品清單自動加總

## 換成真實照片

```bash
rm images/full/*.jpg images/thumb/*.jpg   # 清掉假圖
rm tools/gen_placeholders.py              # 假圖產生器不再需要
# 放入真實照片後
./build.sh
```

手機直拍的照片會由 `thumbs.py` 自動依 EXIF 轉正。

## 部署

```bash
npx surge . your-project-name.surge.sh
```

整包（含 `images/full/`）直接上傳即可，沒有後端。
若照片很多，建議先確認 `images/full/` 總大小；縮圖已壓到約原圖的 30%。

## 需求

Python 3 + PyYAML + Pillow（本機皆已安裝），不需 npm 套件、不需 ImageMagick。
