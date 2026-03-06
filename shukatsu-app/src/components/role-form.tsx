"use client";

type RoleData = {
  name?: string;
  location?: string | null;
  salaryRange?: string | null;
  memo?: string | null;
};

export function RoleForm({
  action,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: RoleData;
}) {
  const d = defaultValues;
  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div>
        <label className="form-label">
          職種名 <span style={{ color: 'var(--vermillion)' }}>*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={d?.name}
          className="form-input"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">勤務地</label>
          <input
            name="location"
            defaultValue={d?.location ?? ""}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">年収/レンジ</label>
          <input
            name="salaryRange"
            defaultValue={d?.salaryRange ?? ""}
            placeholder="例: 400-600万円"
            className="form-input"
          />
        </div>
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
