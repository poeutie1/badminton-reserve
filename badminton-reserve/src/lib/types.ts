export type Level =
  | "初心者"
  | "初級"
  | "中級"
  | "上級"
  | "公式大会3部で入賞2回以上あり"; // 画像に合わせて

export type Gender = "男性" | "女性" | "未回答";

export type UserProfile = {
  uid: string;
  nickname: string;
  level: Level;
  gender: Gender;
  message?: string; // 一言
  years?: number; // バドミントン歴
  hometown?: string;
  likes?: string; // 好きな事・物・人
  lineUserId?: string; // 通知用
  image?: string;
};

export type Event = {
  id: string;
  title: string;
  date: string; // ISO
  capacity: number;
  participants: string[]; // uid[]
  waitlist: string[]; // uid[]
  createdBy: string; // uid
  status: "open" | "closed";
};
