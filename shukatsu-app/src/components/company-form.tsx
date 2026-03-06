"use client";

import { useState } from "react";

type CompanyData = {
  name?: string;
  url?: string | null;
  industry?: string | null;
  tier?: number;
  memo?: string | null;
  startingSalary?: number | null;
  salaryNote?: string | null;
  loginUrl?: string | null;
  loginId?: string | null;
  passwordNote?: string | null;
  encryptedPassword?: string | null;
};

export function CompanyForm({
  action,
  defaultValues,
  decryptedPassword,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: CompanyData;
  decryptedPassword?: string;
}) {
  const d = defaultValues;
  const hasExistingPassword = !!d?.encryptedPassword;
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(!hasExistingPassword);

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {/* keepPassword: 既存パスワードを変更しない場合 */}
      {hasExistingPassword && !changePassword && (
        <input type="hidden" name="keepPassword" value="1" />
      )}

      <div>
        <label className="form-label">
          会社名 <span style={{ color: 'var(--vermillion)' }}>*</span>
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
          <label className="form-label">企業URL</label>
          <input
            name="url"
            type="url"
            defaultValue={d?.url ?? ""}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">業界</label>
          <input
            name="industry"
            defaultValue={d?.industry ?? ""}
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="form-label">Tier (1-5)</label>
          <select
            name="tier"
            defaultValue={d?.tier ?? 3}
            className="form-input"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} - {"★".repeat(6 - n)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">初任給（万円）</label>
          <input
            name="startingSalary"
            type="number"
            defaultValue={d?.startingSalary ?? ""}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">給与備考</label>
          <input
            name="salaryNote"
            defaultValue={d?.salaryNote ?? ""}
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

      <fieldset className="form-fieldset">
        <legend>ログイン情報</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">ログインURL</label>
            <input
              name="loginUrl"
              type="url"
              defaultValue={d?.loginUrl ?? ""}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">ログインID</label>
            <input
              name="loginId"
              defaultValue={d?.loginId ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="form-label">パスワード</label>
          {hasExistingPassword && !changePassword ? (
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                保存済み
              </span>
              <button
                type="button"
                onClick={() => setChangePassword(true)}
                className="text-sm font-medium hover:underline"
                style={{ color: 'var(--vermillion)' }}
              >
                変更する
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                defaultValue={decryptedPassword ?? ""}
                placeholder="パスワードを入力"
                className="form-input"
                style={{ paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--ink-faint)' }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="form-label">パスワード管理メモ</label>
          <input
            name="passwordNote"
            defaultValue={d?.passwordNote ?? ""}
            placeholder="例: 1Passwordにも保存済み"
            className="form-input"
          />
        </div>
      </fieldset>

      <button type="submit" className="btn-primary">
        保存する
      </button>
    </form>
  );
}
