export type DatasetAttribution = {
  id: string;
  name: string;
  copyrightHolder: string;
  licenseUrl: string;
  licenseLabel: string;
  sourceUrl: string;
  modified: boolean;
};

// Structured attribution data for all datasets used in this application.
// Every rendering path (UI, ICS, JSON export) must reference this list.
export const ATTRIBUTIONS: DatasetAttribution[] = [
  {
    id: "open-meteo",
    name: "天気予報データ",
    copyrightHolder: "Open-Meteo",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://open-meteo.com",
    modified: false,
  },
  {
    id: "moe-wbgt",
    name: "WBGT (暑さ指数) 予測値",
    copyrightHolder: "環境省 熱中症予防情報サイト",
    licenseUrl: "https://www.wbgt.env.go.jp/sp/index_pre.php",
    licenseLabel: "出典明示の上で利用可 (環境省サイト利用規約)",
    sourceUrl: "https://www.wbgt.env.go.jp/",
    modified: true,
  },
  {
    id: "koto-gomi",
    name: "資源回収・ごみ収集日一覧",
    copyrightHolder: "東京都・江東区",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://portal.data.metro.tokyo.lg.jp",
    modified: true,
  },
  {
    id: "koto-aed",
    name: "AED設置箇所一覧",
    copyrightHolder: "東京都・江東区",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://portal.data.metro.tokyo.lg.jp",
    modified: true,
  },
  {
    id: "koto-toilet",
    name: "公衆トイレ一覧",
    copyrightHolder: "東京都・江東区",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://portal.data.metro.tokyo.lg.jp",
    modified: true,
  },
  {
    id: "koto-events",
    name: "イベント一覧",
    copyrightHolder: "東京都・江東区",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://portal.data.metro.tokyo.lg.jp",
    modified: true,
  },
  {
    id: "tokyo-shelter",
    name: "東京都防災マップ 避難所・避難場所一覧",
    copyrightHolder: "東京都総務局",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl:
      "https://catalog.data.metro.tokyo.lg.jp/dataset/t000003d0000000093",
    modified: true,
  },
  {
    id: "tokyo-water-supply",
    name: "東京都水道局 給水拠点一覧",
    copyrightHolder: "東京都水道局",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl:
      "https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000001",
    modified: true,
  },
  {
    id: "koto-facilities",
    name: "江東区公共施設 (公園・図書館・児童館・区立保育園)",
    copyrightHolder: "東京都・江東区",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl:
      "https://www.city.koto.lg.jp/012107/kuse/koho/opendata/index.html",
    modified: true,
  },
  {
    id: "gsi-tiles",
    name: "地理院タイル",
    copyrightHolder: "国土地理院",
    licenseUrl: "https://maps.gsi.go.jp/development/ichiran.html",
    licenseLabel: "国土地理院コンテンツ利用規約",
    sourceUrl: "https://maps.gsi.go.jp/development/ichiran.html",
    modified: false,
  },
  {
    id: "openstreetmap",
    name: "OpenStreetMap",
    copyrightHolder: "OpenStreetMap contributors",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    licenseLabel: "ODbL",
    sourceUrl: "https://www.openstreetmap.org",
    // The Overpass query filters tags and elementsToMapPoints derives
    // names + reprojects fields, so the published rows are derivative
    // works under ODbL. The Attribution component renders "(一部加工して
    // 利用)" when this flag is true (F-11).
    modified: true,
  },
  {
    id: "toei-bus",
    name: "都営バス GTFS-JP",
    copyrightHolder: "東京都交通局",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    licenseLabel: "CC-BY 4.0",
    sourceUrl: "https://ckan.odpt.org/dataset/b_bus_gtfs_jp-toei",
    // Filtered to routes serving Koto-ku and reshaped into a compact JSON
    // schedule, so the published rows are derivative.
    modified: true,
  },
];

export function getAttribution(id: string): DatasetAttribution | undefined {
  return ATTRIBUTIONS.find((a) => a.id === id);
}
