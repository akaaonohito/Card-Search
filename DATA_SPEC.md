# cards.json データ仕様書

ポケモンカード サジェスト検索Webアプリで使用するカードデータ `cards.json` の仕様についてまとめます。

## ファイルの配置場所
`data/cards.json`

## データ構造
全体はJSONオブジェクトの配列（Array）として定義します。1つのオブジェクトが1種類のカードデータを表します。

```json
[
  {
    "id": "sv7a-068-064-ar-hagigishiri",
    "card_name": "ハギギシリ",
    "set_code": "sv7a",
    "collector_number": "068/064",
    "rarity": "AR",
    "set_name": "強化拡張パック 楽園ドラゴーナ",
    "keywords": [
      "ハギギシリ",
      "はぎぎしり",
      "hagigishiri",
      "sv7a",
      "068/064",
      "AR"
    ]
  }
]
```

## フィールド定義

### 必須項目
アプリが正常に検索および出力を行うために、各カードデータに最低限持たせる必要があるフィールドです。

| フィールド名 | 型 | 説明 | 例 |
|---|---|---|---|
| `id` | String | カードを一意に識別するID（英数字とハイフン推奨） | `"sv7a-068-064-ar-hagigishiri"` |
| `card_name` | String | カードの名称。出力文字列のベースになります。 | `"ハギギシリ"` |
| `set_code` | String | 収録パックのアルファベット・数字コード | `"sv7a"` |
| `collector_number` | String | コレクター番号 | `"068/064"` |
| `rarity` | String | レアリティ | `"AR"` |

### 任意項目
検索の精度を上げたり、将来の拡張に備えて追加できるフィールドです。

| フィールド名 | 型 | 説明 | 例 |
|---|---|---|---|
| `set_name` | String | 収録パックの正式名称など | `"強化拡張パック 楽園ドラゴーナ"` |
| `keywords` | Array of String | 検索でヒットさせたい別名やひらがな・ローマ字、英名などの配列 | `["はぎぎしり", "Bruxish"]` |
| `memo` | String | 備考用フィールド（現状はUI表示・検索には影響しません） | |

---

## 検索時の評価基準
アプリ上の検索窓にキーワードを入力した際、以下の優先度（スコア）で検索・並び替えが行われます。

1. **強い一致**
   - `set_code` の完全一致
   - `collector_number` の完全一致
   - `card_name` の完全一致
2. **中程度の一致**
   - `card_name` の前方一致
   - `collector_number` の部分一致
   - `keywords` 内のいずれかとの完全一致
3. **弱い一致**
   - `card_name` の部分一致
   - `set_name` の部分一致
   - `keywords` 内のいずれかとの部分一致
   - `rarity` の部分・完全一致

※同じスコアの場合は `set_code` 昇順 → `collector_number` 昇順 → `card_name` 昇順 に並びます。

---

## 今後の拡張予定
将来的に買取リスト作成やCSV出力機能を実装する際、以下のフィールドが追加される可能性があります。
- `condition` （状態）
- `count` （枚数）
- `price` / `buy_price` （販売金額 / 買取金額）
- `language` （言語）
- `image_url` （画像URL）
