/**
 * 日の出基地の乗員名簿。トップページの名簿と、各セッションの場面写真で共有する。
 * 写真は apps/docs/public/crew/ に、<id>.jpg の名前で置く（1122×1402、JPEG）。
 */
export type CrewId =
  | "base-commander"
  | "ground-control"
  | "electrician"
  | "medic"
  | "eva-worker-a"
  | "eva-worker-b"
  | "life-support"
  | "robot-operator"
  | "systems-engineer"
  | "rover-mb-01";

export type CrewMember = Readonly<{
  id: CrewId;
  no: string;
  role: string;
  alt: string;
  duty: string;
  system: string;
}>;

export const crew: readonly CrewMember[] = [
  {
    id: "base-commander",
    no: "01",
    role: "基地長",
    alt: "カーキ色の制服にクリップボードを持ち、管制室の窓の外に基地とアンテナを望む基地長",
    duty: "船外作業の開始を承認し、必要なら中止を命じる。",
    system: "7条件を確認して承認",
  },
  {
    id: "ground-control",
    no: "02",
    role: "地上管制",
    alt: "ヘッドセットを着け、夕暮れのパラボラアンテナを背に卓上の計器を見る地上管制員",
    duty: "本社の運用室。作業計画を立て、宇宙天気を監視する。地球との通信は片道1.3秒。",
    system: "作業許可を申請 / フレア警報",
  },
  {
    id: "electrician",
    no: "03",
    role: "電気主任",
    alt: "眼鏡と工具ベルトを着け、配電盤の前で脚立に足を掛けて作業する電気主任",
    duty: "系統区間を遮断し、遮断札を掛ける。札は掛けた者だけが外す。",
    system: "遮断札 LockoutTag",
  },
  {
    id: "medic",
    no: "04",
    role: "医務",
    alt: "白衣に聴診器を掛け、窓の外に地球が見える医務室に立つ医務担当",
    duty: "宇宙服では防ぎきれない放射線の量を「被ばく量」として管理する。",
    system: "判定には渡し、記録には出さない",
  },
  {
    id: "eva-worker-a",
    no: "05",
    role: "船外作業員 a",
    alt: "白い宇宙服で月面に立ち、遠くのローバーとアンテナを見る船外作業員",
    duty: "電気工の資格を持つ4名のうちの1人。2名1組で外に出る。",
    system: "装備点検 / 酸素残時間",
  },
  {
    id: "eva-worker-b",
    no: "06",
    role: "船外作業員 b",
    alt: "地球が昇る空の下、宇宙服で基地の前に立つ船外作業員",
    duty: "作業員 a の相方。互いの装備と酸素残時間を確認してから出る。",
    system: "相方 Buddy",
  },
  {
    id: "life-support",
    no: "07",
    role: "生命維持担当",
    alt: "黄色い作業服で配管とタンクの並ぶ機械室に立つ生命維持担当",
    duty: "酸素、水、温度の設備を保つ。電力の最優先の使い先を預かる。",
    system: "蓄電池 14日分",
  },
  {
    id: "robot-operator",
    no: "08",
    role: "ロボット運用担当",
    alt: "茶色の上着で無線機を持ち、月面のローバーを操作するロボット運用担当",
    duty: "基地内からロボットを操作し、整地、架台、ケーブル敷設を進める。",
    system: "人が出るのは接続・点検・修理",
  },
  {
    id: "systems-engineer",
    no: "09",
    role: "システム担当（あなた）",
    alt: "青い作業服で配電盤の計器を調整し、図面を手にする若いシステム担当",
    duty: "補給便で着任。前任者は同じ便で帰る。作業管理システムを引き継ぐ。",
    system: "参加者",
  },
  {
    id: "rover-mb-01",
    no: "MB-01",
    role: "建設ロボット",
    alt: "月面の基地を背にした MB-01 のラベルが付いた四輪の建設ロボット",
    duty: "整地、架台の設置、ケーブル敷設を行う建設機。",
    system: "名前は付けない",
  },
];

export const crewById = (id: CrewId): CrewMember => {
  const member = crew.find((candidate) => candidate.id === id);
  if (member === undefined) {
    throw new Error(`乗員名簿に ${id} がありません`);
  }
  return member;
};

export const crewPhotoPath = (id: CrewId): string => `/crew/${id}.jpg`;
