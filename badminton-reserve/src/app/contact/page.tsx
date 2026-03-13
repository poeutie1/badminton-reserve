import ContactForm from "./ContactForm";

export const metadata = {
  title: "お問い合わせ | SENKAWA BADMINTON",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">お問い合わせ</h1>
        <p className="mt-2 text-sm text-black dark:text-gray-100">
          練習会に関するご質問、ご相談などはこちらのフォームからお送りください。返信はメールで行います。
        </p>
      </div>
      <ContactForm />
    </div>
  );
}
