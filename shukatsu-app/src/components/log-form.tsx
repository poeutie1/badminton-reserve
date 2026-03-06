"use client";

import { toDateInputValue } from "@/lib/utils";

type LogData = {
  title?: string;
  body?: string | null;
  date?: Date;
  tags?: string | null;
  roleId?: string | null;
};

type RoleOption = {
  id: string;
  name: string;
};

export function LogForm({
  action,
  roles,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  roles: RoleOption[];
  defaultValues?: LogData;
}) {
  const d = defaultValues;
  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div>
        <label className="form-label">
          タイトル <span style={{ color: 'var(--vermillion)' }}>*</span>
        </label>
        <input
          name="title"
          required
          defaultValue={d?.title}
          className="form-input"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">日付（未入力で今日）</label>
          <input
            name="date"
            type="date"
            defaultValue={toDateInputValue(d?.date)}
            className="form-input"
          />
        </div>
        {roles.length > 0 && (
          <div>
            <label className="form-label">職種</label>
            <select
              name="roleId"
              defaultValue={d?.roleId ?? ""}
              className="form-input"
            >
              <option value="">指定なし</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="form-label">タグ</label>
        <input
          name="tags"
          defaultValue={d?.tags ?? ""}
          placeholder="カンマ区切り (例: ES,志望動機)"
          className="form-input"
        />
      </div>

      <div>
        <label className="form-label">本文</label>
        <textarea
          name="body"
          rows={8}
          defaultValue={d?.body ?? ""}
          className="form-input"
          style={{ resize: 'vertical' }}
        />
      </div>

      <button type="submit" className="btn-primary">
        保存する
      </button>
    </form>
  );
}
