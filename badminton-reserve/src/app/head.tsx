// app/head.tsx
export default function Head() {
  return (
    <>
      {/* 必要があれば title や他の meta もここに */}
      <title>SENKAWA BADMINTON</title>

      {/* ★ AdSense が指定しているコードをそのまま貼る */}
      <script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9264651168388030"
        crossOrigin="anonymous"
      ></script>
    </>
  );
}
