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
];

export function getAttribution(id: string): DatasetAttribution | undefined {
  return ATTRIBUTIONS.find((a) => a.id === id);
}
