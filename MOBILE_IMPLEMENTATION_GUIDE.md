# Mobil Uygulama Gamification Entegrasyon Rehberi

Bu doküman, web uygulamasında tamamlanan "Oyunlaştırma (Gamification)" özelliklerinin mobil uygulamaya (React Native / Flutter / Native) entegre edilmesi için hazırlanmıştır. Web tarafındaki mantık ve kurallar birebir mobil tarafta da geçerli olmalıdır.

## 1. Genel Bakış

Sistem kullanıcıların etkileşimlerini (Soru sorma, cevap verme, EİG seçilme vb.) puanlayarak (XP) seviye atlamalarını ve rozet kazanmalarını sağlar.

**Temel Özellikler:**
*   XP (Puan) Sistemi ve Seviyeler (Level 1-50+)
*   Anlık Geri Bildirimler (XP Toast & Level Up Modal)
*   Liderlik Tablosu (Leaderboard)
*   Gelişmiş Profil Görünümü (Rozetler, XP Bar)
*   Gelişmiş "En İyi Görüş" (EİG) Sistemi

---

## 2. API ve Veri Yönetimi

Mobil uygulama, mevcut endpoint'leri kullanmaya devam edecek ancak dönen yanıtların içindeki **yeni `gamification` objesini** dinlemelidir.

### 2.1. Gamification Objesi
Soru sorma (`POST /questions`), cevap verme (`POST /answers`) veya EİG seçme (`POST /answers/:id/best`) gibi işlemlerden dönen JSON yanıtında artık `data.gamification` objesi gelebilir.

```json
{
  "status": "success",
  "data": {
    "answer": { ... },
    "gamification": {
      "points_added": 15,          // Kazanılan puan
      "total_xp": 150,             // Toplam puan
      "level": 2,                  // Şu anki seviye
      "level_title": "Çaylak",     // Seviye ünvanı
      "leveled_up": true,          // Seviye atladı mı? (Level Up Modal tetikleyicisi)
      "new_level": 2               // Yeni seviye
    }
  }
}
```

**Mobil İçin Aksiyon:**
*   Her POST işleminden sonra dönen `response.data.data.gamification` kontrol edilmeli.
*   `points_added > 0` ise -> **XP Toast** (Bildirim) göster.
*   `leveled_up: true` ise -> **Level Up Modal** (Tam ekran kutlama) göster.

---

## 3. Özellik Bazlı Uygulama Adımları

### 3.1. Soru Sorma ve Cevap Verme (Instant Feedback)
Kullanıcı bir işlem yaptığında "sessizce" geçmek yerine ödüllendirildiğini hissetmeli.

*   **Soru Sorma Ekranı:** Soru başarılı gönderildiğinde, yönlendirme yapmadan önce (veya hemen sonra) `+XP Puan` animasyonu gösterin. Web'de kullanıcıyı yönlendirmeden önce 2-3 saniye bekletip animasyonu izletiyoruz.
*   **Cevap Verme:** Cevap gönder butonuna basıp başarı yanıtı gelince, input alanının üzerinde veya ekranın ortasında XP kazandığını belirten bir toast mesajı çıkmalı.

### 3.2. En İyi Görüş (EİG) Sistemi (Çok Önemli Kurallar)
Web tarafında EİG mantığı tamamen değişti. Mobilde de bu kurallar **ZORUNLU** uygulanmalı.

**Kural 1: 24 Saat Kuralı**
Soru sorulduktan sonra **24 saat geçmeden** kimse EİG seçemez (Soru sahibi dahil).
*   **Logic:** `(Now - Question.created_at) >= 24 Hours`
*   **UI:** Eğer 24 saat dolmadıysa "Seç" butonu **GİZLENMELİ** (veya disable olup "24 saat dolmalı" yazmalı).

**Kural 2: Cinsiyet Eşitliği (1 Erkek, 1 Kadın)**
Bir soruda **maksimum 2 tane** En İyi Görüş olabilir.
*   1 adet Erkek kullanıcı cevabı.
*   1 adet Kadın kullanıcı cevabı.
*   **Asla 2 Erkek veya 2 Kadın seçilemez.**

