"use client";

export function DeleteButton({
  action,
  label,
  confirm: confirmMsg,
}: {
  action: () => Promise<void>;
  label: string;
  confirm: string;
}) {
  return (
    <form
      action={async () => {
        if (window.confirm(confirmMsg)) {
          await action();
        }
      }}
    >
      <button
        type="submit"
        className="text-sm font-medium transition-colors cursor-pointer"
        style={{ color: 'var(--rose)', fontSize: '0.8rem' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#8b2c30')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--rose)')}
      >
        {label}
      </button>
    </form>
  );
}
