// Static application copy. Dynamic measurements remain owned by their view modules.
const EN = Object.freeze({
  'Sunum Modu': 'Presentation mode',
  'Rota Kurulumu': 'Route setup',
  'Panel': 'Panel',
  'Ayarlar': 'Settings',
  'Dikey Ölçek:': 'Vertical scale:',
  '1× Gerçek Ölçek (Bilimsel 1:1)': '1× true elevation scale (1:1)',
  '2× Görsel Abartı (Sunum Parametresi)': '2× visual exaggeration',
  '3× Görsel Abartı (Eski Sunum Parametresi)': '3× visual exaggeration',
  'Duraklat': 'Pause',
  'Yeniden başlat': 'Restart',
  'Başlangıç seç': 'Select start',
  'Bitiş seç': 'Select destination',
  'Noktaları temizle': 'Clear points',
  'Kapsama sığdır': 'Fit coverage',
  'Mars globali göster': 'Show global Mars',
  'Katmanlar ve harita ayrıntıları': 'Layers and map details',
  'Jeoloji sınırları': 'Geologic contacts',
  'Arşiv sürüş izi': 'Archived rover traverse',
  'Planlanan rota': 'Planned route',
  'Başlangıç': 'Start',
  'Bitiş': 'Destination',
  'Seçilmedi': 'Not selected',
  'Rota tercihi:': 'Route preference:',
  'Dengeli EVA Yürünebilirlik': 'Balanced EVA walkability',
  'En Kısa Mesafe': 'Shortest distance',
  'En Düz / Düşük Eğim': 'Flattest / low slope',
  'Başlangıç ve bitiş seçin': 'Select start and destination',
  'Planlama göstergesi — güvenli rota sertifikası değildir.': 'Planning indicator — not a safe-route certification.',
  'Rota': 'Route',
  'Henüz hesaplanmadı': 'Not calculated yet',
  'Harita açıklaması ve kaynak': 'Map key and source',
  'Kontroller ve simülasyon': 'Controls and simulation',
  'hareket': 'move',
  'duraklat · devam': 'pause · resume',
  'yeniden başlat': 'restart',
  'Simülasyon durumu': 'Simulation state',
  'Senaryo/UI': 'Scenario/UI',
  'Oyuncu konumu (yerel düzlem)': 'Player position (local plane)',
  'Konum (projeksiyonla dönüştürülmüş)': 'Projected coordinates',
  'Senaryo saati': 'Scenario clock',
  'Hareket hızı': 'Movement speed',
  'Rota ilerlemesi': 'Route progress',
  'Yürünen mesafe': 'Distance walked',
  'Koridor yarı genişliği (her iki yan, m)': 'Corridor half-width (each side, m)',
  'Hesaplanan': 'Calculated',
  'Oyuncu konumunda DTM': 'DTM at player position',
  'Kot': 'Elevation',
  'Eğim': 'Slope',
  'Planlanan rota kılavuzu': 'Planned route guidance',
  'Sonraki nokta yönü': 'Direction to next point',
  'Sonraki nokta mesafesi': 'Distance to next point',
  'Mevcut hücre EVA göstergesi': 'Current cell EVA indicator',
  'Mevcut hücre eğimi': 'Current cell slope',
  'Rota kökeni': 'Route provenance',
  'Arşiv ürünü': 'Archive product',
  'Katmanlar ve köken': 'Layers and provenance',
  'Kaynaklar ve sınırlar': 'Sources and limits',
  'Birincil bağlantılar': 'Primary links',
  'Perseverance arşiv fotoğrafları': 'Perseverance archive photos',
  'Görev seçimi': 'Mission setup',
  'Kişi sayısı': 'Crew size',
  'Küreye dön': 'Back to globe',
  'Örnek görevi başlat': 'Start sample mission',
  '2D / 3D Görünüm': '2D / 3D view',
  'Başa Dön': 'Reset',
});

export function createStaticPageLanguage(doc) {
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  return function applyStaticPageLanguage(locale) {
  const root = doc.body;
  if (!root) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.mw-globe-screen, script, style')) continue;
    const original = originalText.get(node) ?? node.textContent;
    const key = original.trim();
    const translated = EN[key];
    if (!translated) continue;
    originalText.set(node, original);
    const current = node.textContent.trim();
    if (current !== key && current !== translated) continue;
    node.textContent = locale === 'en' ? original.replace(key, translated) : original;
  }
  for (const element of root.querySelectorAll('[title], [aria-label], [placeholder]')) {
    if (element.closest('.mw-globe-screen')) continue;
    let values = originalAttributes.get(element);
    if (!values) { values = {}; originalAttributes.set(element, values); }
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const current = element.getAttribute(attr);
      if (current === null) continue;
      const original = values[attr] ?? current;
      const translated = EN[original];
      if (!translated) continue;
      values[attr] = original;
      if (current !== original && current !== translated) continue;
      element.setAttribute(attr, locale === 'en' ? translated : original);
    }
  }
  };
}
