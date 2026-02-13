# Backend – Mesajlaşma eklentileri (girlsandguys-api-v10)

Frontend aşağıdaki API ve Pusher event’lerini kullanıyor. Backend’de bunların tanımlanması gerekir.

## 1. Yazıyor (typing) göstergesi

### REST API

**Endpoint:** `POST /api/messages/conversations/{conversationId}/typing`

**Body (JSON):**
```json
{ "typing": true }
```
veya
```json
{ "typing": false }
```

**Davranış:**
- Kullanıcı yazmaya başladığında frontend `typing: true` gönderir.
- Yazmayı bıraktığında veya input’tan çıktığında `typing: false` gönderir.
- Backend, karşı tarafın **private** kanalına (`private-user.{other_user_id}`) aşağıdaki event’i tetiklemelidir.

### Pusher event (karşı kullanıcıya iletim)

**Kanal:** `private-user.{alıcı_user_id}` (alıcı = konuşmadaki diğer kullanıcı)

**Event adı:** `user-typing`

**Payload örneği:**
```json
{
  "conversation_id": 123,
  "user_id": 456,
  "username": "gonderen_kullanici_adi",
  "typing": true
}
```
`typing: false` gönderildiğinde aynı yapıda `"typing": false` ile tetiklenmeli (isteğe bağlı; frontend bir süre sonra göstergiyi kendisi kapatıyor).

---

## 2. Sekme başlığı (document.title)

Sekme başlığı tamamen frontend’de yönetiliyor. Yeni mesaj geldiğinde (mevcut `new-message` Pusher event’i) sayfa sekmesi görünür değilse başlık “Yeni mesajınız var - Herkesler Soruyor” yapılıyor; kullanıcı sekmeye dönünce tekrar “Herkesler Soruyor” yapılıyor. Backend’de ek bir işlem gerekmez.
