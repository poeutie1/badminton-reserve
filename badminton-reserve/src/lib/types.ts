export type Gender = "男性" | "女性" | "未回答";

export type UserProfile = {
  uid: string;
  nickname: string;

  gender: Gender;

  years?: number; // バドミントン歴

  lineUserId?: string; // 通知用
  image?: string;
};

export type GuestParticipant = {
  id: string; // "guest-{timestamp}"
  name: string;
  gender?: Gender;
  years?: number;
  addedBy: string; // uid of admin/member who registered
  addedAt: string; // ISO timestamp
};

export type Event = {
  id: string;
  title: string;
  date: string; // ISO
  capacity: number;
  participants: string[]; // uid[]
  waitlist: string[]; // uid[]
  guests: GuestParticipant[];
  createdBy: string; // uid
  status: "open" | "closed";
};
