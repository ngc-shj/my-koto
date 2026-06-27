// Static disaster-preparedness guide content, mirroring the 平常時の備え
// sections of the official 江東区防災ポータル. No data feed — these are
// editorial checklists and guidance. Koto-ku is largely zero-meter ground,
// so the water-disaster guidance leans on vertical evacuation and early
// action rather than only "head to a shelter".

// --- 非常持ち出し品 / 備蓄チェックリスト ---

export type ChecklistItem = {
  readonly id: string;
  readonly label: string;
  // Optional hint shown under the label.
  readonly note?: string;
};

export type ChecklistGroup = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly ChecklistItem[];
};

export const EMERGENCY_CHECKLIST: readonly ChecklistGroup[] = [
  {
    id: "carry",
    title: "非常持ち出し品 (すぐ持ち出す)",
    items: [
      { id: "water", label: "飲料水 (持ち出し用に 500ml 数本)" },
      { id: "food", label: "携行食 (栄養補助食品・乾パンなど)" },
      { id: "light", label: "懐中電灯・ヘッドライト" },
      { id: "radio", label: "携帯ラジオ (手回し充電式が安心)" },
      { id: "battery", label: "モバイルバッテリー・乾電池" },
      { id: "meds", label: "常備薬・お薬手帳のコピー" },
      { id: "cash", label: "現金 (小銭を多めに)" },
      { id: "copy", label: "身分証・保険証のコピー" },
      { id: "firstaid", label: "救急用品 (絆創膏・消毒・常用薬)" },
      { id: "hygiene", label: "簡易トイレ・ウェットティッシュ" },
    ],
  },
  {
    id: "stock",
    title: "家庭備蓄 (在宅避難用・最低3日, できれば1週間)",
    items: [
      { id: "stock-water", label: "飲料水 (1人1日3L × 日数)" },
      { id: "stock-food", label: "食料 (レトルト・缶詰・米など)" },
      { id: "stove", label: "カセットコンロ・ボンベ" },
      { id: "toilet", label: "携帯トイレ (1人1日5回 × 日数)" },
      { id: "wrap", label: "ラップ・ポリ袋・紙皿" },
      { id: "hygiene2", label: "衛生用品 (歯みがき・生理用品など)" },
      { id: "blanket", label: "毛布・防寒具・カイロ" },
    ],
  },
  {
    id: "household",
    title: "世帯に応じて追加",
    items: [
      { id: "baby", label: "乳児用品 (ミルク・おむつ・離乳食)" },
      { id: "senior", label: "高齢者・要配慮者の必要品" },
      { id: "pet", label: "ペット用品 (フード・水・キャリー)" },
      { id: "glasses", label: "眼鏡・補聴器の予備" },
    ],
  },
];

// --- ハザード別の行動指針 ---

export type HazardAction = {
  readonly id: string;
  readonly title: string;
  // Short emoji marker for visual scanning.
  readonly icon: string;
  readonly points: readonly string[];
};

export const HAZARD_ACTIONS: readonly HazardAction[] = [
  {
    id: "earthquake",
    title: "地震が起きたら",
    icon: "🟫",
    points: [
      "まず身の安全。机の下など頭を守れる場所へ。",
      "揺れがおさまったら火の始末。出火したら初期消火 (天井に火が回る前)。",
      "あわてて外に出ない。落下物・ガラスに注意。",
      "ブレーカーを落としてから避難 (通電火災の防止)。",
      "マンションでは無理に階段で降りず、まず在宅安全確認を。",
    ],
  },
  {
    id: "flood",
    title: "水害・台風に備える",
    icon: "🌊",
    points: [
      "江東区は海抜が低い地域が多い。ハザードマップで自宅の浸水想定を確認。",
      "浸水のおそれがあるときは『早めの』避難。道路冠水後の移動は危険。",
      "堅牢な建物では上階への垂直避難も有効な選択肢。",
      "キキクル (危険度分布) で雨の危険度を早めにチェック。",
      "側溝・マンホール付近は冠水時に見えず危険。歩く際は足元を棒で確認。",
    ],
  },
  {
    id: "typhoon",
    title: "台風が近づいたら",
    icon: "🌀",
    points: [
      "進路情報を確認し、暴風域に入る前に備えを完了させる。",
      "ベランダの飛散物を片付け、雨戸・カーテンを閉める。",
      "停電に備え、モバイルバッテリーを満充電に。",
      "高潮注意報・警報が出たら海・川・低地に近づかない。",
    ],
  },
];

// --- 避難の心得 ---

export type EvacuationNote = {
  readonly id: string;
  readonly term: string;
  readonly desc: string;
};

export const EVACUATION_NOTES: readonly EvacuationNote[] = [
  {
    id: "shelter-vs-area",
    term: "避難所と避難場所の違い",
    desc: "避難所は一定期間滞在して生活する施設。避難場所は大規模火災などから一時的に身を守る広い空間。目的が違うので両方を地図で確認しておく。",
  },
  {
    id: "when",
    term: "いつ避難するか",
    desc: "警戒レベル3で高齢者等は避難開始、レベル4で全員避難。レベル5は既に災害発生で安全な避難が難しい段階。レベル4までに行動を終える。",
  },
  {
    id: "where",
    term: "どこへ避難するか",
    desc: "必ずしも避難所とは限らない。安全な親戚・知人宅、安全な場所のホテル、自宅の上階 (垂直避難) も立派な避難先。ハザードの種類で適切な避難先は変わる。",
  },
  {
    id: "timeline",
    term: "マイ・タイムラインを作る",
    desc: "台風・大雨で『いつ・何をするか』を家族で事前に決めておく。避難に必要な時間を逆算し、警戒レベルごとの行動を紙に書いておくと迷わない。",
  },
];

// --- 公式防災ページへのリンク集 ---

export type OfficialLink = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly desc?: string;
};

export const OFFICIAL_LINKS: readonly OfficialLink[] = [
  {
    id: "portal",
    label: "江東区防災ポータル",
    url: "https://bosai.city.koto.lg.jp/",
    desc: "避難指示・ライフライン・運行情報などのリアルタイム情報",
  },
  {
    id: "hazardmap",
    label: "江東区 水害ハザードマップ",
    url: "https://www.city.koto.lg.jp/057101/bosai/iza/higaiyosoku/suigai-hazardmap.html",
    desc: "洪水・内水・高潮の浸水想定区域",
  },
  {
    id: "mansion",
    label: "江東区 マンション防災",
    url: "https://www.city.koto.lg.jp/057101/bosai/sonae/index.html",
    desc: "備蓄・在宅避難・マンションでの備え",
  },
  {
    id: "windflood",
    label: "江東区 風水害に備えましょう",
    url: "https://www.city.koto.lg.jp/057101/bosai/iza/fusuigai/index.html",
    desc: "台風・大雨時の行動と避難",
  },
  {
    id: "jma-kikukuru",
    label: "気象庁 キキクル (危険度分布)",
    url: "https://www.jma.go.jp/bosai/risk/",
    desc: "大雨・洪水・土砂災害のリアルタイム危険度",
  },
  {
    id: "nhk",
    label: "NHK そなえる防災",
    url: "https://www.nhk.or.jp/sonae/",
    desc: "備蓄・避難の総合的な解説",
  },
];
