// Static kanji→yomigana lookup table for the strings the app actually
// renders.  Populated by hand because:
//
// - Each label is short and stable; the cost of typing the reading once
//   is small
// - Ambient ja→かな libraries either need a dictionary download (kuroshiro,
//   sudachi) or use heuristics that misread proper nouns (運営者 →
//   うんえいしゃ vs うんえいもの…)
// - Static literals avoid touching the runtime CSP — no extra script-src
//   or font-src to widen
//
// New entries: add the source-of-truth label as the key with a hiragana
// reading. Strings that are already kana-only (ペットボトル, びん) are
// omitted on purpose so KanjiText falls back to plain text without ruby.

export const KANJI_READINGS: Record<string, string> = {
  // ─── Gomi categories (lib/gomi/types.ts GOMI_CATEGORY_LABELS) ───────
  燃やすごみ: "もやすごみ",
  燃やさないごみ: "もやさないごみ",
  資源プラスチック: "しげんぷらすちっく",
  容器包装プラスチック: "ようきほうそうぷらすちっく",
  粗大ごみ: "そだいごみ",

  // ─── Map layer labels (lib/map/registry.ts) ─────────────────────────
  公衆トイレ: "こうしゅうといれ",
  避難所: "ひなんじょ",
  避難場所: "ひなんばしょ",
  給水拠点: "きゅうすいきょてん",
  公園: "こうえん",
  図書館: "としょかん",
  児童館: "じどうかん",
  保育園: "ほいくえん",
  鉄道駅: "てつどうえき",
  地下鉄出入口: "ちかてついりぐち",
  病院: "びょういん",
  診療所: "しんりょうじょ",
  薬局: "やっきょく",
  // shortLabels — separate keys because the registry uses both the
  // long label (popup) and short label (filter chip)
  給水: "きゅうすい",
  駅: "えき",
  出入口: "いりぐち",

  // ─── Hazard categories (lib/map/types.ts HAZARD_LABELS) ─────────────
  洪水: "こうずい",
  "崖崩れ・土石流": "がけくずれ・どせきりゅう",
  高潮: "たかしお",
  地震: "じしん",
  津波: "つなみ",
  大規模火災: "だいきぼかさい",
  内水氾濫: "ないすいはんらん",
  火山現象: "かざんげんしょう",

  // ─── Area buckets in DistrictSelector ──────────────────────────────
  深川地域: "ふかがわちいき",
  城東地域: "じょうとうちいき",

  // ─── Common UI labels in /gomi calendar / weather / today ──────────
  当日: "とうじつ",
  翌日: "よくじつ",
  今日: "きょう",
  明日: "あした",
  週間: "しゅうかん",
  予報: "よほう",
  天気: "てんき",
  気温: "きおん",
  降水: "こうすい",
  最高気温: "さいこうきおん",
  最低気温: "さいていきおん",
  気象: "きしょう",
  気象警報: "きしょうけいほう",
  警報: "けいほう",
  注意報: "ちゅういほう",
  防災: "ぼうさい",
  防災情報: "ぼうさいじょうほう",
  降水確率: "こうすいかくりつ",
  暑さ指数: "あつさしすう",
  熱中症: "ねっちゅうしょう",
  危険度: "きけんど",
  注意: "ちゅうい",
  警戒: "けいかい",
  厳重警戒: "げんじゅうけいかい",
  危険: "きけん",
  予測: "よそく",
  観測所: "かんそくしょ",
  // Compound headings (KanjiText is exact-match lookup; keep these
  // explicit rather than wiring up a tokenizer that scans for sub-words)
  "天気・暑さ指数": "てんき・あつさしすう",
  "WBGT (暑さ指数 / 熱中症の危険度)": "WBGT (あつさしすう / ねっちゅうしょうのきけんど)",

  // ─── Brand / home page / common navigation ─────────────────────────
  江東区: "こうとうく",
  江東区中心: "こうとうくちゅうしん",
  "江東区（中心）": "こうとうく（ちゅうしん）",
  区民: "くみん",
  区民マップ: "くみんまっぷ",
  非公式: "ひこうしき",
  生活情報: "せいかつじょうほう",
  区主催: "くしゅさい",
  ゴミ収集: "ごみしゅうしゅう",
  収集日: "しゅうしゅうび",
  品目: "ひんもく",
  検索: "けんさく",
  設定: "せってい",
  通知: "つうち",
  表示: "ひょうじ",
  表示設定: "ひょうじせってい",
  中心: "ちゅうしん",
  出典: "しゅってん",
  取得: "しゅとく",
  取得日時: "しゅとくにちじ",
  最終: "さいしゅう",
  時刻: "じこく",
  運営: "うんえい",
  運用: "うんよう",
  個人: "こじん",
  // ─── Detail-panel labels in /gomi / /map ───────────────────────────
  選択中: "せんたくちゅう",
  地区: "ちく",
  選択中の地区: "せんたくちゅうのちく",
  詳細: "しょうさい",
  住所: "じゅうしょ",
  電話: "でんわ",
  利用可能時間: "りようかのうじかん",
  対応災害種別: "たいおうさいがいしゅべつ",
  // Accessibility badge labels
  時間: "じかん",
  "24時間": "にじゅうよじかん",

  // ─── Standalone single-kanji entries used by the tokenizer ─────────
  // (longest-match scan picks compound entries above first)
  選択: "せんたく",
  地域: "ちいき",
  地図: "ちず",
  地点: "ちてん",
  施設: "しせつ",
  公式: "こうしき",
  本日: "ほんじつ",

  // ─── Privacy / about / disclaimer prose ─────────────────────────────
  情報: "じょうほう",
  個人情報: "こじんじょうほう",
  位置情報: "いちじょうほう",
  健康情報: "けんこうじょうほう",
  端末: "たんまつ",
  保存: "ほぞん",
  処理: "しょり",
  使用: "しよう",
  通信: "つうしん",
  外部: "がいぶ",
  外部サービス: "がいぶさーびす",
  天気予報: "てんきよほう",
  地図タイル: "ちずたいる",
  解析: "かいせき",
  公衆便所: "こうしゅうべんじょ",
  免責: "めんせき",
  免責事項: "めんせきじこう",
  使用規約: "しようきやく",
  権利: "けんり",
  著作権: "ちょさくけん",
  著作権者: "ちょさくけんしゃ",
  // KanjiText is wrapped around full sentences in static prose; we cover
  // only the high-frequency proper nouns so the rest stays plain.
  本サービス: "ほんさーびす",
  位置: "いち",
  許可: "きょか",
  拒否: "きょひ",
  代用: "だいよう",
  代わり: "かわり",
  座標: "ざひょう",
  代表: "だいひょう",
  座標系: "ざひょうけい",
  日時: "にちじ",
  確認: "かくにん",
  実行: "じっこう",
  最新: "さいしん",
  履歴: "りれき",

  // ─── Push notification / cron status ───────────────────────────────
  購読: "こうどく",
  配信: "はいしん",
  通知時刻: "つうちじこく",
  購読情報: "こうどくじょうほう",
  // /status dashboard
  最終更新: "さいしゅうこうしん",
  最終更新時刻: "さいしゅうこうしんじこく",
  運用ステータス: "うんようすてーたす",
  違反: "いはん",
  違反レポート: "いはんれぽーと",
  対象: "たいしょう",
  対象日: "たいしょうび",
  試行: "しこう",
  成功: "せいこう",
  失効: "しっこう",
  失敗: "しっぱい",
  実行記録: "じっこうきろく",
  // ─── Calendar / day labels (gomi) ───────────────────────────────────
  月: "つき",
  火: "ひ",
  水: "みず",
  木: "き",
  金: "きん",
  土: "つち",
  日: "ひ",

  // ─── Events / map detail ───────────────────────────────────────────
  主催: "しゅさい",
  会場: "かいじょう",
  開催: "かいさい",
  開始: "かいし",
  終了: "しゅうりょう",
  参加: "さんか",
  申込: "もうしこみ",
  登録: "とうろく",
  // /events
  区主催イベント: "くしゅさいいべんと",
  // accessibility settings page
  // (already covered: 表示設定)

  // ─── Brand / footer-ish ────────────────────────────────────────────
  運営者: "うんえいしゃ",
  運営者情報: "うんえいしゃじょうほう",
};