**Mobil Logic:**
Soru sahibi bir cevabın yanındaki "Seç" butonunu görecek mi?
1.  Soru `24 saati` doldurdu mu? (Evet)
2.  Bu cevap zaten seçili mi? (Hayır)
3.  Cevabı yazan kişi Soru Sahibi mi? (Hayır - İnsan kendine EİG veremez)
4.  **KRİTİK:** O cinsiyetten başka bir cevap EİG seçilmiş mi?
    *   Cevap sahibi **Erkek** ise: Halihazırda EİG seçilmiş başka bir **Erkek** var mı? Varsa butonu gizle.
    *   Cevap sahibi **Kadın** ise: Halihazırda EİG seçilmiş başka bir **Kadın** var mı? Varsa butonu gizle.

**UI Yerleşimi:**
*   Seçilen En İyi Görüşler, cevap listesinin **EN TEPESİNDE**, diğer cevaplardan ayrı bir blokta ("En İyi Görüşler" başlığı altında) gösterilmeli.
*   Diğer cevaplar bunların altında sıralanmalı.

### 3.3. Profil Sayfası
Profil header alanında yeni metrikler gösterilmeli.

*   **XP Bar:** Kullanıcının mevcut XP'si ve bir sonraki seviyeye kalan XP'yi gösteren bir ilerleme çubuğu (Progress Bar).
    *   Örn: `150 / 300 XP` (%50 dolu bar).
*   **Seviye ve Ünvan:** Avatarın yanında veya altında `Level 5 - Bilge` gibi tasarım.
*   **Rozetler Tabı:** Profilde "Cevaplar", "Sorular" yanına "Rozetler" (Badges) sekmesi eklenmeli.
    *   Kazanılan rozetler renkli active, kazanılmayanlar gri (grayscale) passive gösterilmeli.

### 3.4. Liderlik Tablosu (Leaderboard)
Yeni bir sayfa/ekran olarak eklenmeli. `GET /gamification/leaderboard` endpoint'i kullanılacak.
*   İlk 3 kullanıcı (1. Altın, 2. Gümüş, 3. Bronz) daha büyük ve vurgulu gösterilmeli.
*   Listenin geri kalanı (4-10 arası) altına sıralanmalı.
*   Kullanıcının kendi sırası ayrıca listenin en altında "Senin Sıralaman: #42" gibi sabit bir bar olarak gösterilebilir.

---

## 4. UI Bileşenleri (Component Checklist)

Mobilde oluşturulması gereken yeni bileşenler:

1.  **`XPToast`**: Ekranın üstünden veya altından kayarak gelen, `+15 XP Soru Sorma` yazan, yanında kupa/yıldız ikonu olan, 3 saniye sonra kaybolan bildirim.
2.  **`LevelUpModal`**: Tam ekran, konfetili, kullanıcıyı tebrik eden, "Tebrikler! Seviye 5 Oldun" yazan modal. Kapat butonu ile kapanır.
3.  **`BadgeItem`**: Rozet ikonu ve ismi. Kazanılmamışsa opaklığı düşük ve siyah-beyaz.
4.  **`BestAnswerBadge`**: Cevap kartının üzerinde "En İyi Görüş" olduğunu belirten yeşil/altın renkli etiket.

## 5. Özet Kontrol Listesi

*   [ ] API responselarındaki `gamification` objesini parse etme yapısı kuruldu mu?
*   [ ] Soru sorma sonrası XP animasyonu var mı?
*   [ ] Cevap verme sonrası XP animasyonu var mı?
*   [ ] Profilde XP Bar ve Level bilgisi görünüyor mu?
*   [ ] Rozetler tabı eklendi mi?
*   [ ] Liderlik Tablosu sayfası yapıldı mı?
*   [ ] **En İyi Görüş:** 24 Saat kuralı çalışıyor mu?
*   [ ] **En İyi Görüş:** 1 Erkek / 1 Kadın kuralı çalışıyor mu?
*   [ ] **En İyi Görüş:** Seçilenler listenin en tepesinde mi?

Web tarafındaki tüm deneyim bu maddelerle mobile taşınabilir. 🚀
