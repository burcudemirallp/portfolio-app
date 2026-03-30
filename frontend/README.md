# Portfolio Tracker - Frontend

React + Vite ile oluşturulmuş modern portfolio dashboard.

## 🚀 Başlangıç

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. Geliştirme Sunucusunu Başlat
```bash
npm run dev
```

Frontend: http://localhost:5173

## 📦 Kullanılan Teknolojiler

- **React 18** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Recharts** - Grafikler
- **Axios** - API calls
- **Lucide React** - İkonlar

## 🎨 Özellikler

- 📊 Dashboard özeti (toplam değer, kar/zarar)
- 📈 Pasta grafikleri (varlık tipi, piyasa dağılımı)
- 📋 Pozisyon tablosu
- 🏆 En çok kazananlar/kaybedenler
- 🔄 Otomatik fiyat güncelleme butonu
- ⚠️ Veri uyarıları

## 🔧 Backend Bağlantısı

Backend API: http://127.0.0.1:8000

Backend'in çalıştığından emin olun:
```bash
cd ..
source .venv/bin/activate
uvicorn app.main:app --reload
```
