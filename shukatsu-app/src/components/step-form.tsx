"use client";

import { toDateInputValue } from "@/lib/utils";

const STEP_TYPES = ["説明会", "ES", "適性検査", "面接", "オファー", "その他"];
const RESULTS = ["未定", "通過", "落ち"];

type StepData = {
  stepType?: string;
  date?: Date;
  result?: string;
  memo?: string | null;
  roleId?: string | null;
};

type RoleOption = {
  id: string;
  name: string;
};

export function StepForm({
  action,
  roles,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  roles: RoleOption[];
  defaultValues?: StepData;
}) {
  const d = defaultValues;
  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">
            ステップ種別 <span style={{ color: 'var(--vermillion)' }}>*</span>
          </label>
          <select
            name="stepType"
            required
            defaultValue={d?.stepType ?? ""}
            className="form-input"
          >
            <option value="" disabled>
              選択してください
            </option>
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">日付（未入力で今日）</label>
          <input
            name="date"
            type="date"
            defaultValue={toDateInputValue(d?.date)}
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">結果</label>
          <select
            name="result"
            defaultValue={d?.result ?? "未定"}
            className="form-input"
          >
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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
        <label className="form-label">メモ</label>
        <textarea
          name="memo"
          rows={3}
          defaultValue={d?.memo ?? ""}
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
