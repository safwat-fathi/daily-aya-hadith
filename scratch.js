async function run() {
  const params = new URLSearchParams({ tafsir_id: '91', verse_key: '1:1' });
  const urls = [
    `https://api.quran.com/api/v4/quran/tafsirs/91?verse_key=1:1`,
    `https://api.quran.com/api/v4/tafsirs/91/by_ayah/1:1`,
    `https://api.quran.com/api/v4/tafsirs/91/by_key/1:1`,
    `https://api.quran.com/api/v4/verses/by_key/1:1?tafsirs=91&translations=20`
  ];
  for (const url of urls) {
    console.log("Fetching", url);
    const res = await fetch(url);
    if (!res.ok) { console.log(res.status); continue; }
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2).slice(0, 300));
  }
}
run();
