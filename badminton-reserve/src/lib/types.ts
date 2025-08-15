export type Gender = "男性" | "女性" | "未回答";

export type UserProfile = {
  uid: string;
  nickname: string;

  gender: Gender;

  years?: number; // バドミントン歴

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