// Returns the bound yomigana, or undefined when the source string has
// no entry (already kana / mixed Latin / numeric).
export function lookupReading(text: string): string | undefined {
  return KANJI_READINGS[text];
}

export type RubyToken = {
  // The substring to render. When `reading` is set we wrap it in <ruby>;
  // when omitted we emit it as plain text.
  text: string;
  reading?: string;
};

// Sorted dictionary keys, longest first. Computed once at module load so
// per-render tokenisation is just an array lookup, not a re-sort. Longest-
// first ordering means "厳重警戒" wins over "警戒" when the input contains
// the longer form.
const SORTED_KEYS = Object.keys(KANJI_READINGS).sort(
  (a, b) => b.length - a.length,
);

// Walk `text` from left to right and segment it into a stream of tokens —
// any prefix that matches a dictionary key becomes a ruby token, otherwise
// the next character extends the trailing plain-text token.  The output is
// stable enough to drive a React render directly.
export function tokenize(text: string): RubyToken[] {
  const tokens: RubyToken[] = [];
  let i = 0;
  while (i < text.length) {
    let matched: string | null = null;
    for (const key of SORTED_KEYS) {
      if (key.length === 0) continue;
      if (text.startsWith(key, i)) {
        matched = key;
        break;
      }
    }
    if (matched != null) {
      const reading = KANJI_READINGS[matched];
      if (reading) {
        tokens.push({ text: matched, reading });
        i += matched.length;
        continue;
      }
    }
    // No dictionary hit — extend the previous plain token, or start a new
    // one.  Building plain tokens character-by-character is fine because
    // tokenize() runs on short labels in practice.
    const last = tokens[tokens.length - 1];
    if (last && last.reading == null) {
      last.text += text[i];
    } else {
      tokens.push({ text: text[i] });
    }
    i += 1;
  }
  return tokens;
}
