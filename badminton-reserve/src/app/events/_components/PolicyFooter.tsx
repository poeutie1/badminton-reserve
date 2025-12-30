import Link from "next/link";

type Props = {
  className?: string;
};

export default function PolicyFooter({ className }: Props) {
  const classes = [
    "border-t pt-3 text-center text-xs text-gray-500",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <footer className={classes}>
      <Link href="/privacy" className="underline">
        プライバシーポリシー
      </Link>
    </footer>
  );
}
